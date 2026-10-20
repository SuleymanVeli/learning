"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { requestJson } from "@/src/lib/client-api";

export function JoinRegistration({ accessCode }: { accessCode: string }) {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    requestJson<{ group: { name: string } }>(
      `/api/groups/join/${encodeURIComponent(accessCode)}`,
    )
      .then(({ group }) => {
        if (!cancelled) setGroupName(group.name);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Dəvət linkini yoxlamaq mümkün olmadı.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessCode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setSubmitting(true);
    try {
      await requestJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          accessCode,
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      router.replace("/student/pending");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Qeydiyyatı tamamlamaq mümkün olmadı.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg p-6 sm:p-9">
        <Link href="/login" className="text-sm font-bold text-brand-700">
          BeMath
        </Link>
        {loading ? (
          <p className="mt-10 text-sm text-muted">Dəvət linki yoxlanılır...</p>
        ) : error && !groupName ? (
          <div className="mt-8">
            <h1 className="text-2xl font-bold">Link açılmadı</h1>
            <p role="alert" className="mt-3 text-sm text-danger-600">
              {error}
            </p>
            <Link
              href="/login"
              className="mt-5 inline-block text-sm font-semibold text-brand-700"
            >
              Giriş səhifəsinə qayıt
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-8 text-sm font-semibold text-brand-700">
              Qrupa qoşul
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              {groupName}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Qeydiyyat məlumatlarını daxil et. Qeydiyyatdan sonra email
              təsdiqi tələb olunmur.
            </p>
            <form className="mt-7 space-y-4" onSubmit={submit}>
              <Input
                label="Ad və soyad"
                name="name"
                autoComplete="name"
                maxLength={100}
                required
              />
              <Input
                label="E-poçt"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
              <Input
                label="Şifrə"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-600"
                >
                  {error}
                  {causeNeedsLogin(error) && (
                    <>
                      {" "}
                      <Link
                        href="/login"
                        className="font-semibold underline"
                      >
                        Daxil ol
                      </Link>
                    </>
                  )}
                </p>
              )}
              <Button className="w-full" type="submit" disabled={submitting}>
                {submitting ? "Hesab yaradılır..." : "Qeydiyyatdan keç"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted">
              Artıq hesabın var?{" "}
              <Link href="/login" className="font-semibold text-brand-700">
                Daxil ol
              </Link>
            </p>
          </>
        )}
      </Card>
    </main>
  );
}

function causeNeedsLogin(message: string) {
  return message.includes("artıq mövcuddur");
}
