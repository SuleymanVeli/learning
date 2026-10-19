"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
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
}

interface HomeworkTask {
  _id: string;
  title: string;
  prompt: string;
  contentBlocks: TaskContentBlock[];
  type: "single_choice" | "multiple_choice" | "drag_drop" | "short_answer";
  options: { id: string; text: string }[];
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
        if (rows[0]) setSelectedId(rows[0]._id);
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
  const selectedAssignment = assignments.find((item) => item._id === selectedId);
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cavabı göndərmək olmadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell name={name} role="student" avatar={avatar}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-violet-600">📚 Öyrənmə vaxtıdır</p>
          <h1 className="mt-1 text-3xl font-black sm:text-4xl">Ev tapşırıqları</h1>
          <p className="mt-2 text-muted">
            Tablar arasında sərbəst keçib hər sualı ayrıca cavablandıra bilərsən.
          </p>
        </div>
        <span className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-violet-700 shadow-lg shadow-violet-100">
          ✨ {assignments.length} tapşırıq
        </span>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
      {assignments.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {assignments.map((assignment) => (
            <Button
              key={assignment._id}
              size="sm"
              variant={selectedId === assignment._id ? "primary" : "outline"}
              onClick={() => {
                setError("");
                setDetails(null);
                setSelectedTaskIndex(0);
                setSelectedId(assignment._id);
              }}
            >
              {assignment.title}
            </Button>
          ))}
        </div>
      )}
      {!assignments.length && !loading ? (
        <Card className="text-center text-muted">Hazırda ev tapşırığı yoxdur.</Card>
      ) : detailsLoading ? (
        <p className="py-12 text-center text-muted">Tapşırıq yüklənir...</p>
      ) : details && task ? (
        <Card className="overflow-hidden bg-gradient-to-br from-white to-violet-50/70 p-0 shadow-xl shadow-violet-100/70">
          <div className="bg-gradient-to-r from-violet-100/80 via-fuchsia-50 to-sky-100/80 p-5">
            <p className="text-sm font-bold text-violet-700">
              {typeof selectedAssignment?.groupId === "object"
                ? selectedAssignment.groupId.name
                : "Qrup"}
            </p>
            <h2 className="mt-1 text-xl font-bold">{details.assignment.title}</h2>
            {details.assignment.dueAt && (
              <p className="mt-1 text-sm text-muted">
                Son tarix: {new Date(details.assignment.dueAt).toLocaleString("az-AZ")}
              </p>
            )}
          </div>
          <div role="tablist" aria-label="Ev tapşırığının sualları" className="flex gap-2 overflow-x-auto p-4">
            {details.tasks.map((item, index) => (
              <button
                key={item._id}
                type="button"
                role="tab"
                aria-selected={selectedTaskIndex === index}
                onClick={() => {
                  setSelectedTaskIndex(index);
                }}
                className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-bold shadow-md transition ${
                  selectedTaskIndex === index
                    ? "bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-purple-200"
                    : item.submission
                      ? "bg-emerald-100 text-emerald-700 shadow-emerald-100"
                      : "bg-white text-slate-600 shadow-slate-200/70"
                }`}
              >
                {index + 1}. sual
              </button>
            ))}
          </div>
          <div className="p-5 pt-2 sm:p-7 sm:pt-2">
            <h3 className="text-xl font-extrabold">{task.title}</h3>
            <TaskContent
              className="mt-3"
              contentBlocks={task.contentBlocks}
              prompt={task.prompt}
            />
            {task.submission ? (
              <div className={`mt-5 rounded-xl p-4 font-semibold ${
                task.submission.isCorrect
                  ? "bg-success-50 text-success-600"
                  : "bg-danger-50 text-danger-600"
              }`}>
                {task.submission.isCorrect ? "Cavab düzgündür." : "Cavab yoxlanıldı."}
              </div>
            ) : details.assignment.deadlinePassed ? (
              <p className="mt-5 rounded-xl bg-surface-muted p-4 text-sm text-muted">
                Bu tapşırığın son tarixi bitib və yeni cavab göndərmək mümkün deyil.
              </p>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={submit}>
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
                            className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold shadow-md transition ${
                              index !== -1
                                ? "bg-violet-100 text-violet-800 shadow-violet-200"
                                : "bg-white text-slate-700 shadow-slate-200/70 hover:bg-sky-50"
                            }`}
                          >
                            {index !== -1 && (
                              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                                {index + 1}
                              </span>
                            )}
                            {option.text}
                          </button>
                        );
                      })}
                    </div>
                    {Array.isArray(answer) && answer.length > 0 && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setAnswer([])}>
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
                        <label key={option.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl p-4 shadow-md transition ${
                          chosen
                            ? "bg-sky-100 text-sky-900 shadow-sky-200"
                            : "bg-white shadow-slate-200/70 hover:bg-violet-50"
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
                            className="h-4 w-4 accent-brand-600"
                          />
                          {option.text}
                        </label>
                      );
                    })}
                  </fieldset>
                )}
                <Button type="submit" disabled={saving || (Array.isArray(answer) ? !answer.length : !answer.trim())}>
                  {saving ? "Göndərilir..." : "Cavabı yoxla"}
                </Button>
              </form>
            )}
            <div className="mt-5 flex justify-between">
              <Button
                size="sm"
                variant="outline"
                disabled={selectedTaskIndex === 0}
                onClick={() => setSelectedTaskIndex((index) => index - 1)}
              >
                Əvvəlki sual
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selectedTaskIndex >= details.tasks.length - 1}
                onClick={() => setSelectedTaskIndex((index) => index + 1)}
              >
                Növbəti sual
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
      <Link href="/student" className="mt-5 inline-block text-sm font-semibold text-brand-700">
        ← Panelə qayıt
      </Link>
    </DashboardShell>
  );
}
