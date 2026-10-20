"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { TaskContent } from "@/src/components/tasks/TaskContent";
import { requestJson } from "@/src/lib/client-api";
import type { TaskContentBlock } from "@/src/models/Task";

type TaskKind = "single_choice" | "multiple_choice" | "drag_drop" | "short_answer";

interface LessonTask {
  _id: string;
  title: string;
  prompt?: string;
  contentBlocks?: TaskContentBlock[];
  type?: TaskKind;
  options?: { id: string; text: string }[];
}

interface LessonData {
  id: string;
  title: string;
  groupName: string;
  status: "draft" | "live" | "ended";
  hasStarted: boolean;
  activeTaskIndex: number;
  durationSeconds: number;
  endsAt: string | null;
  tabs: LessonTask[];
}

interface LiveSubmission {
  _id: string;
  answer: unknown;
  submittedAt: string;
  isCorrect?: boolean;
  studentId: { _id: string; name: string; avatar?: string } | string;
}

export function LiveLessonDetail({
  lessonId,
  role,
}: {
  lessonId: string;
  role: "admin" | "student";
}) {
  return (
    <RoleGate role={role}>
      {(user) =>
        <LiveLessonDetailContent
          key={`${role}-${lessonId}`}
          lessonId={lessonId}
          role={role}
          user={user}
        />
      }
    </RoleGate>
  );
}

function LiveLessonDetailContent({
  lessonId,
  role,
  user,
}: {
  lessonId: string;
  role: "admin" | "student";
  user: { id: string; name: string; avatar: string };
}) {
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [submissions, setSubmissions] = useState<LiveSubmission[]>([]);
  const [submissionsRevealed, setSubmissionsRevealed] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [answer, setAnswer] = useState<string | string[]>("");
  const [minutes, setMinutes] = useState(2);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { lesson: next } = await requestJson<{ lesson: LessonData }>(
      `/api/live-lessons/${lessonId}`,
    );
    setLesson(next);
    setSelectedTab((current) =>
      role === "student" ? next.activeTaskIndex : current,
    );
    const result = await requestJson<{
      submissions: LiveSubmission[];
      revealed: boolean;
    }>(
      `/api/live-lessons/${lessonId}/submissions${
        role === "admin" ? `?taskIndex=${selectedTab}` : ""
      }`,
    );
    setSubmissions(result.submissions);
    setSubmissionsRevealed(result.revealed);
  }, [lessonId, role, selectedTab]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        await load();
        if (!cancelled) setError("");
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Canlı dərsin məlumatlarını yükləmək olmadı.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!lesson?.endsAt) return;
    const update = () =>
      setRemaining(
        Math.max(0, Math.ceil((new Date(lesson.endsAt!).getTime() - Date.now()) / 1000)),
      );
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [lesson?.endsAt]);

  const secondsRemaining = lesson?.endsAt ? remaining : 0;
  const activeTask = lesson?.tabs[lesson.activeTaskIndex] ?? null;
  const displayedTask =
    role === "admin" ? lesson?.tabs[selectedTab] ?? null : activeTask;
  const readyTask =
    displayedTask?.type && displayedTask.options
      ? {
          ...displayedTask,
          prompt: displayedTask.prompt ?? "",
          contentBlocks: displayedTask.contentBlocks ?? [],
          options: displayedTask.options ?? [],
        }
      : null;
  const isClosed = submissionsRevealed;
  const ownSubmission = submissions.some((submission) =>
    typeof submission.studentId === "string"
      ? false
      : submission.studentId._id === user.id,
  );

  async function runAction(action: string, extras: Record<string, unknown> = {}) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`/api/live-lessons/${lessonId}`, {
        method: "PATCH",
        body: JSON.stringify({ action, ...extras }),
      });
      await load();
      setNotice(action === "end" ? "Dərs bitirildi." : "Canlı tab yeniləndi.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Əməliyyat alınmadı.");
    } finally {
      setSaving(false);
    }
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lesson || !activeTask) return;
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/live-lessons/${lesson.id}/submissions`, {
        method: "POST",
        body: JSON.stringify({ answer }),
      });
      setAnswer("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cavabı göndərmək olmadı.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell name={user.name} role={role} avatar={user.avatar}>
        <p className="py-20 text-center text-muted">Dərs yüklənir...</p>
      </DashboardShell>
    );
  }

  if (!lesson) {
    return (
      <DashboardShell name={user.name} role={role} avatar={user.avatar}>
        <p role="alert" className="rounded-xl bg-danger-50 p-4 text-danger-600">
          {error || "Dərs tapılmadı."}
        </p>
      </DashboardShell>
    );
  }

  const canAnswer =
    role === "student" &&
    lesson.status === "live" &&
    secondsRemaining > 0 &&
    !ownSubmission &&
    Boolean(activeTask);

  return (
    <DashboardShell name={user.name} role={role} avatar={user.avatar}>
      {role === "student" ? (
        <div className="mb-6 flex min-w-0 items-center gap-3">
          <Link
            href="/student/live-lessons"
            aria-label="Canlı dərslər siyahısına qayıt"
            className="student-icon-back shrink-0"
          >
            ←
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-xl font-black sm:text-2xl">
            {lesson.title}
          </h1>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${
              lesson.status === "live"
                ? "bg-emerald-100 text-emerald-800"
                : lesson.status === "ended"
                  ? "bg-slate-100 text-slate-600"
                  : "bg-amber-100 text-amber-800"
            }`}
          >
            {lesson.status === "live" ? "Canlı" : lesson.status === "ended" ? "Bitib" : "Hazır"}
          </span>
        </div>
      ) : (
        <>
          <Link
            href="/admin/live-lessons"
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            ← Canlı dərslərə qayıt
          </Link>
          <div className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-4">
            <h1 className="mt-1 text-3xl font-black">{lesson.title}</h1>
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                lesson.status === "live"
                  ? "bg-success-50 text-success-600"
                  : lesson.status === "ended"
                    ? "bg-surface-muted text-muted"
                    : "bg-warning-50 text-warning-600"
              }`}
            >
              {lesson.status === "live" ? "Canlı" : lesson.status === "ended" ? "Bitib" : "Hazır"}
            </span>
          </div>
        </>
      )}
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-success-50 p-3 text-sm text-success-600">{notice}</p>}

      {role === "admin" && (
        <div className="mb-4">
          <Link
            href={`/admin/live-lessons/${lessonId}/teacher`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-xl border-2 border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
          >
            Müəllim üçün izah pəncərəsini aç
          </Link>
        </div>
      )}

      <Card className={`overflow-hidden p-0 ${
        role === "student" ? "student-content-card student-live-detail" : ""
      }`}>
        <div
          role="tablist"
          aria-label="Dərs sualları"
          className={`flex items-center gap-2 overflow-x-auto border-b border-border p-3 ${
            role === "student" ? "student-live-tabs" : ""
          }`}
        >
          {lesson.tabs.map((task, index) => {
            const active =
              role === "admin"
                ? selectedTab === index
                : lesson.activeTaskIndex === index;
            return (
              <button
                key={task._id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Sual ${index + 1}: ${task.title}`}
                onClick={() => role === "admin" && setSelectedTab(index)}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold ${
                  active
                    ? role === "student"
                      ? "bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-purple-200"
                      : "bg-brand-600 text-white"
                      : role === "student"
                        ? "bg-white text-slate-600 shadow-md shadow-slate-200/70"
                        : "bg-surface-muted text-foreground"
                } ${role === "admin" ? "cursor-pointer" : "cursor-default"} ${
                  role === "student" ? "student-live-tab" : ""
                }`}
              >
                {role === "student" ? index + 1 : `${index + 1}. ${task.title}`}
              </button>
            );
          })}
          {role === "student" && (
            <span className="student-live-clock ml-auto shrink-0 rounded-xl px-3 py-1 font-mono text-lg font-black" aria-live="polite">
              {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, "0")}
            </span>
          )}
        </div>

        {readyTask && (role === "admin" || lesson.hasStarted) ? (
          <div className={role === "student" ? "student-live-content" : "p-5 sm:p-7"}>
            {role === "admin" && (
              <div className="mb-5 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Vaxt (dəqiqə)</span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={minutes}
                    onChange={(event) => setMinutes(Number(event.currentTarget.value))}
                    className="w-28 rounded-xl border border-border bg-white px-3 py-2"
                  />
                </label>
                <Button
                  disabled={saving || lesson.status === "ended"}
                  onClick={() =>
                    void runAction("start", {
                      taskIndex: selectedTab,
                      durationSeconds: minutes * 60,
                    })
                  }
                >
                  Bu tabı başlat
                </Button>
                {lesson.status === "live" && secondsRemaining > 0 && (
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void runAction("stop-task")}
                  >
                    Vaxtı dayandır
                  </Button>
                )}
                {lesson.status !== "ended" && (
                  <Button
                    variant="danger"
                    disabled={saving}
                    onClick={() => void runAction("end")}
                  >
                    Dərsi bitir
                  </Button>
                )}
              </div>
            )}
            <div className={role === "student" ? "student-live-question" : ""}>
              <TaskContent contentBlocks={readyTask.contentBlocks} prompt={readyTask.prompt} />
            </div>
            <div className={`mt-5 space-y-3 ${
              role === "student" ? "student-live-answers" : ""
            }`}>
              {readyTask.type === "drag_drop" && role === "student" ? (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-foreground">
                    Ardıcıllığı qurmaq üçün variantlara sıra ilə toxun
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {readyTask.options.map((option) => {
                      const selected = Array.isArray(answer) ? answer : [];
                      const position = selected.indexOf(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={position !== -1}
                          disabled={!canAnswer}
                          onClick={() =>
                            setAnswer(
                              position === -1
                                ? [...selected, option.id]
                                : selected.filter((id) => id !== option.id),
                            )
                          }
                          className={`student-live-option min-h-14 w-full rounded-2xl border px-4 py-3 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            position !== -1
                              ? "bg-violet-100 text-violet-800 shadow-violet-200"
                              : "bg-white text-slate-700 shadow-slate-200/70 hover:bg-sky-50"
                          }`}
                        >
                          {position !== -1 && (
                            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                              {position + 1}
                            </span>
                          )}
                          {option.text}
                        </button>
                      );
                    })}
                  </div>
                  {Array.isArray(answer) && answer.length > 0 && canAnswer && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAnswer([])}
                    >
                      Seçimi sıfırla
                    </Button>
                  )}
                </fieldset>
              ) : readyTask.type !== "short_answer" ? (
                readyTask.options.map((option, index) => {
                  const selected = Array.isArray(answer)
                    ? answer.includes(option.id)
                    : answer === option.id;
                  const multiple = readyTask.type === "multiple_choice";
                  return (
                    <label
                      key={option.id}
                      className={`student-live-option flex min-h-16 items-center gap-3 rounded-2xl border-2 p-3 font-bold ${
                        selected
                          ? "is-selected"
                          : ""
                      }`}
                    >
                      <input
                        type={multiple ? "checkbox" : "radio"}
                        name={`answer-${readyTask._id}`}
                        checked={selected}
                        disabled={!canAnswer}
                        onChange={() =>
                          setAnswer((current) => {
                            const selectedIds = Array.isArray(current)
                              ? current
                              : current
                                ? [current]
                                : [];
                            if (!multiple) return option.id;
                            return selected
                              ? selectedIds.filter((id) => id !== option.id)
                              : [...selectedIds, option.id];
                          })
                        }
                        className="student-live-choice-control"
                      />
                      <span className="student-live-choice-letter" aria-hidden="true">
                        {String.fromCharCode(65 + index)}
                      </span>
                      {option.text}
                    </label>
                  );
                })
              ) : null}
              {readyTask.type === "short_answer" && (
                <Input
                  label="Cavabın"
                  value={typeof answer === "string" ? answer : ""}
                  disabled={!canAnswer}
                  onChange={(event) => setAnswer(event.currentTarget.value)}
                  maxLength={2000}
                />
              )}
            </div>

            {canAnswer && (
              <form className="mt-5" onSubmit={submitAnswer}>
                <Button
                  type="submit"
                  className={role === "student" ? "student-action-button" : ""}
                  disabled={
                    saving ||
                    (Array.isArray(answer) ? !answer.length : !answer.trim())
                  }
                >
                  {saving ? "Göndərilir..." : "Cavabı təsdiqlə"}
                </Button>
              </form>
            )}
          </div>
        ) : role === "student" && !lesson.hasStarted ? (
          <div className="student-live-waiting bg-gradient-to-br from-violet-50 to-sky-50 p-7 text-center">
            <h2 className="font-bold text-violet-800">Müəllim dərsi başladana qədər sual görünməyəcək.</h2>
            <p className="mt-2 text-sm text-muted">
              Sual başlayanda bu səhifə avtomatik yenilənəcək.
            </p>
          </div>
        ) : (
          <p className="p-7 text-muted">Bu dərsdə sual yoxdur.</p>
        )}
        </Card>

        {role === "admin" && (
          <Card className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Şagirdlərin cavabları</h2>
                <p className="mt-1 text-sm text-muted">
                  {submissionsRevealed
                    ? "Vaxt bitib: cavabların düzgünlüyü göstərilir."
                    : "Vaxt bitənədək cavablar yalnız seçimləri ilə sıralanır."}
                </p>
              </div>
              <span className="rounded-full bg-surface-muted px-3 py-1 text-sm font-semibold">
                {submissions.length} cavab
              </span>
            </div>
            {submissions.length ? (
              <ol className="mt-4 space-y-2">
                {submissions.map((submission, index) => (
                  <li
                    key={submission._id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      submissionsRevealed && submission.isCorrect
                        ? "border-success-100 bg-success-50"
                        : submissionsRevealed
                          ? "border-danger-100 bg-danger-50"
                          : "border-border bg-surface"
                    }`}
                  >
                    <span className="font-bold">{index + 1}.</span>
                    {typeof submission.studentId !== "string" && (
                      <Image
                        src={submission.studentId.avatar ?? "/avatars/avatar-1.png"}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {typeof submission.studentId === "string"
                        ? "Şagird"
                        : submission.studentId.name}
                    </span>
                    <span className="text-sm">
                      {answerLabel(submission.answer, displayedTask)}
                    </span>
                    {submissionsRevealed && (
                      <span className="text-sm font-bold">
                        {submission.isCorrect ? "✓" : "×"}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted">Bu sual üçün hələ cavab yoxdur.</p>
            )}
          </Card>
        )}

        {role === "student" && lesson.hasStarted && (
        <Card className="student-content-card student-live-results mt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              {isClosed ? "Nəticələr" : "Cavablar"}
            </h2>
            <span className="student-live-count rounded-full px-3 py-1 text-xs font-extrabold">
              {submissions.length} cavab
            </span>
          </div>
          {!ownSubmission ? (
            <p className="mt-3 text-sm text-muted">
              Cavabını təsdiqləyəndən sonra iştirakçıların cavab siyahısı görünəcək.
            </p>
          ) : submissions.length ? (
            <ol className="mt-4 space-y-2">
              {submissions.map((submission, index) => (
                <li
                  key={submission._id}
                  className={`student-live-result-row flex items-center gap-3 rounded-2xl p-3 ${
                    isClosed
                      ? submission.isCorrect
                        ? "is-correct"
                        : "is-incorrect"
                      : ""
                  }`}
                >
                  <span className="font-bold">{index + 1}.</span>
                  {typeof submission.studentId !== "string" && (
                    <Image
                      src={submission.studentId.avatar ?? "/avatars/avatar-1.png"}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {typeof submission.studentId === "string"
                      ? "Şagird"
                      : submission.studentId.name}
                  </span>
                  <span className="text-sm">{answerLabel(submission.answer, activeTask)}</span>
                  {submissionsRevealed && (
                    <span className="text-sm font-bold">
                      {submission.isCorrect ? "✓" : "×"}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted">Hələ cavab göndərilməyib.</p>
          )}
        </Card>
      )}
    </DashboardShell>
  );
}

function answerLabel(answer: unknown, task: LessonTask | null) {
  const values = Array.isArray(answer) ? answer : [answer];
  return values
    .map((value) => {
      if (typeof value !== "string") return JSON.stringify(value);
      return task?.options?.find((option) => option.id === value)?.text ?? value;
    })
    .join(", ");
}
