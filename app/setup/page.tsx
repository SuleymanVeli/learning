"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { requestJson } from "@/src/lib/client-api";

interface BootstrapResponse {
  user: { role: "admin" | "student" };
}

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const { user } = await requestJson<BootstrapResponse>(
        "/api/auth/bootstrap-admin",
        {
          method: "POST",
          body: JSON.stringify({
            token: form.get("token"),
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
          }),
        },
      );
      router.replace(user.role === "admin" ? "/admin" : "/student");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Admin hesabı yaratmaq mümkün olmadı.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg p-6 sm:p-9">
        <Link href="/" className="text-sm font-bold text-brand-700">
          BEBRAS PLATFORM
        </Link>
        <p className="mt-8 text-sm font-semibold text-brand-700">
          İlkin quraşdırma
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Admin hesabı yarat
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Serverdəki <code>ADMIN_BOOTSTRAP_TOKEN</code> dəyəri yalnız ilk admin
          hesabının yaradılması üçün istifadə olunur.
        </p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <Input
            label="Quraşdırma tokeni"
            name="token"
            type="password"
            autoComplete="off"
            minLength={24}
            required
          />
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
            </p>
          )}
          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Hesab yaradılır..." : "Admin yarat"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          Artıq hesabın var?{" "}
          <Link href="/login" className="font-semibold text-brand-700">
            Daxil ol
          </Link>
        </p>
      </Card>
    </main>
  );
}
