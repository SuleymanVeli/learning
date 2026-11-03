"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Card } from "@/src/components/ui/Card";
import { StudentGroupTabs } from "@/src/components/student/StudentGroupTabs";
import { requestJson } from "@/src/lib/client-api";

interface StudentGroup {
  _id: string;
  name: string;
}

interface LessonSummary {
  id: string;
  title: string;
  groupId: string;
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
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [error, setError] = useState("");
  const visibleLessons = selectedGroupId
    ? lessons.filter((lesson) => lesson.groupId === selectedGroupId)
    : lessons;

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      requestJson<{
        groups: StudentGroup[];
        lessons: LessonSummary[];
      }>("/api/student/live-lessons")
        .then((result) => {
          if (cancelled) return;
          setGroups(result.groups);
          setLessons(result.lessons);
          setError("");
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
      <div className="mb-6">
        <p className="text-sm font-extrabold text-sky-700">🎮 Birlikdə öyrənək</p>
        <h1 className="mt-1 text-3xl font-black">Canlı dərslər</h1>
      </div>
      {error && <p role="alert" className="mb-4 text-danger-600">{error}</p>}
      <StudentGroupTabs
        groups={groups}
        selectedGroupId={selectedGroupId}
        onSelect={setSelectedGroupId}
        label="Canlı dərsləri qrupa görə süzgəclə"
      />
      {visibleLessons.length ? (
        <div className="student-homework-list flex flex-col gap-3">
          {visibleLessons.map((lesson) => (
            <Link
              key={lesson.id}
              href={`/student/live-lessons/${lesson.id}`}
              className="student-homework-list-row student-card-reading flex items-center gap-3 rounded-3xl px-4 py-3 text-left transition sm:gap-4 sm:px-5"
            >
              <span className="student-homework-list-icon" aria-hidden="true">🎮</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-black text-slate-800 sm:text-lg">
                  {lesson.title}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                  {lesson.groupName ?? "Dərs otağı"}
                  {lesson.hasStarted
                    ? ` · Sual ${lesson.taskIndex + 1} / ${lesson.taskCount}`
                    : " · Müəllim başladanda qoşul"}
                </span>
              </span>
              <span className={`student-homework-status shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold ${
                lesson.hasStarted
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}>
                {lesson.hasStarted ? "Canlıdır" : "Gözləmədə"}
              </span>
              <span aria-hidden="true" className="student-list-arrow">›</span>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="student-content-card text-center text-slate-500">
          {selectedGroupId
            ? "Bu qrupda hazırda aktiv canlı dərs yoxdur."
            : "Hazırda aktiv canlı dərs yoxdur."}{" "}
          Səhifə avtomatik yenilənir.
        </Card>
      )}
    </DashboardShell>
  );
}
