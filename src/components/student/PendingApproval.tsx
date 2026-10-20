"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { ApiError, requestJson } from "@/src/lib/client-api";

interface CurrentUser {
  name: string;
  role: "admin" | "student";
  approvalStatus: "pending" | "approved";
}

export function PendingApproval() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");

  const checkApproval = useCallback(async () => {
    try {
      const { user: currentUser } = await requestJson<{ user: CurrentUser }>(
        "/api/auth/me",
      );
      if (currentUser.role === "admin") {
        router.replace("/admin");
        return;
      }
      if (currentUser.approvalStatus === "approved") {
        router.replace("/student");
        return;
      }
      setUser(currentUser);
      setError("");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        router.replace("/login");
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Təsdiq vəziyyətini yoxlamaq olmadı.",
      );
    }
  }, [router]);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => void checkApproval(), 0);
    const interval = window.setInterval(() => void checkApproval(), 5000);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [checkApproval]);

  async function logout() {
    try {
      await requestJson("/api/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Çıxış etmək mümkün olmadı.",
      );
    }
  }

  return (
    <main className="student-theme-shell student-theme flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="student-content-card w-full max-w-lg p-8 text-center sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-warning-50 text-2xl text-warning-600">
          …
        </div>
        <p className="mt-6 text-sm font-semibold text-brand-700">
          {user ? `Salam, ${user.name}` : "Hesabın yoxlanılır"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Admin təsdiqi gözlənilir
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Qeydiyyatın tamamlandı. Şagird paneli hesab administrator tərəfindən
          təsdiqləndikdən sonra açılacaq. Təsdiq olunan kimi bu səhifə avtomatik
          yenilənəcək.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-600"
          >
            {error}
          </p>
        )}
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="outline" onClick={() => void checkApproval()}>
            Vəziyyəti yoxla
          </Button>
          <Button variant="secondary" className="student-action-button" onClick={() => void logout()}>
            Çıxış
          </Button>
        </div>
      </Card>
    </main>
  );
}
