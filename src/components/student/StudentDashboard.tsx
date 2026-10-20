"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
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
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-extrabold text-violet-700">🌈 Öyrənmək əyləncəlidir!</p>
          <h1 className="mt-1 text-3xl font-black sm:text-4xl">
            Salam, {name.split(" ")[0]}!
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Bu gün yeni bir şey öyrənməyə hazırsan?</p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-2xl bg-danger-50 px-4 py-3 text-sm text-danger-600 shadow-md shadow-red-100"
        >
          {error}
        </p>
      )}
      <section aria-label="Öyrənmə göstəriciləri" className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="student-stat-card student-stat-stars">
          <span className="student-stat-icon">📚</span>
          <span><span className="block text-2xl font-black">{data.assignments.length}</span><span className="text-sm font-bold">Ev tapşırığı</span></span>
        </div>
        <div className="student-stat-card student-stat-streak">
          <span className="student-stat-icon">🎮</span>
          <span><span className="block text-2xl font-black">{data.live ? "1" : "0"}</span><span className="text-sm font-bold">Canlı dərs</span></span>
        </div>
        <div className="student-stat-card student-stat-badges">
          <span className="student-stat-icon">⭐</span>
          <span><span className="block text-lg font-black">{data.live ? (data.live.hasStarted ? "Aktiv" : "Gözləyir") : "Hazır"}</span><span className="text-sm font-bold">Dərs vəziyyəti</span></span>
        </div>
      </section>

      <section aria-label="Öyrənmə bölmələri">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-violet-700">Sənin üçün</p>
            <h2 className="text-2xl font-black">Haradan başlayaq?</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Link
            href="/student/assignments"
            className="student-play-card student-card-math flex min-h-64 flex-col items-center justify-center p-6 text-center"
          >
            <span className="student-category-illustration" aria-hidden="true">📚</span>
            <h3 className="mt-3 text-xl font-black">Ev tapşırıqları</h3>
            <p className="student-card-subtitle mt-1 text-sm">{data.assignments.length} tapşırıq səni gözləyir</p>
            <span className="student-card-link mt-4">Tapşırıqlara başla →</span>
          </Link>
          <Link
            href={data.live ? `/student/live-lessons/${data.live.id}` : "/student/live-lessons"}
            className="student-play-card student-card-puzzle flex min-h-64 flex-col items-center justify-center p-6 text-center"
          >
            <span className="student-category-illustration" aria-hidden="true">🎮</span>
            <h3 className="mt-3 text-xl font-black">{data.live?.title ?? "Canlı dərslər"}</h3>
            <p className="student-card-subtitle mt-1 text-sm">
              {data.live
                ? data.live.hasStarted
                  ? `Sual ${data.live.taskIndex + 1} / ${data.live.taskCount} · indi qoşul`
                  : "Müəllim dərsi başladana qədər sual göstərilmir."
                : "Yeni dərs başlayanda burada görünəcək."}
            </p>
            {data.live?.hasStarted && (
              <span className="mt-3 rounded-xl bg-white px-3 py-1 font-mono font-black text-amber-800 shadow-sm" aria-live="polite">
                {Math.floor(remaining / 60).toString().padStart(2, "0")}:{(remaining % 60).toString().padStart(2, "0")}
              </span>
            )}
            <span className="student-card-link mt-4">{data.live ? "Dərsə qoşul →" : "Dərslərə bax →"}</span>
          </Link>
        </div>
      </section>
    </DashboardShell>
  );
}
