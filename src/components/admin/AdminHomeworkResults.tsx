"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { TaskContent } from "@/src/components/tasks/TaskContent";
import { TaskOptionContent } from "@/src/components/tasks/TaskOptionContent";
import { requestJson } from "@/src/lib/client-api";
import type { TaskContentBlock, TaskOption, TaskType } from "@/src/models/Task";

interface HomeworkSubmissionRow {
  answer: unknown;
  isCorrect: boolean;
  retryAllowed: boolean;
  submittedAt: string;
  studentId: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  } | null;
}

interface ResultTask {
  _id: string;
  title: string;
  prompt: string;
  contentBlocks: TaskContentBlock[];
  type: TaskType;
  options: TaskOption[];
  correctAnswer: unknown;
  explanation?: string;
  submissions: HomeworkSubmissionRow[];
}

interface ResultData {
  assignment: {
    id: string;
    title: string;
    dueAt: string | null;
    deadlinePassed: boolean;
  };
  tasks: ResultTask[];
}

function AnswerContent({
  answer,
  task,
}: {
  answer: unknown;
  task: ResultTask;
}) {
  const values = Array.isArray(answer) ? answer : [answer];

  return (
    <span className="flex flex-wrap items-center gap-2">
      {values.map((value, index) => {
        const option =
          typeof value === "string"
            ? task.options.find((item) => item.id === value)
            : undefined;

        return (
          <span key={index} className="inline-flex min-w-0 items-center gap-2">
            {index > 0 && <span>→</span>}
            {option ? <TaskOptionContent option={option} /> : String(value)}
          </span>
        );
      })}
    </span>
  );
}

export function AdminHomeworkResults({ assignmentId }: { assignmentId: string }) {
  return (
    <RoleGate role="admin">
      {(user) => (
        <AdminHomeworkResultsContent
          assignmentId={assignmentId}
          name={user.name}
          avatar={user.avatar}
        />
      )}
    </RoleGate>
  );
}

function AdminHomeworkResultsContent({
  assignmentId,
  name,
  avatar,
}: {
  assignmentId: string;
  name: string;
  avatar: string;
}) {
  const [data, setData] = useState<ResultData | null>(null);
  const [taskIndex, setTaskIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void requestJson<ResultData>(`/api/assignments/${assignmentId}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Nəticələri yükləmək olmadı.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  async function resetIncorrectAnswer(taskId: string, studentId: string) {
    const resetKey = `${taskId}-${studentId}`;
    setResetting(resetKey);
    setError("");
    setNotice("");
    try {
      await requestJson(`/api/assignments/${assignmentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "reset-incorrect",
          taskId,
          studentId,
        }),
      });
      setData((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((item) =>
                item._id === taskId
                  ? {
                      ...item,
                      submissions: item.submissions.map((submission) =>
                        submission.studentId?._id === studentId
                          ? { ...submission, retryAllowed: true }
                          : submission,
                      ),
                    }
                  : item,
              ),
            }
          : current,
      );
      setNotice("Şagird üçün bu sualı yenidən cavablandırmaq açıldı.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Yenidən cəhd açmaq mümkün olmadı.",
      );
    } finally {
      setResetting("");
    }
  }

  const task = data?.tasks[taskIndex];

  return (
    <DashboardShell name={name} role="admin" avatar={avatar}>
      <div className="mb-5">
        <Link href="/admin/assignments" className="text-sm font-semibold text-brand-700">
          ← Ev tapşırıqlarına qayıt
        </Link>
        {data && (
          <>
            <h1 className="mt-3 text-3xl font-bold">{data.assignment.title}</h1>
            <p className="mt-2 text-sm text-muted">
              Tapşırıq üzrə hər sualın cavab sıralaması · Düzgün cavablar öncə, sonra cavablandırma vaxtı
            </p>
          </>
        )}
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-success-50 p-3 text-sm text-success-600">{notice}</p>}
      {loading ? (
        <p className="py-12 text-center text-muted">Nəticələr yüklənir...</p>
      ) : data && task ? (
        <>
          <div role="tablist" aria-label="Tapşırıq sualları" className="mb-5 flex gap-2 overflow-x-auto">
            {data.tasks.map((item, index) => (
              <Button
                key={item._id}
                type="button"
                role="tab"
                aria-selected={taskIndex === index}
                size="sm"
                variant={taskIndex === index ? "primary" : "outline"}
                onClick={() => setTaskIndex(index)}
              >
                {index + 1}. sual · {item.submissions.length}
              </Button>
            ))}
          </div>
          <Card>
            <h2 className="text-xl font-bold">{task.title}</h2>
            <TaskContent className="mt-3" contentBlocks={task.contentBlocks} prompt={task.prompt} />
            <div className="mt-5 rounded-xl bg-success-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-success-600">Düzgün cavab</p>
              <div className="mt-1 font-semibold text-success-600">
                <AnswerContent answer={task.correctAnswer} task={task} />
              </div>
              {task.explanation && <p className="mt-2 text-sm text-foreground">{task.explanation}</p>}
            </div>
          </Card>
          <section className="mt-6">
            <h2 className="mb-3 text-lg font-bold">Cavablandıran şagirdlər ({task.submissions.length})</h2>
            {task.submissions.length ? (
              <div className="space-y-3">
                {task.submissions.map((submission, index) => (
                  <Card
                    key={`${submission.studentId?._id ?? "unknown"}-${submission.submittedAt}`}
                    className={`flex items-center gap-4 p-4 ${
                      submission.isCorrect
                        ? "border-success-100 bg-success-50/50"
                        : submission.retryAllowed
                          ? "border-warning-100 bg-warning-50/50"
                          : ""
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${
                      index === 0
                        ? "bg-amber-300 text-amber-950"
                        : index === 1
                          ? "bg-slate-200 text-slate-700"
                          : index === 2
                            ? "bg-orange-200 text-orange-900"
                            : "bg-surface-muted text-muted"
                    }`}>
                      {index + 1}
                    </span>
                    {submission.studentId?.avatar ? (
                      <Image
                        src={submission.studentId.avatar}
                        alt=""
                        width={44}
                        height={44}
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    ) : (
                      <span className="h-11 w-11 rounded-full bg-surface-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {submission.studentId?.name ?? "Şagird hesabı tapılmadı"}
                      </p>
                      <div className="mt-1 break-words text-sm text-muted">
                        <AnswerContent answer={submission.answer} task={task} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-semibold ${
                        submission.isCorrect
                          ? "text-success-600"
                          : submission.retryAllowed
                            ? "text-warning-600"
                            : "text-danger-600"
                      }`}>
                        {submission.isCorrect
                          ? "Düzgün"
                          : submission.retryAllowed
                            ? "Yenidən cəhd açıqdır"
                            : "Səhv"}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {new Date(submission.submittedAt).toLocaleString("az-AZ")}
                      </p>
                    </div>
                    {!submission.isCorrect && !submission.retryAllowed && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={resetting === `${task._id}-${submission.studentId?._id}`}
                        onClick={() => {
                          const studentId = submission.studentId?._id;
                          if (studentId) {
                            void resetIncorrectAnswer(task._id, studentId);
                          }
                        }}
                      >
                        {resetting === `${task._id}-${submission.studentId?._id}`
                          ? "Açılır..."
                          : "Yenidən cəhd ver"}
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="py-10 text-center text-muted">Bu suala hələ cavab verilməyib.</Card>
            )}
          </section>
        </>
      ) : data ? (
        <Card className="py-10 text-center text-muted">Bu ev tapşırığında sual yoxdur.</Card>
      ) : null}
    </DashboardShell>
  );
}
