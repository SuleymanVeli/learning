"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Modal } from "@/src/components/ui/Modal";
import { Select } from "@/src/components/ui/Select";
import { Textarea } from "@/src/components/ui/Textarea";
import { TaskContentEditor } from "@/src/components/admin/TaskContentEditor";
import { TaskOptionEditor } from "@/src/components/admin/TaskOptionEditor";
import { TaskContent } from "@/src/components/tasks/TaskContent";
import { TaskOptionContent } from "@/src/components/tasks/TaskOptionContent";
import { requestJson } from "@/src/lib/client-api";
import type { TaskContentBlock, TaskOption } from "@/src/models/Task";

interface QuizOption {
  id: string;
  title: string;
}

interface TaskItem {
  _id: string;
  title: string;
  prompt: string;
  contentBlocks?: TaskContentBlock[];
  type: TaskType;
  options: TaskOption[];
  correctAnswer: string | string[];
  explanation?: string;
  difficulty: "easy" | "medium" | "hard";
  quizzes: QuizOption[];
}

interface QuizItem {
  _id: string;
  title: string;
  taskIds: string[];
}

type TaskType = "single_choice" | "multiple_choice" | "drag_drop" | "short_answer";
type TaskModal = { type: "create" } | { type: "edit"; task: TaskItem };

export function TaskManagement() {
  return (
    <RoleGate role="admin">
      {(user) => <TaskManagementContent name={user.name} />}
    </RoleGate>
  );
}

function TaskManagementContent({ name }: { name: string }) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedQuizFilter, setSelectedQuizFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<TaskModal | null>(null);
  const [previewTask, setPreviewTask] = useState<TaskItem | null>(null);
  const [deletingTask, setDeletingTask] = useState<TaskItem | null>(null);

  const load = useCallback(async () => {
    const [taskResult, quizResult] = await Promise.all([
      requestJson<{ tasks: TaskItem[] }>("/api/tasks"),
      requestJson<{ quizzes: QuizItem[] }>("/api/quizzes"),
    ]);
    setTasks(taskResult.tasks);
    setQuizzes(quizResult.quizzes);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      requestJson<{ tasks: TaskItem[] }>("/api/tasks"),
      requestJson<{ quizzes: QuizItem[] }>("/api/quizzes"),
    ])
      .then(([taskResult, quizResult]) => {
        if (cancelled) return;
        setTasks(taskResult.tasks);
        setQuizzes(quizResult.quizzes);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Tapşırıqları yükləmək olmadı.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTasks = tasks.filter((task) => {
    const query = search.trim().toLocaleLowerCase();
    const matchesQuiz =
      selectedQuizFilter === "all" ||
      (selectedQuizFilter === "unassigned"
        ? task.quizzes.length === 0
        : task.quizzes.some((quiz) => quiz.id === selectedQuizFilter));
    return (
      matchesQuiz &&
      (!query ||
        task.title.toLocaleLowerCase().includes(query) ||
        task.prompt.toLocaleLowerCase().includes(query) ||
        task.quizzes.some((quiz) =>
          quiz.title.toLocaleLowerCase().includes(query),
        ))
    );
  });

  async function saveTask(
    event: FormEvent<HTMLFormElement>,
    taskType: TaskType,
    contentBlocks: TaskContentBlock[],
    optionDrafts: TaskOption[],
  ) {
    event.preventDefault();
    if (!modal) return;
    const form = new FormData(event.currentTarget);
    const options =
      taskType === "short_answer"
        ? []
        : optionDrafts
            .map((option) => ({
              ...option,
              text: option.text.trim(),
            }))
            .filter((option) => option.text || option.imageUrl);
    if (
      taskType !== "short_answer" &&
      (options.length < 2 ||
        options.some((option) => !option.text && !option.imageUrl))
    ) {
      setError("Ən azı iki mətn və ya şəkil variantı daxil edin.");
      return;
    }
    let correctAnswer: string | string[];
    if (taskType === "short_answer") {
      correctAnswer = String(form.get("correctText") ?? "").trim();
      if (!correctAnswer) {
        setError("Düzgün yazılı cavabı daxil edin.");
        return;
      }
    } else if (
      taskType === "single_choice" ||
      taskType === "multiple_choice"
    ) {
      const selected = form
        .getAll("correctOption")
        .filter((value): value is string => typeof value === "string");
      if (
        selected.length === 0 ||
        (taskType === "single_choice" && selected.length !== 1) ||
        selected.some((id) => !options.some((option) => option.id === id))
      ) {
        setError(
          taskType === "single_choice"
            ? "Düzgün variantı seçin."
            : "Ən azı bir düzgün variant seçin.",
        );
        return;
      }
      correctAnswer =
        taskType === "single_choice" ? selected[0] : selected;
    } else {
      const indexes = String(
        form.get("correctSequence") ?? "",
      )
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (
        options.length < 2 ||
        indexes.length === 0 ||
        indexes.some(
          (index) =>
            !Number.isInteger(index) ||
            index < 1 ||
            index > options.length,
        ) ||
        new Set(indexes).size !== indexes.length ||
        indexes.length !== options.length
      ) {
        setError("Düzgün ardıcıllıqda hər variant bir dəfə olmalıdır.");
        return;
      }
      correctAnswer = indexes.map((index) => options[index - 1].id);
    }

    const quizId = String(form.get("quizId") ?? "");
    if (!quizId) {
      setError("Tapşırığın aid olacağı quiz-i seç.");
      return;
    }
    const prompt = contentBlocks
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (
      contentBlocks.length > 100 ||
      contentBlocks.filter((block) => block.type === "image").length > 20 ||
      contentBlocks
        .filter((block) => block.type === "text")
        .reduce((length, block) => length + block.text.length, 0) > 10000 ||
      (!prompt &&
        !contentBlocks.some((block) => block.type === "image"))
    ) {
      setError("Kontentə mətn və ya şəkil əlavə edin (maksimum 10 000 simvol).");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const isEdit = modal.type === "edit";
      await requestJson(
        isEdit ? `/api/tasks/${modal.task._id}` : "/api/tasks",
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify({
            title: form.get("title"),
            prompt,
            contentBlocks,
            type: taskType,
            options,
            correctAnswer,
            explanation: form.get("explanation"),
            difficulty: form.get("difficulty"),
            quizId,
          }),
        },
      );
      setModal(null);
      setNotice(isEdit ? "Tapşırıq yeniləndi." : "Tapşırıq quizə əlavə olundu.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Tapşırığı yadda saxlamaq olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteTask() {
    if (!deletingTask) return;
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/tasks/${deletingTask._id}`, { method: "DELETE" });
      setNotice(
        `“${deletingTask.title}” tapşırığı silindi və quizlərdən çıxarıldı.`,
      );
      setDeletingTask(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Tapşırığı silmək olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openTask(next: TaskModal) {
    setError("");
    setNotice("");
    setModal(next);
  }

  return (
    <DashboardShell name={name} role="admin">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-brand-700">
            İdarəetmə / Tapşırıqlar
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Tapşırıqlar</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Hər yeni tapşırığı mütləq bir quizə əlavə et. Tapşırıqlar bir neçə
            quizdə təkrar istifadə oluna bilər.
          </p>
        </div>
        <Button
          onClick={() => openTask({ type: "create" })}
          disabled={!quizzes.length}
        >
          Yeni tapşırıq
        </Button>
      </div>

      {error && <InlineNotice message={error} isError />}
      {notice && <InlineNotice message={notice} />}

      {!quizzes.length && !loading && (
        <Card className="mb-5 border-warning-100 bg-warning-50">
          <p className="font-semibold">Əvvəlcə quiz yarat</p>
          <p className="mt-1 text-sm text-muted">
            Tapşırıq mütləq quizə aid olmalıdır. Tapşırıq əlavə etməzdən əvvəl
            quizlər səhifəsində quiz yarat.
          </p>
          <a
            href="/admin/quizzes"
            className="mt-3 inline-block text-sm font-semibold text-brand-700"
          >
            Quizlərə keç →
          </a>
        </Card>
      )}

      <Card className="p-0">
        <div className="flex flex-col gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-xl font-bold">Tapşırıq siyahısı</h2>
            <p className="mt-1 text-sm text-muted">
              {filteredTasks.length} / {tasks.length} tapşırıq · yarat, redaktə et
              və sil
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Quiz üzrə süzgəc"
              value={selectedQuizFilter}
              onChange={(event) =>
                setSelectedQuizFilter(event.currentTarget.value)
              }
            >
              <option value="all">Bütün quizlər</option>
              <option value="unassigned">Heç bir quizdə yoxdur</option>
              {quizzes.map((quiz) => (
                <option key={quiz._id} value={quiz._id}>
                  {quiz.title}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Tapşırıqlarda axtar"
              placeholder="Ad, sual və ya quizlə axtar"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </div>
        </div>
        {loading ? (
          <p className="px-5 py-14 text-center text-sm text-muted">
            Tapşırıqlar yüklənir...
          </p>
        ) : filteredTasks.length ? (
          <div className="divide-y divide-border">
            {filteredTasks.map((task) => (
              <article
                key={task._id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold">{task.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {task.prompt ||
                      (task.contentBlocks?.some(
                        (block) => block.type === "image",
                      )
                        ? "Şəkilli tapşırıq"
                        : "")}
                  </p>
                  {task.contentBlocks?.some((block) => block.type === "image") && (
                    <span className="mt-2 inline-block rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted">
                      Şəkilli kontent
                    </span>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                      {typeLabel(task.type)}
                    </span>
                    <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-muted">
                      {difficultyLabel(task.difficulty)}
                    </span>
                    {task.quizzes.map((quiz) => (
                      <span
                        key={quiz.id}
                        className="rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-600"
                      >
                        {quiz.title}
                      </span>
                    ))}
                    {!task.quizzes.length && (
                      <span className="rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-600">
                        Quizə əlavə edilməyib
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPreviewTask(task)}
                  >
                    Ön baxış
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openTask({ type: "edit", task })}
                  >
                    Redaktə
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setDeletingTask(task);
                      setError("");
                    }}
                  >
                    Sil
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-5 py-16 text-center">
            <h3 className="font-bold">
              {search || selectedQuizFilter !== "all"
                ? "Uyğun tapşırıq tapılmadı"
                : "Hələ tapşırıq əlavə edilməyib"}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {search || selectedQuizFilter !== "all"
                ? "Quiz süzgəcini və ya axtarış sözünü dəyişib yenidən yoxla."
                : "Yeni tapşırıq yaratmaq üçün yuxarıdakı düymədən istifadə et."}
            </p>
          </div>
        )}
      </Card>

      <TaskFormModal
        key={`${modal?.type ?? "closed"}-${
          modal?.type === "edit" ? modal.task._id : ""
        }`}
        modal={modal}
        quizzes={quizzes}
        saving={saving}
        error={error}
        onClose={() => setModal(null)}
        onSubmit={saveTask}
      />
      <TaskPreviewModal
        key={previewTask?._id ?? "closed"}
        task={previewTask}
        onClose={() => setPreviewTask(null)}
        onSave={async (task, options, correctAnswers) => {
          const correctAnswer =
            task.type === "multiple_choice" || task.type === "drag_drop"
              ? correctAnswers
              : task.type === "short_answer"
                ? task.correctAnswer
                : correctAnswers[0] ?? "";
          await requestJson(`/api/tasks/${task._id}`, {
            method: "PATCH",
            body: JSON.stringify({
              title: task.title,
              prompt: task.prompt,
              contentBlocks:
                task.contentBlocks?.length
                  ? task.contentBlocks
                  : [{ type: "text", text: task.prompt }],
              type: task.type,
              options,
              correctAnswer,
              explanation: task.explanation,
              difficulty: task.difficulty,
              quizId: task.quizzes[0]?.id,
            }),
          });
          setPreviewTask(null);
          setNotice("Ön baxışdakı dəyişikliklər yadda saxlanıldı.");
          await load();
        }}
      />
      <Modal
        open={deletingTask !== null}
        title="Tapşırığı sil"
        description="Tapşırıq quizlərdən çıxarılacaq. Əvvəllər dərc edilmiş canlı dərs və ev tapşırıqlarındakı sual və nəticələr saxlanacaq."
        onClose={() => setDeletingTask(null)}
      >
        {deletingTask && (
          <>
            {error && <InlineNotice message={error} isError />}
            <p className="rounded-xl bg-surface-muted px-4 py-3 font-semibold">
              {deletingTask.title}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeletingTask(null)}>
                Ləğv et
              </Button>
              <Button
                variant="danger"
                disabled={saving}
                onClick={() => void confirmDeleteTask()}
              >
                {saving ? "Silinir..." : "Tapşırığı sil"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </DashboardShell>
  );
}

function TaskPreviewModal({
  task,
  onClose,
  onSave,
}: {
  task: TaskItem | null;
  onClose: () => void;
  onSave: (
    task: TaskItem,
    options: TaskOption[],
    correctAnswers: string[],
  ) => Promise<void>;
}) {
  const [options, setOptions] = useState<TaskOption[]>(() =>
    task?.options.map((option) => ({ ...option })) ?? [],
  );
  const [correctAnswers, setCorrectAnswers] = useState<string[]>(() => {
    if (!task || task.type === "short_answer") return [];
    return Array.isArray(task.correctAnswer)
      ? task.correctAnswer.filter(
          (answer): answer is string => typeof answer === "string",
        )
      : typeof task.correctAnswer === "string"
        ? [task.correctAnswer]
        : [];
  });
  const [dragSequence, setDragSequence] = useState(() => {
    if (!task || task.type !== "drag_drop" || !Array.isArray(task.correctAnswer)) {
      return "";
    }
    return task.correctAnswer
      .map(
        (answer) =>
          task.options.findIndex((option) => option.id === answer) + 1,
      )
      .join(", ");
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleCorrect(optionId: string) {
    setCorrectAnswers((current) =>
      task?.type === "multiple_choice"
        ? current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId]
        : current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [optionId],
    );
  }

  async function save() {
    if (!task) return;
    let selectedCorrectAnswers = correctAnswers;
    if (task.type === "drag_drop") {
      const indexes = dragSequence
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (
        indexes.length !== options.length ||
        indexes.some(
          (index) =>
            !Number.isInteger(index) || index < 1 || index > options.length,
        ) ||
        new Set(indexes).size !== indexes.length
      ) {
        setError("Düzgün ardıcıllıqda hər variant bir dəfə olmalıdır.");
        return;
      }
      selectedCorrectAnswers = indexes.map((index) => options[index - 1].id);
    } else if (
      task.type === "single_choice" &&
      selectedCorrectAnswers.length !== 1
    ) {
      setError("Düzgün variantı seçin.");
      return;
    } else if (
      task.type === "multiple_choice" &&
      selectedCorrectAnswers.length === 0
    ) {
      setError("Ən azı bir düzgün variant seçin.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(task, options, selectedCorrectAnswers);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Ön baxışdakı dəyişiklikləri yadda saxlamaq olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={task !== null}
      title="Şagird görünüşündə ön baxış"
      description="Bu, şagirdin tapşırıqda görəcəyi məzmundur. Cavab vermək söndürülüb."
      size="full"
      onClose={onClose}
    >
      {task && (
        <div className="student-theme mx-auto w-full max-w-5xl">
          <Card className="student-content-card student-homework-detail overflow-hidden p-0">
            <div
              role="tablist"
              aria-label="Tapşırıq ön baxışındakı suallar"
              className="student-question-tabs flex flex-wrap gap-2 px-4 py-4"
            >
              <button
                type="button"
                role="tab"
                aria-selected="true"
                className="student-question-tab is-selected"
              >
                1
              </button>
            </div>
            <div className="student-homework-content">
              <h3 className="break-words text-xl font-black leading-snug sm:text-2xl">
                {task.title}
              </h3>
              <TaskContent
                className="task-content-html"
                contentBlocks={task.contentBlocks}
                prompt={task.prompt}
              />
            </div>
            <div className="student-homework-answer">
              {task.type === "short_answer" ? (
                <Input
                  label="Cavabın"
                  placeholder="Cavabını yaz"
                  disabled
                  aria-label="Şagirdin yazılı cavab sahəsi"
                />
              ) : task.type === "drag_drop" ? (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">
                    Cavab ardıcıllığını qurmaq üçün variantlara sıra ilə toxun
                  </legend>
                  <div
                    className={
                      options.some((option) => option.imageUrl)
                        ? "grid grid-cols-2 gap-2"
                        : "grid gap-2 sm:grid-cols-2"
                    }
                  >
                    {options.map((option) => (
                      <div
                        key={option.id}
                        className="student-answer-option min-h-14 w-full rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold"
                      >
                        <TaskOptionContent option={option} />
                        <OptionDimensions
                          option={option}
                          disabled={saving}
                          onChange={(updated) =>
                            setOptions((current) =>
                              current.map((item) =>
                                item.id === option.id ? updated : item,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <fieldset className="space-y-2">
                  <legend className="mb-2 font-medium">
                    {task.type === "multiple_choice"
                      ? "Cavabları seç"
                      : "Bir cavab seç"}
                  </legend>
                  <div
                    className={
                      options.some((option) => option.imageUrl)
                        ? "grid grid-cols-2 gap-2"
                        : "space-y-2"
                    }
                  >
                  {options.map((option) => (
                    <div
                      key={option.id}
                      className="student-answer-option flex min-h-14 min-w-0 cursor-default items-start gap-3 rounded-2xl border-2 px-4 py-3 font-bold"
                    >
                      <label className="flex shrink-0 items-center">
                        <input
                          type="checkbox"
                          checked={correctAnswers.includes(option.id)}
                          onChange={() => toggleCorrect(option.id)}
                          aria-label={`${option.id} düzgün variantdır`}
                          className="h-5 w-5 accent-sky-600"
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <TaskOptionContent option={option} />
                        <OptionDimensions
                          option={option}
                          disabled={saving}
                          onChange={(updated) =>
                            setOptions((current) =>
                              current.map((item) =>
                                item.id === option.id ? updated : item,
                              ),
                            )
                          }
                        />
                      </div>
                    </div>
                  ))}
                  </div>
                </fieldset>
              )}
              {task.type === "drag_drop" && (
                <Input
                  label="Düzgün ardıcıllığın variant nömrələri"
                  value={dragSequence}
                  disabled={saving}
                  placeholder="Məsələn: 2, 1, 3"
                  onChange={(event) =>
                    setDragSequence(event.currentTarget.value)
                  }
                />
              )}
              <div className="mt-6 grid grid-cols-3 gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="student-flat-button h-10 w-full rounded-xl px-2"
                  disabled
                >
                  ← Əvvəlki
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="student-flat-button h-10 w-full px-2"
                  disabled
                >
                  Təsdiqlə
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="student-flat-button h-10 w-full rounded-xl px-2"
                  disabled
                >
                  Növbəti →
                </Button>
              </div>
              {error && (
                <p role="alert" className="mt-4 text-sm text-danger-600">
                  {error}
                </p>
              )}
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? "Yadda saxlanılır..." : "Dəyişiklikləri saxla"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Modal>
  );
}

function OptionDimensions({
  option,
  disabled,
  onChange,
}: {
  option: TaskOption;
  disabled: boolean;
  onChange: (option: TaskOption) => void;
}) {
  if (!option.imageUrl) return null;
  return (
    <div className="mt-3 grid max-w-sm grid-cols-2 gap-2">
      <Input
        label="Eni (px)"
        type="number"
        min={1}
        max={4096}
        value={option.imageWidthPx ?? 240}
        disabled={disabled}
        onChange={(event) =>
          onChange({
            ...option,
            imageWidthPx: Number(event.currentTarget.value),
          })
        }
      />
      <Input
        label="Hündürlüyü (px)"
        type="number"
        min={1}
        max={4096}
        value={option.imageHeightPx ?? 160}
        disabled={disabled}
        onChange={(event) =>
          onChange({
            ...option,
            imageHeightPx: Number(event.currentTarget.value),
          })
        }
      />
    </div>
  );
}

function TaskFormModal({
  modal,
  quizzes,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  modal: TaskModal | null;
  quizzes: QuizItem[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    type: TaskType,
    contentBlocks: TaskContentBlock[],
    options: TaskOption[],
  ) => void;
}) {
  const task = modal?.type === "edit" ? modal.task : null;
  const [taskType, setTaskType] = useState<TaskType>(
    task?.type ?? "single_choice",
  );
  const [contentBlocks, setContentBlocks] = useState<TaskContentBlock[]>(() =>
    task?.contentBlocks?.length
      ? task.contentBlocks
      : [{ type: "text", text: task?.prompt ?? "" }],
  );

  const [options, setOptions] = useState<TaskOption[]>(() =>
    task?.options.length
      ? task.options.map((option) => ({ ...option }))
      : [
          { id: "option-1", text: "" },
          { id: "option-2", text: "" },
        ],
  );
  const [correctOptions, setCorrectOptions] = useState<string[]>(() => {
    if (!task || task.type === "short_answer") return [];
    return Array.isArray(task.correctAnswer)
      ? task.correctAnswer.filter(
          (answer): answer is string => typeof answer === "string",
        )
      : typeof task.correctAnswer === "string"
        ? [task.correctAnswer]
        : [];
  });
  const shortAnswer =
    task?.type === "short_answer" && typeof task.correctAnswer === "string"
      ? task.correctAnswer
      : "";
  const quizId = task?.quizzes[0]?.id ?? "";

  return (
    <Modal
      open={modal !== null}
      title={task ? "Tapşırığı redaktə et" : "Yeni tapşırıq"}
      description="Tapşırığın daxil ediləcəyi quiz mütləq seçilməlidir."
      onClose={onClose}
    >
      {modal && (
        <form
          key={task?._id ?? "new"}
          className="space-y-4"
          onSubmit={(event) => onSubmit(event, taskType, contentBlocks, options)}
        >
          {error && <InlineNotice message={error} isError />}
          <Input
            autoFocus
            label="Tapşırığın adı"
            name="title"
            defaultValue={task?.title ?? ""}
            maxLength={200}
            required
          />
          <TaskContentEditor
            initialBlocks={task?.contentBlocks}
            prompt={task?.prompt ?? ""}
            disabled={saving}
            onChange={setContentBlocks}
          />
          <Select
            label="Tapşırıq növü"
            value={taskType}
            onChange={(event) =>
              setTaskType(event.currentTarget.value as TaskType)
            }
          >
            <option value="single_choice">Bir düzgün cavab</option>
            <option value="multiple_choice">Bir neçə düzgün cavab</option>
            <option value="drag_drop">Ardıcıllıq qur</option>
            <option value="short_answer">Yazılı cavab</option>
          </Select>
          {taskType === "short_answer" ? (
            <Input
              label="Düzgün yazılı cavab"
              name="correctText"
              defaultValue={shortAnswer}
              maxLength={2000}
              required
            />
          ) : (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-foreground">
                Cavab variantları
              </legend>
              <p className="text-xs leading-5 text-muted">
                Variant mətnini yazın və ya şəkil əlavə edin. Şəklin faylını
                seçə, mübadilə buferindən yapışdıra və ölçülərini piksel ilə
                təyin edə bilərsiniz.
              </p>
              {options.map((option, index) => (
                <TaskOptionEditor
                  key={option.id}
                  option={option}
                  label={`Variant ${index + 1}`}
                  correct={correctOptions.includes(option.id)}
                  correctInputType={
                    "checkbox"
                  }
                  showCorrectControl={taskType !== "drag_drop"}
                  disabled={saving}
                  onChange={(nextOption) =>
                    setOptions((current) =>
                      current.map((item) =>
                        item.id === option.id ? nextOption : item,
                      ),
                    )
                  }
                  onCorrectChange={() =>
                    setCorrectOptions((current) =>
                      taskType === "multiple_choice"
                        ? current.includes(option.id)
                          ? current.filter((id) => id !== option.id)
                          : [...current, option.id]
                        : current.includes(option.id)
                          ? current.filter((id) => id !== option.id)
                          : [option.id],
                    )
                  }
                  onRemove={
                    options.length > 2
                      ? () => {
                          setOptions((current) =>
                            current.filter((item) => item.id !== option.id),
                          );
                          setCorrectOptions((current) =>
                            current.filter((id) => id !== option.id),
                          );
                        }
                      : undefined
                  }
                />
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() =>
                  setOptions((current) => [
                    ...current,
                    {
                      id: `option-${crypto.randomUUID()}`,
                      text: "",
                    },
                  ])
                }
              >
                Variant əlavə et
              </Button>
            </fieldset>
          )}
          {taskType === "drag_drop" && (
            <Input
              label="Düzgün ardıcıllığın nömrələri"
              name="correctSequence"
              defaultValue={
                task?.type === "drag_drop" && Array.isArray(task.correctAnswer)
                  ? task.correctAnswer
                      .map(
                        (answer) =>
                          task.options.findIndex(
                            (option) => option.id === answer,
                          ) + 1,
                      )
                      .join(", ")
                  : ""
              }
              placeholder="Məsələn: 2, 1, 3"
              required
            />
          )}
          <Textarea
            label="İzah (istəyə görə)"
            name="explanation"
            defaultValue={task?.explanation ?? ""}
            rows={2}
            maxLength={5000}
          />
          <Select
            label="Çətinlik"
            name="difficulty"
            defaultValue={task?.difficulty ?? "medium"}
          >
            <option value="easy">Asan</option>
            <option value="medium">Orta</option>
            <option value="hard">Çətin</option>
          </Select>
          <Select
            label="Aid olduğu quiz"
            name="quizId"
            defaultValue={quizId}
            required
          >
            <option value="">Quiz seç</option>
            {quizzes.map((quiz) => (
              <option key={quiz._id} value={quiz._id}>
                {quiz.title}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Ləğv et
            </Button>
            <Button type="submit" disabled={saving || !quizzes.length}>
              {saving
                ? "Yadda saxlanılır..."
                : task
                  ? "Dəyişiklikləri saxla"
                  : "Tapşırığı əlavə et"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function typeLabel(type: TaskType) {
  return {
    single_choice: "Bir cavab",
    multiple_choice: "Çox cavab",
    drag_drop: "Ardıcıllıq",
    short_answer: "Yazılı cavab",
  }[type];
}

function difficultyLabel(difficulty: TaskItem["difficulty"]) {
  return { easy: "Asan", medium: "Orta", hard: "Çətin" }[difficulty];
}

function InlineNotice({
  message,
  isError = false,
}: {
  message: string;
  isError?: boolean;
}) {
  return (
    <p
      role={isError ? "alert" : "status"}
      className={`mb-5 rounded-xl px-4 py-3 text-sm ${
        isError
          ? "border border-danger-100 bg-danger-50 text-danger-600"
          : "border border-success-100 bg-success-50 text-success-600"
      }`}
    >
      {message}
    </p>
  );
}
