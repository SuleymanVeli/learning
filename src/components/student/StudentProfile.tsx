"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { requestJson } from "@/src/lib/client-api";

const AVATARS = Array.from(
  { length: 12 },
  (_, index) => `/avatars/avatar-${index + 1}.png`,
);

export function StudentProfile() {
  return (
    <RoleGate role="student">
      {(user) => <StudentProfileContent user={user} />}
    </RoleGate>
  );
}

function StudentProfileContent({
  user,
}: {
  user: { name: string; email: string; avatar: string };
}) {
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (newPassword && newPassword !== confirmPassword) {
      setError("Yeni şifrələr eyni deyil.");
      return;
    }
    if (newPassword && !currentPassword) {
      setError("Şifrəni dəyişmək üçün cari şifrəni daxil edin.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, string> = { name, avatar };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      const { user: updatedUser } = await requestJson<{
        user: { name: string; avatar: string };
      }>("/api/student/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setName(updatedUser.name);
      setAvatar(updatedUser.avatar);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Profil məlumatları yadda saxlanıldı.");
      if (newPassword) window.location.assign("/login");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Profili yeniləmək olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell name={name} role="student" avatar={avatar}>
      <div className="mb-7">
        <p className="text-sm font-extrabold text-violet-700">🌟 Sənin hesabın</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Mənim profilim</h1>
        <p className="mt-2 font-semibold text-slate-500">
          Adını, avatarını və hesab şifrəsini dəyiş.
        </p>
      </div>
      <Card className="student-content-card mx-auto max-w-2xl p-6 sm:p-8">
        <form className="space-y-6" onSubmit={saveProfile}>
          {error && (
            <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-600">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-xl bg-success-50 px-4 py-3 text-sm text-success-600">
              {notice}
            </p>
          )}
          <Input
            label="Ad və soyad"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={100}
            required
          />
          <div>
            <p className="mb-3 text-sm font-semibold">Avatar seç</p>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {AVATARS.map((path) => (
                <button
                  key={path}
                  type="button"
                  aria-label={`Avatar ${path.match(/avatar-(\d+)/)?.[1]}`}
                  aria-pressed={avatar === path}
                  onClick={() => setAvatar(path)}
                  className={`student-avatar-choice rounded-full p-1 transition ${
                    avatar === path
                      ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-200 ring-2 ring-violet-200"
                      : "bg-white shadow-md shadow-slate-200 hover:shadow-lg"
                  }`}
                >
                  <Image
                    src={path}
                    alt=""
                    width={72}
                    height={72}
                    className="aspect-square w-full rounded-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4 border-t border-border pt-5">
            <div>
              <h2 className="font-semibold">Şifrəni dəyiş</h2>
              <p className="mt-1 text-sm text-muted">
                E-poçt: {user.email}. Şifrəni yenilədikdən sonra yenidən daxil ol.
              </p>
            </div>
            <Input
              label="Cari şifrə"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.currentTarget.value)}
            />
            <Input
              label="Yeni şifrə"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.currentTarget.value)}
            />
            <Input
              label="Yeni şifrəni təkrar yaz"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving} className="student-action-button">
              {saving ? "Yadda saxlanılır..." : "Dəyişiklikləri yadda saxla"}
            </Button>
          </div>
        </form>
      </Card>
    </DashboardShell>
  );
}
