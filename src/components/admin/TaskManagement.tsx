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
import { requestJson } from "@/src/lib/client-api";
import type { TaskContentBlock } from "@/src/models/Task";

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
  options: { id: string; text: string }[];
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
  ) {
    event.preventDefault();
    if (!modal) return;
    const form = new FormData(event.currentTarget);
    const optionTexts =
      taskType === "short_answer"
        ? []
        : String(form.get("options") ?? "")
            .split("\n")
            .map((option) => option.trim())
            .filter(Boolean);
    const options = optionTexts.map((text, index) => ({
      id: `option-${index + 1}`,
      text,
    }));
    let correctAnswer: string | string[];
    if (taskType === "short_answer") {
      correctAnswer = String(form.get("correctText") ?? "").trim();
      if (!correctAnswer) {
        setError("Düzgün yazılı cavabı daxil edin.");
        return;
      }
    } else if (taskType === "single_choice") {
      const correctIndex = Number(form.get("correctIndex"));
      if (
        optionTexts.length < 2 ||
        !Number.isInteger(correctIndex) ||
        correctIndex < 1 ||
        correctIndex > optionTexts.length
      ) {
        setError("Ən azı iki variant yazın və düzgün variantın nömrəsini seçin.");
        return;
      }
      correctAnswer = `option-${correctIndex}`;
    } else {
      const indexes = String(
        form.get(taskType === "multiple_choice" ? "correctIndexes" : "correctSequence") ??
          "",
      )
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      if (
        optionTexts.length < 2 ||
        indexes.length === 0 ||
        indexes.some(
          (index) =>
            !Number.isInteger(index) ||
            index < 1 ||
            index > optionTexts.length,
        ) ||
        new Set(indexes).size !== indexes.length ||
        (taskType === "drag_drop" && indexes.length !== optionTexts.length)
      ) {
        setError(
          taskType === "drag_drop"
            ? "Düzgün ardıcıllıqda hər variant bir dəfə olmalıdır."
            : "Düzgün variantların nömrələrini vergüllə ayıraraq daxil edin.",
        );
        return;
      }
      correctAnswer = indexes.map((index) => `option-${index}`);
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

  const optionTexts = task?.options.map((option) => option.text).join("\n") ?? "";
  const correctIndexes = Array.isArray(task?.correctAnswer)
    ? task.correctAnswer
        .map((answer) => task.options.findIndex((option) => option.id === answer) + 1)
        .join(", ")
    : "";
  const correctIndex =
    task?.type === "single_choice"
      ? task.options.findIndex((option) => option.id === task.correctAnswer) + 1
      : "";
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
          onSubmit={(event) => onSubmit(event, taskType, contentBlocks)}
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
            <Textarea
              label="Cavab variantları (hər sətirdə bir variant)"
              name="options"
              defaultValue={optionTexts}
              rows={4}
              placeholder={"Birinci cavab\nİkinci cavab"}
              required
            />
          )}
          {taskType === "single_choice" && (
            <Input
              label="Düzgün variantın nömrəsi"
              name="correctIndex"
              type="number"
              min={1}
              defaultValue={correctIndex}
              required
            />
          )}
          {taskType === "multiple_choice" && (
            <Input
              label="Düzgün variantların nömrələri"
              name="correctIndexes"
              defaultValue={task?.type === "multiple_choice" ? correctIndexes : ""}
              placeholder="Məsələn: 1, 3"
              required
            />
          )}
          {taskType === "drag_drop" && (
            <Input
              label="Düzgün ardıcıllığın nömrələri"
              name="correctSequence"
              defaultValue={task?.type === "drag_drop" ? correctIndexes : ""}
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
