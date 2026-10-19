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

  return (
    <div className={`min-h-screen ${role === "student" ? "student-theme-shell bg-background" : "bg-background"}`}>
      <header
        className={`border-b border-border bg-surface ${
          role === "student" ? "student-theme-header" : ""
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black text-white ${
              role === "student"
                ? "bg-gradient-to-br from-fuchsia-500 via-purple-500 to-blue-500 shadow-lg shadow-purple-200"
                : "bg-brand-600"
            }`}>
              B
            </span>
            <span>
              <span className="block font-bold tracking-tight text-foreground">
                Bebras
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
            {role === "student" && (
              <nav
                aria-label="Əsas menyu"
                className="flex items-center gap-1"
              >
                {[
                  { href: "/student", label: "Panel" },
                  { href: "/student/assignments", label: "Ev tapşırıqları" },
                  { href: "/student/live-lessons", label: "Canlı dərslər" },
                ].map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`rounded-xl px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm ${
                        active
                          ? "bg-white text-purple-700 shadow-md shadow-purple-100"
                          : "text-muted hover:bg-surface-muted hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
            {role === "student" ? (
              <Link
                href="/student/profile"
                className="flex items-center gap-2"
                aria-label="Profil və parametrlər"
              >
                <Image
                  src={avatar}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover"
                />
                <span className="hidden text-sm font-medium text-foreground sm:block">
                  {name}
                </span>
              </Link>
            ) : (
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
      <main className={`mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 ${
        role === "student" ? "student-theme" : ""
      }`}>
        {children}
      </main>
    </div>
  );
}
