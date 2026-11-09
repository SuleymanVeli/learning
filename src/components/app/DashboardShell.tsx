"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import type { ReactNode } from "react";
import { Button } from "@/src/components/ui/Button";
import { requestJson } from "@/src/lib/client-api";

interface DashboardShellProps {
  name: string;
  role: "admin" | "teacher" | "student";
  avatar?: string;
  canManageTeachers?: boolean;
  children: ReactNode;
}

export function DashboardShell({
  name,
  role,
  avatar = "/avatars/avatar-1.png",
  canManageTeachers = false,
  children,
}: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    try {
      await requestJson<{ success: boolean }>("/api/auth/logout", {
        method: "POST",
      });
      router.replace("/login");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Çıxış etmək mümkün olmadı.",
      );
    }
  }

  if (role === "student") {
    const navigation = [
      { href: "/student", label: "Panel", icon: "🏠", theme: "home" },
      { href: "/student/assignments", label: "Ev tapşırıqları", icon: "📚", theme: "courses" },
      { href: "/student/live-lessons", label: "Canlı dərslər", icon: "🎮", theme: "games" },
      { href: "/student/profile", label: "Profilim", icon: "⚙️", theme: "settings" },
    ];

    return (
      <div className="student-theme-shell min-h-screen">
        <aside className="student-sidebar fixed inset-y-0 left-0 z-30 hidden w-[270px] flex-col px-5 py-7 md:flex">
          <Link href="/student" className="student-brand mb-10 flex items-center gap-3">
            <Image
              src="/android-chrome-192x192.png"
              alt=""
              width={48}
              height={48}
              className="rounded-2xl shadow-lg shadow-violet-200"
            />
            <span>
              <span className="block text-xl font-extrabold text-slate-800">BeMath</span>
              <span className="block text-xs font-bold text-slate-500">Öyrənmək əyləncəlidir!</span>
            </span>
          </Link>
          <p className="mb-3 px-3 text-xs font-extrabold uppercase tracking-widest text-slate-400">
            Menyu
          </p>
          <nav aria-label="Şagird menyusu" className="flex flex-col gap-2">
            {navigation.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/student" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`student-nav-link student-nav-${item.theme} ${active ? "is-active" : ""}`}
                >
                  <span aria-hidden="true" className="text-xl">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto">
            <button type="button" onClick={() => void logout()} className="student-logout w-full">
              <span aria-hidden="true">👋</span> Çıxış
            </button>
          </div>
        </aside>

        <div className="min-h-screen md:ml-[270px]">
          <header className="student-topbar sticky top-0 z-20 px-4 py-3 sm:px-7 md:px-10">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
              <Link href="/student" className="student-brand flex items-center gap-2 md:hidden">
                <Image
                  src="/android-chrome-192x192.png"
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-xl shadow-md"
                />
                <span className="font-extrabold text-slate-800">BeMath</span>
              </Link>
              <nav aria-label="Şagird menyusu" className="student-mobile-nav flex items-center gap-1 overflow-x-auto md:hidden">
                {navigation.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/student" && pathname.startsWith(`${item.href}/`));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      className={`student-mobile-nav-link student-nav-${item.theme} ${active ? "is-active" : ""}`}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                    </Link>
                  );
                })}
              </nav>
              <Link href="/student/profile" className="student-top-profile flex items-center gap-2 rounded-full py-1 pl-1 pr-3">
                <Image
                  src={avatar}
                  alt=""
                  width={38}
                  height={38}
                  className="h-[38px] w-[38px] rounded-full border-2 border-white object-cover shadow-sm"
                />
                <span className="hidden max-w-40 truncate text-sm font-extrabold text-slate-800 sm:block">{name}</span>
              </Link>
              <button
                type="button"
                aria-label="Çıxış"
                onClick={() => void logout()}
                className="student-mobile-logout md:hidden"
              >
                ↪
              </button>
            </div>
          </header>
          <main className="student-theme mx-auto max-w-7xl px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    );
  }

  const teacherNavigation = [
    { href: "/admin", label: "Panel", icon: "🏠" },
    { href: "/admin/assignments", label: "Ev tapşırıqları", icon: "📚" },
    { href: "/admin/live-lessons", label: "Canlı dərslər", icon: "🎮" },
    { href: "/admin/tasks", label: "Tapşırıqlar", icon: "📝" },
    { href: "/admin/quizzes", label: "Quizlər", icon: "🧩" },
    { href: "/admin/users", label: "Şagirdlər", icon: "🎓" },
    { href: "/admin/groups", label: "Qruplar", icon: "👥" },
    ...(canManageTeachers
      ? [{ href: "/admin/teachers", label: "Müəllimlər", icon: "👩‍🏫" }]
      : []),
    { href: "/admin/profile", label: "Profilim", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface px-4 py-6 md:flex">
        <Link href="/admin" className="mb-9 flex items-center gap-3 px-2">
            <Image
              src="/android-chrome-192x192.png"
              alt=""
              width={40}
              height={40}
              className="rounded-xl"
            />
            <span>
              <span className="block font-bold tracking-tight text-foreground">
                BeMath
              </span>
              <span className="block text-xs text-muted">Müəllim paneli</span>
            </span>
          </Link>
        <p className="mb-3 px-3 text-xs font-bold uppercase tracking-widest text-muted">Menyu</p>
        <nav aria-label="Müəllim menyusu" className="flex flex-col gap-1">
          {teacherNavigation.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t border-border pt-4">
          <Image
            src={avatar}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <Link href="/admin/profile" className="text-xs text-brand-700">Profilə bax</Link>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>Çıxış</Button>
        </div>
      </aside>
      <div className="min-h-screen md:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
          <Link href="/admin" className="font-bold">BeMath · Müəllim</Link>
          <Link href="/admin/profile" className="text-sm font-semibold">{name}</Link>
          <Button variant="outline" size="sm" onClick={logout}>Çıxış</Button>
        </header>
        <nav aria-label="Müəllim menyusu" className="flex gap-2 overflow-x-auto border-b border-border bg-surface p-3 md:hidden">
          {teacherNavigation.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 rounded-lg bg-surface-muted px-3 py-2 text-sm font-medium">
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
