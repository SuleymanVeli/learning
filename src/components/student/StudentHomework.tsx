"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { TaskContent } from "@/src/components/tasks/TaskContent";
import { requestJson } from "@/src/lib/client-api";
import type { TaskContentBlock } from "@/src/models/Task";

interface AssignmentSummary {
  _id: string;
  title: string;
  dueAt?: string;
  groupId: { name: string } | string;
  taskCount: number;
  submittedCount: number;
}

interface HomeworkTask {
  _id: string;
  title: string;
  prompt: string;
  contentBlocks: TaskContentBlock[];
  type: "single_choice" | "multiple_choice" | "drag_drop" | "short_answer";
  options: { id: string; text: string }[];
  retryAllowed: boolean;
  submission: {
    answer: unknown;
    isCorrect: boolean;
    submittedAt: string;
  } | null;
}

interface HomeworkDetails {
  assignment: {
    id: string;
    title: string;
    dueAt: string | null;
    deadlinePassed: boolean;
  };
  tasks: HomeworkTask[];
}

function assignmentState(assignment: AssignmentSummary) {
  if (assignment.taskCount > 0 && assignment.submittedCount >= assignment.taskCount) {
    return {
      label: "Bitmiş",
      icon: "🏆",
      badge: "bg-emerald-100 text-emerald-800",
      progress: "bg-emerald-500",
    };
  }
  if (assignment.submittedCount > 0) {
    return {
      label: "Yarımçıq",
      icon: "🧩",
      badge: "bg-amber-100 text-amber-800",
      progress: "bg-amber-500",
    };
  }
  return {
    label: "Yeni",
    icon: "✨",
    badge: "bg-violet-100 text-violet-800",
    progress: "bg-violet-500",
  };
}

const assignmentThemes = [
  { className: "student-card-math", illustration: "🔢" },
  { className: "student-card-reading", illustration: "📖" },
  { className: "student-card-puzzle", illustration: "🧩" },
  { className: "student-card-art", illustration: "🎨" },
] as const;

function formatSubmissionAnswer(answer: unknown, task: HomeworkTask): string {
  const values = Array.isArray(answer) ? answer : [answer];
  const formatted = values.map((value) => {
    if (typeof value !== "string") return JSON.stringify(value);
    return task.options.find((option) => option.id === value)?.text ?? value;
  });
  return formatted.filter(Boolean).join(", ") || "—";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function taskContentForPrint(task: HomeworkTask): string {
  if (!task.contentBlocks.length) {
    return `<p>${escapeHtml(task.prompt)}</p>`;
  }

  return task.contentBlocks
    .map((block) => {
      if (block.type === "text") {
        const text = new DOMParser().parseFromString(block.text, "text/html").body.textContent ?? "";
        return `<p>${escapeHtml(text)}</p>`;
      }
      const url = new URL(block.url, window.location.origin);
      if (!["http:", "https:"].includes(url.protocol)) return "";
      return `<img src="${escapeHtml(url.href)}" alt="${escapeHtml(block.alt)}" style="width:${Math.min(100, Math.max(10, block.width))}%;max-width:${Math.min(4096, block.maxWidthPx ?? 800)}px">`;
    })
    .join("");
}

function openHomeworkPdf(details: HomeworkDetails, studentName: string, draft: {
  taskId: string;
  answer: string | string[];
} | null): boolean {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const tasksHtml = details.tasks
    .map((task, index) => {
      const submittedAnswer = task.submission
        ? formatSubmissionAnswer(task.submission.answer, task)
        : draft?.taskId === task._id
          ? formatSubmissionAnswer(draft.answer, task)
          : "Cavab verilməyib";
      const optionsHtml = task.options.length
        ? `<ol type="A">${task.options.map((option) => `<li>${escapeHtml(option.text)}</li>`).join("")}</ol>`
        : "";

      return `
        <section class="question">
          <h2>${index + 1}. ${escapeHtml(task.title)}</h2>
          <div class="content">${taskContentForPrint(task)}</div>
          ${optionsHtml}
          <p class="answer"><strong>Şagirdin cavabı:</strong> ${escapeHtml(submittedAnswer)}</p>
          ${task.submission
            ? `<p class="result ${task.submission.isCorrect ? "correct" : "incorrect"}">${task.submission.isCorrect ? "Düzgün cavab" : "Səhv cavab"}</p>`
            : ""}
        </section>`;
    })
    .join("");

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="az">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(details.assignment.title)}</title>
        <style>
          @page { size: A4; margin: 18mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #273449; font: 14px/1.6 Arial, sans-serif; }
          header { margin-bottom: 24px; border-bottom: 2px solid #e8e3f1; padding-bottom: 14px; }
          h1 { margin: 0; color: #4c3b70; font-size: 24px; }
          header p { margin: 4px 0 0; color: #667085; }
          .question { break-inside: avoid; margin: 0 0 22px; border-bottom: 1px solid #e5e7eb; padding: 0 0 18px; }
          h2 { margin: 0 0 10px; font-size: 18px; }
          .content p { white-space: pre-wrap; }
          .content img { display: block; height: auto; margin: 12px auto; }
          ol { padding-left: 24px; }
          li { padding: 2px 0; }
          .answer { margin: 12px 0 0; border-radius: 8px; background: #f3f6f8; padding: 8px 12px; }
          .result { font-weight: 700; }
          .correct { color: #397649; }
          .incorrect { color: #925353; }
          @media screen { body { max-width: 800px; margin: 32px auto; padding: 24px; } }
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeHtml(details.assignment.title)}</h1>
          <p>Şagird: ${escapeHtml(studentName)}</p>
          <p>Tarix: ${new Date().toLocaleDateString("az-AZ")}</p>
        </header>
        ${tasksHtml}
      </body>
    </html>`);
  printWindow.document.close();

  const images = Array.from(printWindow.document.images);
  void Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => {
    printWindow.focus();
    printWindow.print();
  });
  return true;
}

export function StudentHomework() {
  return (
    <RoleGate role="student">
      {(user) => (
        <StudentHomeworkContent
          name={user.name}
          avatar={user.avatar}
        />
      )}
    </RoleGate>
  );
}

function StudentHomeworkContent({
  name,
  avatar,
}: {
  name: string;
  avatar: string;
}) {
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [details, setDetails] = useState<HomeworkDetails | null>(null);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);
  const [answerDrafts, setAnswerDrafts] = useState<
    Record<string, string | string[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    requestJson<{ assignments: AssignmentSummary[] }>("/api/student/dashboard")
      .then(({ assignments: rows }) => {
        if (cancelled) return;
        setAssignments(rows);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Tapşırıqları yükləmək olmadı.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let cancelled = false;
    requestJson<HomeworkDetails>(`/api/assignments/${selectedId}`)
      .then((next) => {
        if (cancelled) return;
        setDetails(next);
        setSelectedTaskIndex(0);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Tapşırığı yükləmək olmadı.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const task = details?.tasks[selectedTaskIndex];
  const answerKey = task ? `${details?.assignment.id}:${task._id}` : "";
  const answer = answerDrafts[answerKey] ?? "";
  const detailsLoading =
    loading ||
    (Boolean(selectedId) && details?.assignment.id !== selectedId && !error);

  function setAnswer(value: string | string[]) {
    if (!answerKey) return;
    setAnswerDrafts((current) => ({ ...current, [answerKey]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!details || !task) return;
    setSaving(true);
    setError("");
    try {
      const result = await requestJson<{
        submission: NonNullable<HomeworkTask["submission"]>;
      }>(`/api/assignments/${details.assignment.id}`, {
        method: "POST",
        body: JSON.stringify({ taskId: task._id, answer }),
      });
      setDetails((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((item) =>
                item._id === task._id
                  ? { ...item, submission: result.submission }
                  : item,
              ),
            }
          : current,
      );
      setAssignments((current) =>
        current.map((assignment) =>
          assignment._id === details.assignment.id
            ? {
                ...assignment,
                submittedCount: Math.min(
                  assignment.taskCount,
                  assignment.submittedCount + 1,
                ),
              }
            : assignment,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cavabı göndərmək olmadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell name={name} role="student" avatar={avatar}>
      {!selectedId ? (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">Ev tapşırıqları</h1>
          </div>
          <span className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-violet-700 shadow-lg shadow-violet-100">
            {assignments.length} tapşırıq
          </span>
        </div>
      ) : (
        <div className="mb-5 flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Tapşırıqlar siyahısına qayıt"
            className="student-icon-back shrink-0"
            onClick={() => {
              setSelectedId("");
              setDetails(null);
              setError("");
            }}
          >
            ←
          </button>
          <h1 className="min-w-0 truncate text-xl font-black sm:text-2xl">
            {details?.assignment.title ?? "Ev tapşırığı"}
          </h1>
          {/* {details && !detailsLoading && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="student-flat-button ml-auto shrink-0"
              onClick={() => {
                setError("");
                const opened = openHomeworkPdf(
                  details,
                  name,
                  task
                    ? { taskId: task._id, answer }
                    : null,
                );
                if (!opened) {
                  setError("PDF yaratmaq üçün brauzerdə yeni pəncərələrə icazə verin.");
                }
              }}
            >
              <span aria-hidden="true">↓</span>
              <span className="hidden sm:inline">PDF yüklə</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          )} */}
        </div>
      )}
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
      {!selectedId ? (
        loading ? (
          <p className="py-12 text-center text-muted">Tapşırıqlar yüklənir...</p>
        ) : assignments.length ? (
          <div className="student-homework-list flex flex-col gap-3">
            {assignments.map((assignment, index) => {
              const state = assignmentState(assignment);
              const theme = assignmentThemes[index % assignmentThemes.length];
              const progress = assignment.taskCount
                ? Math.min(100, (assignment.submittedCount / assignment.taskCount) * 100)
                : 0;
              return (
                <button
                  key={assignment._id}
                  type="button"
                  onClick={() => {
                    setError("");
                    setDetails(null);
                    setSelectedTaskIndex(0);
                    setSelectedId(assignment._id);
                  }}
                  className={`student-homework-list-row ${theme.className} group flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 sm:gap-4 sm:px-5`}
                >
                  <span className="student-homework-list-icon" aria-hidden="true">{theme.illustration}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-black text-slate-800 sm:text-lg">
                      {assignment.title}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-slate-500">
                      {assignment.submittedCount} / {assignment.taskCount} sual
                      {assignment.dueAt
                        ? ` · Son tarix ${new Date(assignment.dueAt).toLocaleDateString("az-AZ")}`
                        : ""}
                    </span>
                    <span className="student-homework-list-progress mt-2 block h-1.5 overflow-hidden rounded-full">
                      <span
                        className={`block h-full rounded-full transition-all duration-300 ${state.progress}`}
                        style={{ width: `${progress}%` }}
                      />
                    </span>
                  </span>
                  <span className={`student-homework-status shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold ${state.badge}`}>
                    <span aria-hidden="true">{state.icon} </span>
                    {state.label}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Card className="student-content-card text-center text-muted">Hazırda ev tapşırığı yoxdur.</Card>
        )
      ) : detailsLoading ? (
        <p className="py-12 text-center text-muted">Tapşırıq yüklənir...</p>
      ) : details && task ? (
        <Card className="student-content-card student-homework-detail overflow-hidden p-0">
          <div
            role="tablist"
            aria-label="Ev tapşırığının sualları"
            className="student-question-tabs flex flex-wrap gap-2 px-4 py-4"
          >
            {details.tasks.map((item, index) => (
              <button
                key={item._id}
                type="button"
                role="tab"
                aria-selected={selectedTaskIndex === index}
                aria-label={`Sual ${index + 1}${item.submission ? ", tamamlanıb" : ""}`}
                onClick={() => {
                  setSelectedTaskIndex(index);
                }}
                className={`student-question-tab ${
                  selectedTaskIndex === index
                    ? "is-selected"
                    : item.submission
                      ? "is-complete"
                      : ""
                }`}
              >
                {item.submission ? "✓" : index + 1}
              </button>
            ))}
          </div>
          <div className="student-homework-content">
            <h3 className="break-words text-xl font-black leading-snug sm:text-2xl">{task.title}</h3>
            <TaskContent
              className="task-content-html"
              contentBlocks={task.contentBlocks}
              prompt={task.prompt}
            />
          </div>
          <div className="student-homework-answer">
            {task.submission ? (
              <div className={`student-homework-result ${
                task.submission.isCorrect ? "is-correct" : "is-incorrect"
              }`}>
                <p className="font-extrabold">
                  {task.submission.isCorrect ? "Cavab düzgündür." : "Səhv cavabdır."}
                </p>
                <p className="mt-1 text-sm">
                  Seçdiyin cavab: {formatSubmissionAnswer(task.submission.answer, task)}
                </p>
              </div>
            ) : details.assignment.deadlinePassed && !task.retryAllowed ? (
              <p className="mt-5 rounded-xl bg-surface-muted p-4 text-sm text-muted">
                Bu tapşırığın son tarixi bitib və yeni cavab göndərmək mümkün deyil.
              </p>
            ) : (
              <form id={`homework-answer-${task._id}`} className="mt-5 space-y-4" onSubmit={submit}>
                {task.type === "short_answer" ? (
                  <Input
                    label="Cavabın"
                    value={typeof answer === "string" ? answer : ""}
                    onChange={(event) => setAnswer(event.currentTarget.value)}
                    maxLength={2000}
                    required
                  />
                ) : task.type === "drag_drop" ? (
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-medium">
                      Cavab ardıcıllığını qurmaq üçün variantlara sıra ilə toxun
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {task.options.map((option) => {
                        const selected = Array.isArray(answer) ? answer : [];
                        const index = selected.indexOf(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={index !== -1}
                            onClick={() =>
                              setAnswer(
                                index === -1
                                  ? [...selected, option.id]
                                  : selected.filter((id) => id !== option.id),
                              )
                            }
                            className={`student-answer-option min-h-14 w-full rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold transition ${
                              index !== -1 ? "is-selected" : ""
                            }`}
                          >
                            {index !== -1 && (
                              <span className="student-answer-order mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold">
                                {index + 1}
                              </span>
                            )}
                            {option.text}
                          </button>
                        );
                      })}
                    </div>
                    {Array.isArray(answer) && answer.length > 0 && (
                      <Button type="button" variant="outline" size="sm" className="student-flat-button" onClick={() => setAnswer([])}>
                        Seçimi sıfırla
                      </Button>
                    )}
                  </fieldset>
                ) : (
                  <fieldset className="space-y-2">
                    <legend className="mb-2 font-medium">
                      {task.type === "multiple_choice" ? "Cavabları seç" : "Bir cavab seç"}
                    </legend>
                    {task.options.map((option) => {
                      const chosen = Array.isArray(answer)
                        ? answer.includes(option.id)
                        : answer === option.id;
                      return (
                        <label key={option.id} className={`student-answer-option flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 font-bold transition ${
                          chosen ? "is-selected" : ""
                        }`}>
                          <input
                            type={task.type === "multiple_choice" ? "checkbox" : "radio"}
                            name={`homework-${task._id}`}
                            checked={chosen}
                            onChange={() => {
                              if (task.type !== "multiple_choice") {
                                setAnswer(option.id);
                                return;
                              }
                              const currentIds = Array.isArray(answer) ? answer : [];
                              setAnswer(
                                chosen
                                  ? currentIds.filter((id) => id !== option.id)
                                  : [...currentIds, option.id],
                              );
                            }}
                            className="h-5 w-5 shrink-0 accent-sky-600"
                          />
                          {option.text}
                        </label>
                      );
                    })}
                  </fieldset>
                )}
              </form>
            )}
            <div className="mt-6 grid grid-cols-3 gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="student-flat-button h-10 w-full rounded-xl px-2"
                disabled={selectedTaskIndex === 0}
                onClick={() => setSelectedTaskIndex((index) => index - 1)}
              >
                ← Əvvəlki
              </Button>
              {task.submission ||
              (details.assignment.deadlinePassed && !task.retryAllowed) ? (
                <span aria-hidden="true" />
              ) : (
                <Button
                  type="submit"
                  form={`homework-answer-${task._id}`}
                  size="sm"
                  className="student-flat-button h-10 w-full px-2"
                  disabled={saving || (Array.isArray(answer) ? !answer.length : !answer.trim())}
                >
                  {saving ? "Göndərilir..." : "Təsdiqlə"}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="student-flat-button h-10 w-full rounded-xl px-2"
                disabled={selectedTaskIndex >= details.tasks.length - 1}
                onClick={() => setSelectedTaskIndex((index) => index + 1)}
              >
                Növbəti →
              </Button>
            </div>
          </div>
        </Card>
      ) : selectedId && error ? (
        <Card className="text-center text-muted">Tapşırığı açmaq mümkün olmadı. Yenidən cəhd et.</Card>
      ) : null}
      
    </DashboardShell>
  );
}
