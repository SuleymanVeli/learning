"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { requestJson } from "@/src/lib/client-api";

interface TeacherItem {
  _id: string;
  name: string;
  email: string;
}

export function TeacherManagement() {
  return (
    <RoleGate role="teacher">
      {(user) => (
        <TeacherManagementContent
          name={user.name}
          avatar={user.avatar}
          canManageTeachers={user.canManageTeachers}
        />
      )}
    </RoleGate>
  );
}

function TeacherManagementContent({
  name,
  avatar,
  canManageTeachers,
}: {
  name: string;
  avatar: string;
  canManageTeachers: boolean;
}) {
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loading, setLoading] = useState(canManageTeachers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!canManageTeachers) return;
    let cancelled = false;
    requestJson<{ teachers: TeacherItem[] }>("/api/teachers")
      .then(({ teachers: rows }) => {
        if (!cancelled) setTeachers(rows);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Müəllim siyahısını yükləmək olmadı.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManageTeachers]);

  async function createTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { teacher } = await requestJson<{
        teacher: { id: string; name: string; email: string };
      }>("/api/teachers", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      setTeachers((current) =>
        [...current, { _id: teacher.id, name: teacher.name, email: teacher.email }]
          .sort((left, right) => left.name.localeCompare(right.name, "az")),
      );
      formElement.reset();
      setNotice("Müəllim hesabı yaradıldı.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Müəllim hesabı yaratmaq olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell
      name={name}
      role="teacher"
      avatar={avatar}
      canManageTeachers={canManageTeachers}
    >
      <div className="mb-6">
        <p className="text-sm font-semibold text-brand-700">Müəllim paneli</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Müəllimlər</h1>
        <p className="mt-2 text-muted">
          Müəllimləri hesablarına və qruplara əlavə et.
        </p>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-success-50 p-3 text-sm text-success-600">{notice}</p>}
      {canManageTeachers ? (
        <>
          <Card className="mb-6 max-w-2xl">
          <h2 className="mb-4 text-lg font-bold">Yeni müəllim hesabı</h2>
          <form onSubmit={createTeacher} className="grid gap-4 sm:grid-cols-2">
            <Input label="Ad və soyad" name="name" maxLength={100} required />
            <Input label="E-poçt" name="email" type="email" maxLength={254} required />
            <Input label="İlkin şifrə" name="password" type="password" minLength={8} maxLength={128} required />
            <div className="flex items-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Yaradılır..." : "Müəllim yarat"}
              </Button>
            </div>
          </form>
          </Card>
          <Card>
        <h2 className="mb-4 text-lg font-bold">Müəllim hesabları</h2>
        {loading ? (
          <p className="text-sm text-muted">Yüklənir...</p>
        ) : teachers.length ? (
          <ul className="divide-y divide-border">
            {teachers.map((teacher) => (
              <li key={teacher._id} className="flex flex-wrap justify-between gap-2 py-3">
                <span className="font-semibold">{teacher.name}</span>
                <span className="text-sm text-muted">{teacher.email}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Müəllim hesabı yoxdur.</p>
        )}
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-sm text-muted">
            Müəllim hesablarını yalnız platform idarəçisi görə bilər.
          </p>
        </Card>
      )}
    </DashboardShell>
  );
}
