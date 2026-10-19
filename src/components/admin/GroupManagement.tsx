"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { RoleGate } from "@/src/components/app/RoleGate";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Modal } from "@/src/components/ui/Modal";
import { requestJson } from "@/src/lib/client-api";

interface GroupItem {
  _id: string;
  name: string;
  accessCode: string;
  inviteEnabled: boolean;
  studentCount: number;
  createdAt: string;
}

type ModalAction =
  | { type: "create" }
  | { type: "edit"; group: GroupItem }
  | { type: "archive"; group: GroupItem }
  | { type: "restore"; group: GroupItem }
  | { type: "invite"; group: GroupItem };

export function GroupManagement() {
  return (
    <RoleGate role="admin">
      {(user) => <GroupManagementContent name={user.name} />}
    </RoleGate>
  );
}

function GroupManagementContent({ name }: { name: string }) {
  const [activeGroups, setActiveGroups] = useState<GroupItem[]>([]);
  const [archivedGroups, setArchivedGroups] = useState<GroupItem[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadGroups = useCallback(async () => {
    const [active, archived] = await Promise.all([
      requestJson<{ groups: GroupItem[] }>("/api/groups"),
      requestJson<{ groups: GroupItem[] }>("/api/groups?archived=true"),
    ]);
    setActiveGroups(active.groups);
    setArchivedGroups(archived.groups);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      requestJson<{ groups: GroupItem[] }>("/api/groups"),
      requestJson<{ groups: GroupItem[] }>("/api/groups?archived=true"),
    ])
      .then(([active, archived]) => {
        if (cancelled) return;
        setActiveGroups(active.groups);
        setArchivedGroups(archived.groups);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Qrupları yükləmək mümkün olmadı.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadGroups]);

  const visibleGroups = useMemo(() => {
    const groups = showArchived ? archivedGroups : activeGroups;
    const query = search.trim().toLocaleLowerCase();
    if (!query) return groups;
    return groups.filter(
      (group) =>
        group.name.toLocaleLowerCase().includes(query) ||
        group.accessCode.toLocaleLowerCase().includes(query),
    );
  }, [activeGroups, archivedGroups, search, showArchived]);

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const groupName = String(form.get("name") ?? "").trim();
    if (!groupName || groupName.length > 100) {
      setError("Qrup adı 1-100 simvol olmalıdır.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (modal?.type === "edit") {
        await requestJson(`/api/groups/${modal.group._id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: groupName }),
        });
        setNotice("Qrup məlumatları yeniləndi.");
      } else {
        await requestJson("/api/groups", {
          method: "POST",
          body: JSON.stringify({ name: groupName }),
        });
        setNotice("Yeni qrup yaradıldı.");
      }
      setModal(null);
      await loadGroups();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Əməliyyatı tamamlamaq olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openModal(action: ModalAction) {
    setError("");
    setNotice("");
    setModal(action);
  }

  async function archiveGroup(group: GroupItem) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`/api/groups/${group._id}`, { method: "DELETE" });
      setModal(null);
      setNotice(`“${group.name}” qrupu arxivləndi.`);
      await loadGroups();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Qrupu arxivləmək olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function restoreGroup(group: GroupItem) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`/api/groups/${group._id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "restore" }),
      });
      setModal(null);
      setNotice(`“${group.name}” qrupu bərpa edildi.`);
      await loadGroups();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Qrupu bərpa etmək olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function setInviteEnabled(group: GroupItem, inviteEnabled: boolean) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`/api/groups/${group._id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "invite", inviteEnabled }),
      });
      setModal(null);
      setNotice(
        inviteEnabled
          ? `“${group.name}” qrupu üçün qeydiyyat linki aktiv edildi.`
          : `“${group.name}” qrupu üçün qeydiyyat linki deaktiv edildi.`,
      );
      await loadGroups();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Dəvət linkinin vəziyyətini dəyişmək olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyInviteLink(group: GroupItem) {
    try {
      const link = `${window.location.origin}/join/${group.accessCode}`;
      await navigator.clipboard.writeText(link);
      setError("");
      setNotice(`“${group.name}” qrupu üçün dəvət linki kopyalandı.`);
    } catch {
      setError("Dəvət linkini kopyalamaq olmadı. Linki əl ilə seçib kopyala.");
    }
  }

  return (
    <DashboardShell name={name} role="admin">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold text-brand-700">
                İdarəetmə / Qruplar
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                Qruplar
              </h1>
              <p className="mt-2 text-muted">
                Sinifləri, qoşulma kodlarını və üzvləri idarə et.
              </p>
            </div>
            <Button onClick={() => openModal({ type: "create" })}>
              <span aria-hidden="true" className="text-lg leading-none">+</span>
              Yeni qrup
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
            <SummaryCard label="Aktiv qruplar" value={activeGroups.length} />
            <SummaryCard
              label="Aktiv şagird üzvlükləri"
              value={activeGroups.reduce(
                (total, group) => total + group.studentCount,
                0,
              )}
            />
            <SummaryCard label="Arxivlənmiş qruplar" value={archivedGroups.length} />
          </section>

          <Card className="p-0">
            <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
              <div
                className="flex w-fit rounded-xl bg-surface-muted p-1"
                role="tablist"
                aria-label="Qrup siyahısı"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!showArchived}
                  onClick={() => setShowArchived(false)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    !showArchived
                      ? "bg-surface text-brand-700 shadow-sm"
                      : "text-muted"
                  }`}
                >
                  Aktiv ({activeGroups.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showArchived}
                  onClick={() => setShowArchived(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    showArchived
                      ? "bg-surface text-brand-700 shadow-sm"
                      : "text-muted"
                  }`}
                >
                  Arxiv ({archivedGroups.length})
                </button>
              </div>
              <Input
                aria-label="Qruplarda axtar"
                className="sm:max-w-xs"
                placeholder="Ad və ya kodla axtar"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            </div>

            {loading ? (
              <div className="px-5 py-16 text-center text-sm text-muted">
                Qruplar yüklənir...
              </div>
            ) : visibleGroups.length ? (
              <div className="divide-y divide-border">
                {visibleGroups.map((group) => (
                  <article
                    key={group._id}
                    className="flex flex-col gap-4 px-5 py-5 transition hover:bg-surface-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-lg font-bold text-brand-700">
                        {group.name.slice(0, 1).toLocaleUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate font-bold text-foreground">
                            {group.name}
                          </h2>
                          {showArchived && (
                            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted">
                              Arxivdə
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          {group.studentCount} şagird
                          <span className="mx-2">·</span>
                          {new Date(group.createdAt).toLocaleDateString("az-AZ")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Dəvət linki / kod
                        </p>
                        <p className="font-mono text-sm font-bold tracking-wider text-brand-700">
                          {!showArchived && group.inviteEnabled ? (
                            <a
                              href={`/join/${group.accessCode}`}
                              className="underline decoration-brand-200 underline-offset-2"
                            >
                              /join/{group.accessCode}
                            </a>
                          ) : (
                            `/join/${group.accessCode}`
                          )}
                        </p>
                      </div>
                      {!showArchived && group.inviteEnabled && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void copyInviteLink(group)}
                        >
                          Linki kopyala
                        </Button>
                      )}
                      {!showArchived && (
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              group.inviteEnabled
                                ? "bg-success-50 text-success-600"
                                : "bg-surface-muted text-muted"
                            }`}
                          >
                            {group.inviteEnabled
                              ? "Qeydiyyat açıqdır"
                              : "Qeydiyyat bağlıdır"}
                          </span>
                          <Button
                            size="sm"
                            variant={group.inviteEnabled ? "outline" : "success"}
                            disabled={saving}
                            onClick={() => openModal({ type: "invite", group })}
                          >
                            {group.inviteEnabled ? "Bağla" : "Aç"}
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {showArchived ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() =>
                              setModal({ type: "restore", group })
                            }
                          >
                            Bərpa et
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openModal({ type: "edit", group })}
                            >
                              Redaktə
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-danger-100 text-danger-600 hover:border-danger-500 hover:bg-danger-50"
                              onClick={() =>
                                openModal({ type: "archive", group })
                              }
                            >
                              Arxivlə
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-5 py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-2xl text-brand-700">
                  {search ? "⌕" : "＋"}
                </div>
                <h2 className="mt-4 font-bold">
                  {search
                    ? "Axtarışa uyğun qrup tapılmadı"
                    : showArchived
                      ? "Arxiv boşdur"
                      : "Hələ qrup yaradılmayıb"}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {search
                    ? "Başqa qrup adı və ya qoşulma kodu ilə axtar."
                    : showArchived
                      ? "Arxivlənmiş qruplar burada görünəcək."
                      : "Şagird əlavə etmək və dərs keçirmək üçün ilk qrupu yarat."}
                </p>
                {!search && !showArchived && (
                  <Button
                    className="mt-5"
                    onClick={() => openModal({ type: "create" })}
                  >
                    İlk qrupu yarat
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Modal
            open={modal?.type === "create" || modal?.type === "edit"}
            title={modal?.type === "edit" ? "Qrupu redaktə et" : "Yeni qrup"}
            description="Qrup adı 1-100 simvol arasında olmalıdır. Dəvət linki yaradıldıqda bağlı olur; şagird qeydiyyatı üçün ayrıca aktiv et."
            onClose={() => setModal(null)}
          >
            <form
              key={modal?.type === "edit" ? modal.group._id : "create"}
              className="space-y-5"
              onSubmit={submitGroup}
            >
              {error && <ModalError message={error} />}
              <Input
                autoFocus
                label="Qrupun adı"
                name="name"
                placeholder="Məsələn, 5A"
                maxLength={100}
                defaultValue={modal?.type === "edit" ? modal.group.name : ""}
                required
              />
              {modal?.type === "edit" && (
                <div className="rounded-xl bg-surface-muted px-4 py-3">
                  <p className="text-xs font-medium text-muted">
                    Mövcud qoşulma kodu
                  </p>
                  <p className="mt-1 font-mono font-bold tracking-wider text-brand-700">
                    {modal.group.accessCode}
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModal(null)}
                >
                  Ləğv et
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving
                    ? "Yadda saxlanılır..."
                    : modal?.type === "edit"
                      ? "Dəyişiklikləri saxla"
                      : "Qrup yarat"}
                </Button>
              </div>
            </form>
          </Modal>

          <Modal
            open={modal?.type === "archive"}
            title="Qrupu arxivlə"
            description="Qrup aktiv siyahıdan çıxarılacaq, amma üzvlük və dərs tarixçəsi saxlanacaq. İstənilən vaxt arxivdən bərpa edə bilərsən."
            onClose={() => setModal(null)}
          >
            {modal?.type === "archive" && (
              <>
                {error && <ModalError message={error} />}
                <div className="rounded-xl border border-warning-100 bg-warning-50 px-4 py-3">
                  <p className="font-semibold text-foreground">
                    {modal.group.name}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {modal.group.studentCount} şagird üzvlüyü qorunacaq.
                  </p>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setModal(null)}
                  >
                    Ləğv et
                  </Button>
                  <Button
                    variant="danger"
                    disabled={saving}
                    onClick={() => void archiveGroup(modal.group)}
                  >
                    {saving ? "Arxivlənir..." : "Arxivlə"}
                  </Button>
                </div>
              </>
            )}
          </Modal>

          <Modal
            open={modal?.type === "restore"}
            title="Qrupu bərpa et"
            description="Bərpa edilmiş qrup aktiv siyahıda görünəcək və yeni dərslər/ev tapşırıqları üçün seçilə biləcək."
            onClose={() => setModal(null)}
          >
            {modal?.type === "restore" && (
              <>
                {error && <ModalError message={error} />}
                <div className="rounded-xl bg-surface-muted px-4 py-3">
                  <p className="font-semibold">{modal.group.name}</p>
                  <p className="mt-1 font-mono text-sm text-brand-700">
                    {modal.group.accessCode}
                  </p>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setModal(null)}
                  >
                    Ləğv et
                  </Button>
                  <Button
                    disabled={saving}
                    onClick={() => void restoreGroup(modal.group)}
                  >
                    {saving ? "Bərpa edilir..." : "Bərpa et"}
                  </Button>
                </div>
              </>
            )}
          </Modal>

          <Modal
            open={modal?.type === "invite"}
            title={
              modal?.type === "invite" && modal.group.inviteEnabled
                ? "Qeydiyyat linkini deaktiv et"
                : "Qeydiyyat linkini aktiv et"
            }
            description={
              modal?.type === "invite" && modal.group.inviteEnabled
                ? "Linki deaktiv etdikdən sonra yeni şagirdlər bu qrupa qeydiyyatdan keçə bilməyəcək. Əvvəl qeydiyyatdan keçmiş şagirdlərə təsir etməyəcək."
                : "Link aktiv olduqda linkə sahib olan hər kəs qeydiyyat üçün müraciət edə bilər. Hesablar admin təsdiqləyənədək gözləmədə qalacaq."
            }
            onClose={() => setModal(null)}
          >
            {modal?.type === "invite" && (
              <>
                {error && <ModalError message={error} />}
                <div className="rounded-xl bg-surface-muted px-4 py-3">
                  <p className="font-semibold">{modal.group.name}</p>
                  <p className="mt-1 break-all font-mono text-sm text-brand-700">
                    {window.location.origin}/join/{modal.group.accessCode}
                  </p>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setModal(null)}
                  >
                    Ləğv et
                  </Button>
                  <Button
                    variant={modal.group.inviteEnabled ? "danger" : "success"}
                    disabled={saving}
                    onClick={() =>
                      void setInviteEnabled(
                        modal.group,
                        !modal.group.inviteEnabled,
                      )
                    }
                  >
                    {saving
                      ? "Yenilənir..."
                      : modal.group.inviteEnabled
                        ? "Linki deaktiv et"
                        : "Linki aktiv et"}
                  </Button>
                </div>
              </>
            )}
          </Modal>
        </DashboardShell>
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
      className="mb-4 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-600"
    >
      {message}
    </p>
  );
}
