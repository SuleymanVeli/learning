"use client";

import { useEffect, useState } from "react";
import { RoleGate } from "@/src/components/app/RoleGate";
import { TaskContent } from "@/src/components/tasks/TaskContent";
import { requestJson } from "@/src/lib/client-api";
import { Button } from "@/src/components/ui/Button";
import { TaskOptionContent } from "@/src/components/tasks/TaskOptionContent";
import type { TaskContentBlock, TaskOption, TaskType } from "@/src/models/Task";

interface TeacherTask {
  _id: string;
  title: string;
  prompt: string;
  contentBlocks: TaskContentBlock[];
  type: TaskType;
  options: TaskOption[];
  correctAnswer: unknown;
  explanation?: string;
}

interface TeacherData {
  title: string;
  groupName: string;
  status: "draft" | "live" | "ended";
  activeTaskIndex: number;
  taskCount: number;
  tasks: TeacherTask[];
}

export function LiveLessonTeacherWindow({ lessonId }: { lessonId: string }) {
  return (
    <RoleGate role="admin">
      {() => <TeacherWindowContent lessonId={lessonId} />}
    </RoleGate>
  );
}

function TeacherWindowContent({ lessonId }: { lessonId: string }) {
  const [data, setData] = useState<TeacherData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    requestJson<TeacherData>(`/api/live-lessons/${lessonId}/teacher`)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Müəllim məlumatlarını yükləmək olmadı.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedTask =
    data?.tasks[selectedIndex ?? data.activeTaskIndex] ?? null;

  return (
    <main className="min-h-screen bg-background p-5 sm:p-8">
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-4 text-danger-600">
          {error}
        </p>
      )}
      {data && (
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold text-brand-700">
            {data.groupName} · {data.title}
          </p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Sual {(selectedIndex ?? data.activeTaskIndex) + 1} / {data.taskCount}
              </p>
              <h1 className="mt-1 text-3xl font-bold">
                {selectedTask?.title ?? "Sual tapılmadı"}
              </h1>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
              data.status === "live"
                ? "bg-success-50 text-success-600"
                : data.status === "ended"
                  ? "bg-surface-muted text-muted"
                  : "bg-warning-50 text-warning-600"
            }`}>
              {data.status === "live" ? "Canlı" : data.status === "ended" ? "Bitib" : "Hazır"}
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Suallar və izahlar"
            className="mt-6 flex gap-2 overflow-x-auto border-b border-border pb-3"
          >
            {data.tasks.map((task, index) => (
              <Button
                key={task._id}
                type="button"
                role="tab"
                aria-selected={(selectedIndex ?? data.activeTaskIndex) === index}
                size="sm"
                variant={(selectedIndex ?? data.activeTaskIndex) === index ? "primary" : "outline"}
                onClick={() => setSelectedIndex(index)}
              >
                {index + 1}. sual
              </Button>
            ))}
          </div>

          {selectedTask ? (
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7">
                <TaskContent
                  contentBlocks={selectedTask.contentBlocks}
                  prompt={selectedTask.prompt}
                />
                {selectedTask.options.length > 0 && (
                  <div
                    className={`mt-5 ${
                      selectedTask.options.some((option) => option.imageUrl)
                        ? "grid grid-cols-2 gap-2"
                        : "space-y-2"
                    }`}
                  >
                    {selectedTask.options.map((option, index) => (
                      <div
                        key={option.id}
                        className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-surface-muted p-3 text-sm"
                      >
                        <span className="font-bold">{index + 1}.</span>
                        <TaskOptionContent option={option} />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-6 rounded-xl border border-warning-200 bg-warning-50 p-5">
                  <h2 className="text-lg font-bold text-warning-700">İzah</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {selectedTask.explanation || "Bu sual üçün izah qeyd edilməyib."}
                  </p>
                </div>
              </section>
              <aside className="h-fit rounded-2xl border border-success-200 bg-success-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-success-700">
                  Düzgün cavab
                </p>
                <p className="mt-2 text-lg font-bold text-success-700">
                  {correctAnswerText(selectedTask)}
                </p>
              </aside>
            </div>
          ) : (
            <section className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center text-muted">
              Bu dərsdə göstəriləcək sual yoxdur.
            </section>
          )}
          <p className="mt-4 text-xs text-muted">
            Bu pəncərə avtomatik sinxronlaşmır. Suallar arasında buradakı tablardan özünüz keçin.
          </p>
        </div>
      )}
    </main>
  );
}

function correctAnswerText(task: TeacherTask) {
  const answers = Array.isArray(task.correctAnswer)
    ? task.correctAnswer
    : [task.correctAnswer];
  return answers
    .map((answer) => {
      if (typeof answer !== "string") return String(answer);
      const option = task.options.find((item) => item.id === answer);
      return option?.text || (option?.imageUrl ? "Şəkil variantı" : answer);
    })
    .join(task.type === "drag_drop" ? " → " : ", ");
}
