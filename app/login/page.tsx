"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { ApiError, requestJson } from "@/src/lib/client-api";

interface LoginResponse {
  user: {
    role: "admin" | "student";
    approvalStatus: "pending" | "approved";
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    requestJson<{
      user: {
        role: "admin" | "student";
        approvalStatus: "pending" | "approved";
      };
    }>("/api/auth/me")
      .then(({ user }) => {
        if (!cancelled) {
          router.replace(
            user.role === "admin"
              ? "/admin"
              : user.approvalStatus === "pending"
                ? "/student/pending"
                : "/student",
          );
        }
      })
      .catch((cause: unknown) => {
        if (cancelled || (cause instanceof ApiError && cause.status === 401)) {
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Giriş vəziyyətini yoxlamaq olmadı.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const { user } = await requestJson<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      router.replace(
        user.role === "admin"
          ? "/admin"
          : user.approvalStatus === "pending"
            ? "/student/pending"
            : "/student",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Daxil olmaq mümkün olmadı.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute -left-24 -top-32 h-96 w-96 rounded-full bg-brand-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-16 h-96 w-96 rounded-full bg-success-100/70 blur-3xl" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-surface shadow-xl shadow-slate-200/60 md:grid-cols-2">
        <section className="hidden flex-col justify-between bg-brand-600 p-10 text-white md:flex">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-xl font-black">
              B
            </div>
            <p className="mt-16 text-sm font-semibold uppercase tracking-[0.2em] text-blue-100">
              Öyrən. Sına. Kəşf et.
            </p>
            <h1 className="mt-4 max-w-sm text-4xl font-bold leading-tight">
              Bebras dünyasına xoş gəlmisən
            </h1>
            <p className="mt-5 max-w-sm leading-7 text-blue-100">
              Canlı dərslərə qoşul, maraqlı tapşırıqları həll et və öz
              nəticələrini izlə.
            </p>
          </div>
          <p className="text-sm text-blue-100">
            Məntiq və informatika hər kəs üçün.
          </p>
        </section>
        <section className="p-6 sm:p-10">
          <Link
            href="/"
            className="text-sm font-bold tracking-tight text-brand-700 md:hidden"
          >
            BEBRAS
          </Link>
          <div className="mt-8 md:mt-12">
            <p className="text-sm font-semibold text-brand-700">
              Hesabına daxil ol
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
              Xoş gəldin!
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Davam etmək üçün e-poçtunu və şifrənizi daxil et.
            </p>
          </div>
          <form className="mt-7 space-y-5" onSubmit={submit}>
            <Input
              label="E-poçt"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="ad@example.com"
              required
            />
            <Input
              label="Şifrə"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Şifrənizi daxil edin"
              required
            />
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-600"
              >
                {error}
              </p>
            )}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Yoxlanılır..." : "Daxil ol"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            İlk admin hesabıdır?{" "}
            <Link
              href="/setup"
              className="font-semibold text-brand-700 hover:text-brand-600"
            >
              Quraşdırmanı başlat
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
