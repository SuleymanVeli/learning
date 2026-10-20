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
  role: "admin" | "student";
  avatar?: string;
  children: ReactNode;
}

export function DashboardShell({
  name,
  role,
  avatar = "/avatars/avatar-1.png",
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

  return (
    <div className="min-h-screen bg-background">
      <header
        className="border-b border-border bg-surface"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
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
              <span className="block text-xs text-muted">
                {role === "admin" ? "Müəllim paneli" : "Şagird paneli"}
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            {role === "admin" && (
              <nav
                aria-label="Əsas menyu"
                className="flex flex-wrap items-center justify-end gap-0.5 sm:gap-1"
              >
                {[
                  { href: "/admin", label: "Panel" },
                  { href: "/admin/quizzes", label: "Quizlər" },
                  { href: "/admin/tasks", label: "Tapşırıqlar" },
                  { href: "/admin/live-lessons", label: "Canlı dərslər" },
                  { href: "/admin/assignments", label: "Ev tapşırıqları" },
                  { href: "/admin/groups", label: "Qruplar" },
                  { href: "/admin/users", label: "Şagirdlər" },
                ].map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/admin" &&
                      pathname.startsWith(`${item.href}/`));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`rounded-lg px-2 py-2 text-xs font-medium transition sm:px-3 sm:text-sm ${
                        active
                          ? "bg-brand-50 text-brand-700"
                          : "text-muted hover:bg-surface-muted hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
            {(
              <span className="hidden text-sm font-medium text-foreground sm:block">
                {name}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={logout}>
              Çıxış
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
