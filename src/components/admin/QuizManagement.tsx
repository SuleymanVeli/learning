"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Modal } from "@/src/components/ui/Modal";
import { Select } from "@/src/components/ui/Select";
import { requestJson } from "@/src/lib/client-api";

interface TaskSummary {
  _id: string;
  title: string;
  type: "single_choice" | "multiple_choice" | "drag_drop" | "short_answer";
  difficulty: "easy" | "medium" | "hard";
}

interface QuizItem {
  _id: string;
  title: string;
  taskIds: (TaskSummary | string)[];
}

interface TaskItem extends TaskSummary {
  quizzes: { id: string; title: string }[];
}

type QuizAction = { type: "create" } | { type: "edit"; quiz: QuizItem };
type PickerMode = "add" | "replace";

export function QuizManagement() {
  return (
    <RoleGate role="admin">
      {(user) => <QuizManagementContent name={user.name} />}
    </RoleGate>
  );
}

function QuizManagementContent({ name }: { name: string }) {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quizAction, setQuizAction] = useState<QuizAction | null>(null);
  const [quizTitle, setQuizTitle] = useState("");
  const [pickerMode, setPickerMode] = useState<PickerMode>("add");
  const [pickerQuizId, setPickerQuizId] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteQuiz, setDeleteQuiz] = useState<QuizItem | null>(null);
  const [expandedQuizIds, setExpandedQuizIds] = useState<Set<string>>(
    () => new Set(),
  );

  const load = useCallback(async () => {
    const [quizResult, taskResult] = await Promise.all([
      requestJson<{ quizzes: QuizItem[] }>("/api/quizzes"),
      requestJson<{ tasks: TaskItem[] }>("/api/tasks"),
    ]);
    setQuizzes(quizResult.quizzes);
    setTasks(taskResult.tasks);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      requestJson<{ quizzes: QuizItem[] }>("/api/quizzes"),
      requestJson<{ tasks: TaskItem[] }>("/api/tasks"),
    ])
      .then(([quizResult, taskResult]) => {
        if (cancelled) return;
        setQuizzes(quizResult.quizzes);
        setTasks(taskResult.tasks);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Quizləri yükləmək olmadı.",
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

  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task._id, task])),
    [tasks],
  );
  const filteredQuizzes = quizzes.filter((quiz) =>
    quiz.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const pickerQuiz = quizzes.find((quiz) => quiz._id === pickerQuizId);
  const currentTaskIds = pickerQuiz
    ? pickerQuiz.taskIds.map((task) =>
        typeof task === "string" ? task : task._id,
      )
    : [];
  const availableTasks = tasks.filter(
    (task) =>
      pickerMode === "replace" || !currentTaskIds.includes(task._id),
  );

  function openQuiz(action: QuizAction) {
    setError("");
    setNotice("");
    setQuizAction(action);
    setQuizTitle(action.type === "edit" ? action.quiz.title : "");
  }

  async function saveQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (quizAction?.type === "edit") {
        await requestJson(`/api/quizzes/${quizAction.quiz._id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: quizTitle }),
        });
      } else {
        await requestJson("/api/quizzes", {
          method: "POST",
          body: JSON.stringify({ title: quizTitle }),
        });
      }
      setQuizAction(null);
      setNotice(quizAction?.type === "edit" ? "Quiz yeniləndi." : "Quiz yaradıldı.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Quiz-i saxlamaq olmadı.");
    } finally {
      setSaving(false);
    }
  }

  function openTaskPicker(mode: PickerMode, quiz?: QuizItem) {
    setError("");
    setPickerMode(mode);
    setPickerQuizId(quiz?._id ?? "");
    setSelectedTaskIds(
      mode === "replace" && quiz
        ? quiz.taskIds.map((task) =>
            typeof task === "string" ? task : task._id,
          )
        : [],
    );
    setPickerOpen(true);
  }

  async function saveTaskSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pickerQuizId) {
      setError("Tapşırıqların əlavə ediləcəyi quiz-i seç.");
      return;
    }
    if (!selectedTaskIds.length && pickerMode === "add") {
      setError("Quizə əlavə etmək üçün ən azı bir tapşırıq seç.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`/api/quizzes/${pickerQuizId}`, {
        method: "PATCH",
        body: JSON.stringify(
          pickerMode === "add"
            ? { action: "add-tasks", taskIds: selectedTaskIds }
            : { taskIds: selectedTaskIds },
        ),
      });
      setPickerOpen(false);
      setQuizAction(null);
      setNotice(
        pickerMode === "add"
          ? "Tapşırıqlar quizə əlavə olundu."
          : "Quizin tapşırıq siyahısı yeniləndi.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Tapşırıqları yadda saxlamaq olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(quiz: QuizItem, taskId: string) {
    setSaving(true);
    setError("");
    try {
      const nextTaskIds = quiz.taskIds
        .map((task) => (typeof task === "string" ? task : task._id))
        .filter((id) => id !== taskId);
      await requestJson(`/api/quizzes/${quiz._id}`, {
        method: "PATCH",
        body: JSON.stringify({ taskIds: nextTaskIds }),
      });
      setNotice("Tapşırıq quizdən çıxarıldı.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Tapşırığı quizdən çıxarmaq olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteQuiz() {
    if (!deleteQuiz) return;
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/quizzes/${deleteQuiz._id}`, { method: "DELETE" });
      setNotice(`“${deleteQuiz.title}” quiz-i silindi.`);
      setDeleteQuiz(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Quiz-i silmək olmadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell name={name} role="admin">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-brand-700">
            İdarəetmə / Quizlər
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Quizlər</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Əvvəlcə quiz yarat, sonra həmin quizə tapşırıqlar əlavə et. Eyni
            tapşırığı müxtəlif quizlərdə təkrar istifadə edə bilərsən.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => openTaskPicker("add")}>
            Tapşırıq əlavə et
          </Button>
          <Button onClick={() => openQuiz({ type: "create" })}>
            Quiz yarat
          </Button>
        </div>
      </div>

      {error && <InlineNotice message={error} isError />}
      {notice && <InlineNotice message={notice} />}

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-medium text-muted">Quizlər</p>
          <p className="mt-2 text-3xl font-bold">{quizzes.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium text-muted">Tapşırıqlar</p>
          <p className="mt-2 text-3xl font-bold">{tasks.length}</p>
          <a
            href="/admin/tasks"
            className="mt-2 inline-block text-sm font-semibold text-brand-700"
          >
            Tapşırıq səhifəsinə keç
          </a>
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">Quiz siyahısı</h2>
            <p className="mt-1 text-sm text-muted">
              Quiz seçib tapşırıqları redaktə et və ya tapşırıq əlavə et.
            </p>
          </div>
          <Input
            aria-label="Quizlərdə axtar"
            className="sm:max-w-xs"
            placeholder="Quiz adı ilə axtar"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </div>
        {loading ? (
          <p className="px-5 py-14 text-center text-sm text-muted">
            Quizlər yüklənir...
          </p>
        ) : filteredQuizzes.length ? (
          <div className="divide-y divide-border">
            {filteredQuizzes.map((quiz) => (
              <article key={quiz._id} className="p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold">{quiz.title}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {quiz.taskIds.length} tapşırıq
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-expanded={expandedQuizIds.has(quiz._id)}
                      aria-controls={`quiz-tasks-${quiz._id}`}
                      onClick={() =>
                        setExpandedQuizIds((current) => {
                          const next = new Set(current);
                          if (next.has(quiz._id)) next.delete(quiz._id);
                          else next.add(quiz._id);
                          return next;
                        })
                      }
                    >
                      {expandedQuizIds.has(quiz._id)
                        ? "Tapşırıqları gizlət"
                        : "Tapşırıqlara bax"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openTaskPicker("add", quiz)}
                    >
                      Tapşırıq əlavə et
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openQuiz({ type: "edit", quiz })}
                    >
                      Redaktə
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setDeleteQuiz(quiz);
                        setError("");
                      }}
                    >
                      Sil
                    </Button>
                  </div>
                </div>
                {expandedQuizIds.has(quiz._id) && quiz.taskIds.length ? (
                  <ol
                    id={`quiz-tasks-${quiz._id}`}
                    className="mt-4 space-y-2"
                  >
                    {quiz.taskIds.map((taskRef, index) => {
                      const id =
                        typeof taskRef === "string" ? taskRef : taskRef._id;
                      const task =
                        typeof taskRef === "string"
                          ? taskById.get(taskRef)
                          : taskRef;
                      return (
                        <li
                          key={`${quiz._id}-${id}`}
                          className="flex items-center gap-3 rounded-xl bg-surface-muted px-3 py-2.5"
                        >
                          <span className="text-sm font-semibold text-brand-700">
                            {index + 1}.
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {task?.title ?? "Tapşırıq tapılmadı"}
                          </span>
                          {task && (
                            <span className="hidden text-xs text-muted sm:block">
                              {typeLabel(task.type)}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void removeTask(quiz, id)}
                          >
                            Çıxar
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                ) : expandedQuizIds.has(quiz._id) ? (
                  <p className="mt-4 rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-600">
                    Quiz boşdur. “Tapşırıq əlavə et” düyməsi ilə tapşırıq əlavə et.
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="px-5 py-16 text-center">
            <h3 className="font-bold">
              {search ? "Quiz tapılmadı" : "Hələ quiz yaradılmayıb"}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Quiz yaradandan sonra quizin içindən və ya yuxarıdakı düymədən
              tapşırıqları əlavə edə bilərsən.
            </p>
            {!search && (
              <Button className="mt-5" onClick={() => openQuiz({ type: "create" })}>
                İlk quiz-i yarat
              </Button>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={quizAction !== null}
        title={quizAction?.type === "edit" ? "Quiz-i redaktə et" : "Yeni quiz"}
        description="Quizin adını yaz. Tapşırıqları quiz yarandıqdan sonra əlavə edə və redaktə edə bilərsən."
        onClose={() => setQuizAction(null)}
      >
        <form className="space-y-5" onSubmit={saveQuiz}>
          {error && <InlineNotice message={error} isError />}
          <Input
            autoFocus
            label="Quizin adı"
            value={quizTitle}
            onChange={(event) => setQuizTitle(event.currentTarget.value)}
            maxLength={200}
            required
          />
          {quizAction?.type === "edit" && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const quiz = quizAction.quiz;
                setQuizAction(null);
                openTaskPicker("replace", quiz);
              }}
            >
              Quizin tapşırıqlarını seç
            </Button>
          )}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuizAction(null)}
            >
              Ləğv et
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Yadda saxlanılır..." : "Quiz-i yadda saxla"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={pickerOpen}
        title={pickerMode === "add" ? "Quizə tapşırıq əlavə et" : "Quizin tapşırıqlarını seç"}
        description={
          pickerMode === "add"
            ? "Quiz seç, mövcud tapşırıqları yoxla və əlavə etmək istədiklərini seç."
            : "Quizdə qalmalı olan tapşırıqları seç. Eyni tapşırığı başqa quizlər də istifadə edə bilər."
        }
        onClose={() => setPickerOpen(false)}
      >
        <form className="space-y-5" onSubmit={saveTaskSelection}>
          {error && <InlineNotice message={error} isError />}
          {quizzes.length ? (
            <Select
              label="Quiz seç"
              value={pickerQuizId}
              onChange={(event) => {
                const quizId = event.currentTarget.value;
                setPickerQuizId(quizId);
                const selectedQuiz = quizzes.find(
                  (quiz) => quiz._id === quizId,
                );
                setSelectedTaskIds(
                  pickerMode === "replace" && selectedQuiz
                    ? selectedQuiz.taskIds.map((task) =>
                        typeof task === "string" ? task : task._id,
                      )
                    : [],
                );
              }}
              required
            >
              <option value="">Quiz seçin</option>
              {quizzes.map((quiz) => (
                <option key={quiz._id} value={quiz._id}>
                  {quiz.title}
                </option>
              ))}
            </Select>
          ) : (
              <div className="rounded-xl bg-warning-50 px-4 py-3">
                <p className="text-sm text-warning-600">
                  Tapşırıq əlavə etməzdən əvvəl quiz yaratmalısan.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setPickerOpen(false);
                    openQuiz({ type: "create" });
                  }}
                >
                  Quiz yarat
                </Button>
              </div>
          )}
          {pickerQuiz && (
            <>
              {pickerQuiz.taskIds.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold">
                    Seçilən quizdəki tapşırıqlar ({currentTaskIds.length})
                  </p>
                  <ul className="max-h-36 space-y-1 overflow-y-auto rounded-xl bg-surface-muted p-3">
                    {currentTaskIds.map((id, index) => (
                      <li key={id} className="text-sm">
                        {index + 1}. {taskById.get(id)?.title ?? "Tapşırıq"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">
                  {pickerMode === "add"
                    ? "Bu quizə əlavə etmək üçün seç"
                    : "Bu quizdə saxlamaq üçün seç"}{" "}
                  ({selectedTaskIds.length})
                </legend>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {availableTasks.map((task) => (
                    <label
                      key={task._id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-surface-muted"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.includes(task._id)}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setSelectedTaskIds((current) =>
                            checked
                              ? [...current, task._id]
                              : current.filter((id) => id !== task._id),
                          );
                        }}
                        className="mt-0.5 h-4 w-4 accent-brand-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{task.title}</span>
                        <span className="mt-1 block text-xs text-muted">
                          {typeLabel(task.type)}
                          {task.quizzes.length
                            ? ` · ${task.quizzes.length} quizdə istifadə olunur`
                            : " · başqa quizdə yoxdur"}
                        </span>
                      </span>
                    </label>
                  ))}
                  {!availableTasks.length && (
                    <p className="rounded-xl bg-surface-muted px-3 py-3 text-sm text-muted">
                      {pickerMode === "add"
                        ? "Bu quizə əlavə ediləcək başqa tapşırıq yoxdur."
                        : "Tapşırıq bankında seçim yoxdur."}
                    </p>
                  )}
                </div>
              </fieldset>
            </>
          )}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(false)}
            >
              Ləğv et
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                !pickerQuizId ||
                (pickerMode === "add" && !selectedTaskIds.length)
              }
            >
              {saving
                ? "Yadda saxlanılır..."
                : pickerMode === "add"
                  ? "Tapşırıqları əlavə et"
                  : "Siyahını yadda saxla"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteQuiz !== null}
        title="Quiz-i sil"
        description="Quiz silinəcək. Tapşırıqlar bankda və başqa quizlərdə qalacaq; əvvəl dərc edilmiş ev tapşırıqları və dərslər dəyişməyəcək."
        onClose={() => setDeleteQuiz(null)}
      >
        {deleteQuiz && (
          <>
            {error && <InlineNotice message={error} isError />}
            <p className="rounded-xl bg-surface-muted px-4 py-3 font-semibold">
              {deleteQuiz.title}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteQuiz(null)}>
                Ləğv et
              </Button>
              <Button
                variant="danger"
                disabled={saving}
                onClick={() => void confirmDeleteQuiz()}
              >
                {saving ? "Silinir..." : "Quiz-i sil"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </DashboardShell>
  );
}

function typeLabel(type: TaskSummary["type"]) {
  return {
    single_choice: "Bir cavab",
    multiple_choice: "Çox cavab",
    drag_drop: "Ardıcıllıq",
    short_answer: "Yazılı cavab",
  }[type];
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
