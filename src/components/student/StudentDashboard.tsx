"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Card } from "@/src/components/ui/Card";
import { subscribeToLessonSignal } from "@/src/lib/firebase";
import { requestJson } from "@/src/lib/client-api";

interface LiveLessonView {
  id: string;
  title: string;
  groupName?: string;
  taskIndex: number;
  taskCount: number;
  status: "draft" | "live";
  hasStarted: boolean;
  endsAt: string | null;
  secondsRemaining: number;
}

interface AssignmentView {
  _id: string;
  title: string;
}

interface StudentDashboardData {
  assignments: AssignmentView[];
  live: LiveLessonView | null;
}

const emptyDashboard: StudentDashboardData = {
  assignments: [],
  live: null,
};

export function StudentDashboard() {
  return (
    <RoleGate role="student">
      {(user) => <StudentContent name={user.name} avatar={user.avatar} />}
    </RoleGate>
  );
}

function StudentContent({ name, avatar }: { name: string; avatar: string }) {
  const [data, setData] = useState(emptyDashboard);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(0);

  const load = useCallback(async () => {
    const dashboard = await requestJson<StudentDashboardData>(
      "/api/student/dashboard",
    );
    setData(dashboard);
    return dashboard;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const dashboard = await requestJson<StudentDashboardData>(
          "/api/student/dashboard",
        );
        if (cancelled) return;
        setData(dashboard);
        setError("");
      } catch (cause) {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "Məlumatları yükləmək olmadı.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const lessonId = data.live?.id;
    if (!lessonId) return;
    return subscribeToLessonSignal(
      lessonId,
      () => {
        void load().catch((cause: unknown) => {
          setError(
            cause instanceof Error
              ? cause.message
              : "Canlı dərs vəziyyətini yeniləmək olmadı.",
          );
        });
      },
      (cause) => setError(`Canlı sinxronizasiya xətası: ${cause.message}`),
    ) ?? undefined;
  }, [data.live?.id, load]);

  if (loading) {
    return (
      <DashboardShell name={name} role="student" avatar={avatar}>
        <div className="py-24 text-center text-muted">Panel yüklənir...</div>
      </DashboardShell>
    );
  }

  const remaining = data.live?.endsAt
    ? clock
      ? Math.max(
          0,
          Math.ceil((new Date(data.live.endsAt).getTime() - clock) / 1000),
        )
      : data.live.secondsRemaining
    : 0;

  return (
    <DashboardShell name={name} role="student" avatar={avatar}>
      <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-5 text-white shadow-lg shadow-purple-200 sm:px-7">
        <h1 className="text-2xl font-black sm:text-3xl">
          Salam, {name.split(" ")[0]}!
        </h1>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-2xl bg-danger-50 px-4 py-3 text-sm text-danger-600 shadow-md shadow-red-100"
        >
          {error}
        </p>
      )}
      {data.live ? (
        <section aria-labelledby="live-title">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-rose-100 px-4 py-2 shadow-sm">
            <span className={`relative flex h-3 w-3 ${data.live.hasStarted ? "" : "hidden"}`}>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-500 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-danger-500" />
            </span>
            <p className="text-sm font-bold uppercase tracking-wide text-danger-600">
              {data.live.hasStarted ? "Canlı dərs" : "Dərs gözləmədə"}
            </p>
          </div>
          <Card className="overflow-hidden border-0 bg-white p-0 shadow-xl shadow-blue-100/70">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-sky-100 via-cyan-50 to-violet-100 px-5 py-4 sm:px-7">
              <div>
                <p className="text-sm text-brand-700">{data.live.groupName ?? "Dərs otağı"}</p>
                <h2 id="live-title" className="mt-1 text-xl font-bold">
                  {data.live.title}
                </h2>
                {data.live.hasStarted && (
                  <p className="mt-1 text-sm font-semibold text-violet-700">
                    Sual {data.live.taskIndex + 1}/{data.live.taskCount}
                  </p>
                )}
              </div>
              <a
                href={`/student/live-lessons/${data.live.id}`}
                className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Dərsə keç
              </a>
              <div
                className={`rounded-2xl px-4 py-2 text-center ${
                  !data.live.hasStarted
                    ? "bg-surface-muted text-muted"
                    : remaining > 0
                      ? "bg-surface text-brand-700"
                      : "bg-danger-50 text-danger-600"
                }`}
                aria-live="polite"
              >
                <span className="block text-xs font-medium">
                  {!data.live.hasStarted
                    ? "Müəllim dərsi başladacaq"
                    : "Qalan vaxt"}
                </span>
                {data.live.hasStarted && <span className="font-mono text-xl font-bold">
                  {Math.floor(remaining / 60)
                    .toString()
                    .padStart(2, "0")}
                  :{(remaining % 60).toString().padStart(2, "0")}
                </span>}
              </div>
            </div>

          </Card>
        </section>
      ) : (
        <Card className="mb-6 border-0 bg-gradient-to-r from-sky-50 to-violet-50 px-5 py-5 shadow-lg shadow-blue-100">
          <h2 className="font-bold">Hazırda canlı dərs yoxdur</h2>
        </Card>
      )}

      <section>
        <Card className="flex flex-wrap items-center justify-between gap-4 border-0 shadow-lg shadow-violet-100">
          <div>
            <h2 className="text-lg font-bold">Ev tapşırıqları</h2>
            <p className="mt-1 text-sm text-muted">{data.assignments.length} tapşırıq</p>
          </div>
          <a
            href="/student/assignments"
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Tapşırıqlara keç
          </a>
        </Card>
      </section>
    </DashboardShell>
  );
}
