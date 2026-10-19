"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Modal } from "@/src/components/ui/Modal";
import { Select } from "@/src/components/ui/Select";
import { requestJson } from "@/src/lib/client-api";

interface StudentGroup {
  id: string;
  name: string;
  archived: boolean;
}

interface StudentItem {
  _id: string;
  name: string;
  email: string;
  groupIds: string[];
  groups: StudentGroup[];
  isActive: boolean;
  approvalStatus: "pending" | "approved";
  createdAt: string;
}

type StudentAction =
  | { type: "approve"; student: StudentItem }
  | { type: "deactivate"; student: StudentItem }
  | { type: "activate"; student: StudentItem }
  | { type: "reset-password"; student: StudentItem }
  | { type: "delete"; student: StudentItem };

export function StudentManagement() {
  return (
    <RoleGate role="admin">
      {(user) => <StudentManagementContent name={user.name} />}
    </RoleGate>
  );
}

function StudentManagementContent({ name }: { name: string }) {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "active" | "inactive"
  >("pending");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [action, setAction] = useState<StudentAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStudents = useCallback(async () => {
    const result = await requestJson<{ students: StudentItem[] }>(
      "/api/students",
    );
    setStudents(
      result.students.map((student) => ({
        ...student,
        isActive: student.isActive !== false,
        approvalStatus: student.approvalStatus ?? "approved",
      })),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestJson<{ students: StudentItem[] }>("/api/students")
      .then(({ students: result }) => {
        if (cancelled) return;
        setStudents(
          result.map((student) => ({
            ...student,
            isActive: student.isActive !== false,
            approvalStatus: student.approvalStatus ?? "approved",
          })),
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Şagirdləri yükləmək olmadı.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingCount = students.filter(
    (student) => student.approvalStatus === "pending",
  ).length;
  const activeCount = students.filter(
    (student) => student.approvalStatus === "approved" && student.isActive,
  ).length;
  const inactiveCount = students.filter(
    (student) => student.approvalStatus === "approved" && !student.isActive,
  ).length;
  const groups = useMemo(() => {
    const uniqueGroups = new Map<string, StudentGroup>();
    for (const student of students) {
      for (const group of student.groups) uniqueGroups.set(group.id, group);
    }
    return [...uniqueGroups.values()].sort((left, right) =>
      left.name.localeCompare(right.name, "az"),
    );
  }, [students]);
  const visibleStudents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return students.filter((student) => {
      const matchesStatus =
        statusFilter === "pending"
          ? student.approvalStatus === "pending"
          : statusFilter === "active"
            ? student.approvalStatus === "approved" && student.isActive
            : student.approvalStatus === "approved" && !student.isActive;
      if (!matchesStatus) return false;
      if (
        selectedGroup &&
        !student.groups.some((group) => group.id === selectedGroup)
      ) {
        return false;
      }
      if (!query) return true;
      return (
        student.name.toLocaleLowerCase().includes(query) ||
        student.email.toLocaleLowerCase().includes(query) ||
        student.groups.some((group) =>
          group.name.toLocaleLowerCase().includes(query),
        )
      );
    });
  }, [search, selectedGroup, statusFilter, students]);

  async function updateStatus(
    student: StudentItem,
    status: "approve" | "activate" | "deactivate",
  ) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`/api/students/${student._id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: status }),
      });
      setAction(null);
      setNotice(
        status === "approve"
          ? `${student.name} hesabı təsdiqləndi.`
          : status === "activate"
            ? `${student.name} hesabı aktiv edildi.`
            : `${student.name} hesabı deaktiv edildi.`,
      );
      await loadStudents();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Hesabı yeniləmək olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action?.type !== "reset-password") return;
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`/api/students/${action.student._id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "reset-password", password }),
      });
      const studentName = action.student.name;
      setAction(null);
      setNotice(
        `${studentName} üçün müvəqqəti şifrə təyin edildi. Şifrəni şagirdə təhlükəsiz yolla çatdır.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Şifrəni yeniləmək olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action?.type !== "delete") return;
    const confirmEmail = String(
      new FormData(event.currentTarget).get("confirmEmail") ?? "",
    );
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`/api/students/${action.student._id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmEmail }),
      });
      setNotice(`${action.student.email} hesabı və şəxsi nəticə məlumatları silindi.`);
      setAction(null);
      await loadStudents();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Hesabı silmək olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openAction(nextAction: StudentAction) {
    setError("");
    setNotice("");
    setAction(nextAction);
  }

  return (
    <DashboardShell name={name} role="admin">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-brand-700">
            İdarəetmə / Şagirdlər
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Şagirdlər</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Şagirdlər qrup dəvət linki ilə özləri qeydiyyatdan keçir. Buradan
            hesabları təsdiqlə, deaktiv et, şifrəni sıfırla və ya hesabı sil.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadStudents()}>
          Yenilə
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-600"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-5 rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-600"
        >
          {notice}
        </p>
      )}

      <section className="mb-5 grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Bütün şagirdlər" value={students.length} />
        <SummaryCard label="Aktiv hesablar" value={activeCount} />
        <SummaryCard label="Deaktiv hesablar" value={inactiveCount} />
      </section>

      <Card className="p-0">
        <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap rounded-xl bg-surface-muted p-1">
            <button
              type="button"
              aria-pressed={statusFilter === "pending"}
              onClick={() => setStatusFilter("pending")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                statusFilter === "pending"
                  ? "bg-surface text-brand-700 shadow-sm"
                  : "text-muted"
              }`}
            >
              Təsdiq gözləyən ({pendingCount})
            </button>
            <button
              type="button"
              aria-pressed={statusFilter === "active"}
              onClick={() => setStatusFilter("active")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                statusFilter === "active"
                  ? "bg-surface text-brand-700 shadow-sm"
                  : "text-muted"
              }`}
            >
              Aktiv ({activeCount})
            </button>
            <button
              type="button"
              aria-pressed={statusFilter === "inactive"}
              onClick={() => setStatusFilter("inactive")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                statusFilter === "inactive"
                  ? "bg-surface text-brand-700 shadow-sm"
                  : "text-muted"
              }`}
            >
              Deaktiv ({inactiveCount})
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-2/3">
            <Input
              aria-label="Şagirdlərdə axtar"
              placeholder="Ad, email və ya qrupla axtar"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <Select
              aria-label="Qrupa görə filtrlə"
              value={selectedGroup}
              onChange={(event) => setSelectedGroup(event.currentTarget.value)}
            >
              <option value="">Bütün qruplar</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                  {group.archived ? " · arxiv" : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-16 text-center text-sm text-muted">
            Şagirdlər yüklənir...
          </div>
        ) : visibleStudents.length ? (
          <div className="divide-y divide-border">
            {visibleStudents.map((student) => (
              <article
                key={student._id}
                className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">
                    {student.name.slice(0, 1).toLocaleUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-bold">{student.name}</h2>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          student.approvalStatus === "pending"
                            ? "bg-warning-50 text-warning-600"
                            : student.isActive
                              ? "bg-success-50 text-success-600"
                              : "bg-surface-muted text-muted"
                        }`}
                      >
                        {student.approvalStatus === "pending"
                          ? "Təsdiq gözləyir"
                          : student.isActive
                            ? "Aktiv"
                            : "Deaktiv"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">
                      {student.email}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {student.groups.map((group) => (
                        <span
                          key={group.id}
                          className={`rounded-md px-2 py-1 text-xs ${
                            group.archived
                              ? "bg-surface-muted text-muted"
                              : "bg-brand-50 text-brand-700"
                          }`}
                        >
                          {group.name}
                          {group.archived ? " · arxiv" : ""}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Qeydiyyat:{" "}
                      {new Date(student.createdAt).toLocaleDateString("az-AZ")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {student.approvalStatus === "pending" ? (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => openAction({ type: "approve", student })}
                    >
                      Təsdiqlə
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openAction({ type: "reset-password", student })
                        }
                      >
                        Şifrəni sıfırla
                      </Button>
                      {student.isActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openAction({ type: "deactivate", student })
                          }
                        >
                          Deaktiv et
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() =>
                            openAction({ type: "activate", student })
                          }
                        >
                          Aktiv et
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => openAction({ type: "delete", student })}
                  >
                    Sil
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-5 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-xl text-brand-700">
              {search ? "⌕" : statusFilter === "pending" ? "…" : "B"}
            </div>
            <h2 className="mt-4 font-bold">
              {search
                ? "Uyğun şagird tapılmadı"
                : statusFilter === "pending"
                  ? "Təsdiq gözləyən şagird yoxdur"
                  : statusFilter === "inactive"
                    ? "Deaktiv hesab yoxdur"
                    : "Hələ qeydiyyatdan keçən şagird yoxdur"}
            </h2>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted">
              {search
                ? "Başqa ad, email və ya qrup adı ilə axtar."
                : statusFilter === "pending"
                  ? "Yeni qeydiyyatdan keçən şagirdlər təsdiqlənənədək gözləmədə qalır."
                  : statusFilter === "inactive"
                    ? "Deaktiv etdiyin hesablar burada görünəcək."
                    : "Qrup səhifəsində dəvət linkini aktiv et və şagirdlərə göndər. Qeydiyyatdan sonra hesabları burada təsdiqlə."}
            </p>
          </div>
        )}
      </Card>

      <Modal
        open={
          action?.type === "approve" ||
          action?.type === "deactivate" ||
          action?.type === "activate"
        }
        title={
          action?.type === "approve"
            ? "Şagird hesabını təsdiqlə"
            : action?.type === "deactivate"
              ? "Şagird hesabını deaktiv et"
              : "Şagird hesabını aktiv et"
        }
        description={
          action?.type === "approve"
            ? "Təsdiqdən sonra şagird daxil olub canlı dərslər və ev tapşırıqlarından istifadə edə biləcək."
            : action?.type === "deactivate"
              ? "Şagird daxil ola və dərslərə qoşula bilməyəcək. Hesab və nəticələr saxlanacaq; hesabı sonra bərpa edə bilərsən."
              : "Şagird yenidən daxil olub dərslərdə iştirak edə biləcək."
        }
        onClose={() => setAction(null)}
      >
        {(action?.type === "approve" ||
          action?.type === "deactivate" ||
          action?.type === "activate") && (
          <>
            {error && <ModalError message={error} />}
            <StudentIdentity student={action.student} />
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAction(null)}>
                Ləğv et
              </Button>
              <Button
                variant={
                  action.type === "deactivate" ? "danger" : "success"
                }
                disabled={saving}
                onClick={() => void updateStatus(action.student, action.type)}
              >
                {saving
                  ? "Yadda saxlanılır..."
                  : action.type === "approve"
                    ? "Təsdiqlə"
                    : action.type === "deactivate"
                      ? "Deaktiv et"
                      : "Aktiv et"}
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={action?.type === "reset-password"}
        title="Şifrəni sıfırla"
        description="Yeni müvəqqəti şifrəni şagirdə ayrıca və təhlükəsiz yolla çatdır."
        onClose={() => setAction(null)}
      >
        {action?.type === "reset-password" && (
          <form
            key={action.student._id}
            className="space-y-5"
            onSubmit={resetPassword}
          >
            {error && <ModalError message={error} />}
            <StudentIdentity student={action.student} />
            <Input
              autoFocus
              label="Yeni müvəqqəti şifrə"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAction(null)}
              >
                Ləğv et
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Yenilənir..." : "Şifrəni sıfırla"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={action?.type === "delete"}
        title="Şagird hesabını tam sil"
        description="Bu əməliyyat geri qaytarılmır. Hesab, qrup üzvlükləri, canlı dərs cavabları və ev tapşırığı nəticələri silinəcək."
        onClose={() => setAction(null)}
      >
        {action?.type === "delete" && (
          <form
            key={action.student._id}
            className="space-y-5"
            onSubmit={deleteStudent}
          >
            {error && <ModalError message={error} />}
            <StudentIdentity student={action.student} />
            <Input
              autoFocus
              label="Təsdiq üçün şagirdin emailini yaz"
              name="confirmEmail"
              type="email"
              autoComplete="off"
              placeholder={action.student.email}
              required
            />
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAction(null)}
              >
                Ləğv et
              </Button>
              <Button type="submit" variant="danger" disabled={saving}>
                {saving ? "Silinir..." : "Hesabı tam sil"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </DashboardShell>
  );
}

function StudentIdentity({ student }: { student: StudentItem }) {
  return (
    <div className="rounded-xl bg-surface-muted px-4 py-3">
      <p className="font-semibold">{student.name}</p>
      <p className="mt-1 text-sm text-muted">{student.email}</p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
    </Card>
  );
}

function ModalError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-600"
    >
      {message}
    </p>
  );
}
