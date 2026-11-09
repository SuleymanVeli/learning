"use client";

import Link from "next/link";
import { ArrowUpRight, BookOpen, ClipboardList, Radio } from "lucide-react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";

export function AdminDashboard() {
  return (
    <RoleGate role="admin">
      {(user) => (
        <DashboardShell
          name={user.name}
          role="admin"
          avatar={user.avatar}
          canManageTeachers={user.canManageTeachers}
        >
          <div className="space-y-8">
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-700 px-6 py-8 text-white shadow-lg sm:px-10 sm:py-11">
              <div
                aria-hidden="true"
                className="absolute -right-12 -top-20 h-64 w-64 rounded-full border-[36px] border-white/10"
              />
              <div
                aria-hidden="true"
                className="absolute -bottom-24 right-1/4 h-48 w-48 rounded-full bg-white/5"
              />
              <div className="relative max-w-2xl">
                <p className="text-sm font-semibold text-white/75">
                  BeMath müəllim paneli
                </p>
                <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Salam, {user.name}! <span aria-hidden="true">👋</span>
                </h1>
                <p className="mt-3 text-base leading-relaxed text-white/85 sm:text-lg">
                  Öyrənmə prosesini birlikdə daha maraqlı edək. Bu gün haradan
                  başlamaq istəyirsən?
                </p>
              </div>
            </section>

            <section aria-labelledby="admin-quick-links">
              <div className="mb-4">
                <h2 id="admin-quick-links" className="text-xl font-bold">
                  Sürətli keçidlər
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Əsas iş bölmələrinə buradan keç.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Link
                  href="/admin/assignments"
                  className="group rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <BookOpen aria-hidden="true" className="h-6 w-6" />
                  </span>
                  <span className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-lg font-bold">Ev tapşırıqları</span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="h-5 w-5 text-muted transition group-hover:text-brand-700"
                    />
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    Qruplara ev tapşırıqları ver və nəticələri izlə.
                  </span>
                </Link>

                <Link
                  href="/admin/live-lessons"
                  className="group rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-success-200 hover:shadow-md"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-50 text-success-600">
                    <Radio aria-hidden="true" className="h-6 w-6" />
                  </span>
                  <span className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-lg font-bold">Canlı dərslər</span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="h-5 w-5 text-muted transition group-hover:text-success-600"
                    />
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    Dərsləri planlaşdır və canlı sessiyaları idarə et.
                  </span>
                </Link>

                <Link
                  href="/admin/tasks"
                  className="group rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-warning-200 hover:shadow-md"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning-50 text-warning-600">
                    <ClipboardList aria-hidden="true" className="h-6 w-6" />
                  </span>
                  <span className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-lg font-bold">Tapşırıqlar</span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="h-5 w-5 text-muted transition group-hover:text-warning-600"
                    />
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    Quizlər üçün tapşırıqlar yarat və redaktə et.
                  </span>
                </Link>
              </div>
            </section>
          </div>
        </DashboardShell>
      )}
    </RoleGate>
  );
}
