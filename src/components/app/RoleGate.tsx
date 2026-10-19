"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError, requestJson } from "@/src/lib/client-api";

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: "admin" | "student";
  approvalStatus: "pending" | "approved";
}

interface RoleGateProps {
  role: CurrentUser["role"];
  children: (user: CurrentUser) => ReactNode;
}

export function RoleGate({ role, children }: RoleGateProps) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    requestJson<{ user: CurrentUser }>("/api/auth/me")
      .then(({ user: currentUser }) => {
        if (cancelled) return;
        if (currentUser.role !== role) {
          router.replace(currentUser.role === "admin" ? "/admin" : "/student");
          return;
        }
        if (
          currentUser.role === "student" &&
          currentUser.approvalStatus === "pending"
        ) {
          router.replace("/student/pending");
          return;
        }
        setUser(currentUser);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (
          cause instanceof ApiError &&
          cause.status === 401
        ) {
          router.replace("/login");
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "İstifadəçi məlumatlarını yükləmək mümkün olmadı.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [role, router]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-danger-100 bg-surface p-6 text-center shadow-sm">
          <p className="font-medium text-danger-600">{error}</p>
          <button
            className="mt-4 text-sm font-semibold text-brand-700"
            onClick={() => window.location.reload()}
          >
            Yenidən yoxla
          </button>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
      </main>
    );
  }

  return children(user);
}
