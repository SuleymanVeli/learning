"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Card } from "@/src/components/ui/Card";
import { requestJson } from "@/src/lib/client-api";

interface LessonSummary {
  id: string;
  title: string;
  groupName?: string;
  taskIndex: number;
  taskCount: number;
  hasStarted: boolean;
}

export default function StudentLiveLessonsPage() {
  return (
    <RoleGate role="student">
      {(user) => (
        <StudentLiveLessonsContent
          name={user.name}
          avatar={user.avatar}
        />
      )}
    </RoleGate>
  );
}

function StudentLiveLessonsContent({
  name,
  avatar,
}: {
  name: string;
  avatar: string;
}) {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      requestJson<{ live: LessonSummary | null }>("/api/student/dashboard")
        .then(({ live }) => {
          if (!cancelled) setLessons(live ? [live] : []);
        })
        .catch((cause: unknown) => {
          if (!cancelled)
            setError(
              cause instanceof Error ? cause.message : "Dərsləri yükləmək olmadı.",
            );
        });
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <DashboardShell name={name} role="student" avatar={avatar}>
      <h1 className="mb-6 text-3xl font-bold">Canlı dərslər</h1>
      {error && <p role="alert" className="mb-4 text-danger-600">{error}</p>}
      {lessons.length ? (
        lessons.map((lesson) => (
          <Card key={lesson.id}>
            <p className="text-sm font-semibold text-brand-700">
              {lesson.groupName ?? "Dərs otağı"}
            </p>
            <h2 className="mt-1 text-xl font-bold">{lesson.title}</h2>
            <p className="mt-2 text-sm text-muted">
              {lesson.hasStarted
                ? `Aktiv tab ${lesson.taskIndex + 1} / ${lesson.taskCount}`
                : "Müəllim dərsi başladana qədər sual göstərilmir."}
            </p>
            <Link
              href={`/student/live-lessons/${lesson.id}`}
              className="mt-4 inline-flex rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              {lesson.hasStarted ? "Dərsə qoşul" : "Dərs otağına daxil ol"}
            </Link>
          </Card>
        ))
      ) : (
        <Card className="text-center text-muted">
          Hazırda aktiv canlı dərs yoxdur. Səhifə avtomatik yenilənir.
        </Card>
      )}
    </DashboardShell>
  );
}
