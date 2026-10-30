"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { Modal } from "@/src/components/ui/Modal";
import { Pagination } from "@/src/components/ui/Pagination";
import {
  ScoreLeaderboard,
  type ScoreLeaderboardEntry,
} from "@/src/components/student/ScoreLeaderboard";
import { requestJson } from "@/src/lib/client-api";

interface GroupSummary {
  _id: string;
  name: string;
  archivedAt?: string | null;
}

interface QuizSummary {
  _id: string;
  title: string;
  taskIds: unknown[];
}

interface AssignmentSummary {
  _id: string;
  title: string;
  dueAt?: string;
  groupId: { _id: string; name: string } | string;
  taskIds: unknown[];
}

interface ManagementData {
  groups: GroupSummary[];
  archivedGroups: GroupSummary[];
  quizzes: QuizSummary[];
  assignments: AssignmentSummary[];
}

const emptyData: ManagementData = {
  groups: [],
  archivedGroups: [],
  quizzes: [],
  assignments: [],
};
const ASSIGNMENTS_PER_PAGE = 10;

async function fetchManagementData(): Promise<ManagementData> {
  const [groupsResult, archivedGroupsResult, quizzesResult, assignmentsResult] =
    await Promise.all([
      requestJson<{ groups: GroupSummary[] }>("/api/groups"),
      requestJson<{ groups: GroupSummary[] }>("/api/groups?archived=true"),
      requestJson<{ quizzes: QuizSummary[] }>("/api/quizzes"),
      requestJson<{ assignments: AssignmentSummary[] }>("/api/assignments"),
    ]);
  return {
    groups: groupsResult.groups,
    archivedGroups: archivedGroupsResult.groups,
    quizzes: quizzesResult.quizzes,
    assignments: assignmentsResult.assignments,
  };
}

export function AdminHomeworkManagement() {
  return (
    <RoleGate role="admin">
      {(user) => <AdminHomeworkContent name={user.name} />}
    </RoleGate>
  );
}

function AdminHomeworkContent({ name }: { name: string }) {
  const [data, setData] = useState(emptyData);
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [quizIds, setQuizIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<AssignmentSummary | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");
  const [assignmentPage, setAssignmentPage] = useState(1);

  const load = useCallback(async () => {
    setData(await fetchManagementData());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchManagementData()
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Məlumatları yükləmək olmadı.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson("/api/assignments", {
        method: "POST",
        body: JSON.stringify({
          title,
          groupId,
          quizIds,
          ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
        }),
      });
      setTitle("");
      setDueAt("");
      setQuizIds([]);
      setCreateModalOpen(false);
      setSelectedGroupFilter("all");
      setAssignmentPage(1);
      setNotice("Ev tapşırığı dərc olundu.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ev tapşırığını dərc etmək olmadı.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAssignment() {
    if (!deleting) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`/api/assignments/${deleting._id}`, {
        method: "DELETE",
      });
      setData((current) => ({
        ...current,
        assignments: current.assignments.filter(
          (assignment) => assignment._id !== deleting._id,
        ),
      }));
      setNotice(`“${deleting.title}” və şagird cavabları həmişəlik silindi.`);
      setDeleting(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Ev tapşırığını silmək olmadı.",
      );
    } finally {
      setSaving(false);
    }
  }

  const filteredAssignments =
    selectedGroupFilter === "all"
      ? data.assignments
      : data.assignments.filter(
          (assignment) =>
            typeof assignment.groupId !== "string" &&
            assignment.groupId._id === selectedGroupFilter,
        );
  const assignmentPageCount = Math.max(
    1,
    Math.ceil(filteredAssignments.length / ASSIGNMENTS_PER_PAGE),
  );
  const currentAssignmentPage = Math.min(assignmentPage, assignmentPageCount);
  const paginatedAssignments = filteredAssignments.slice(
    (currentAssignmentPage - 1) * ASSIGNMENTS_PER_PAGE,
    currentAssignmentPage * ASSIGNMENTS_PER_PAGE,
  );

  return (
    <DashboardShell name={name} role="admin">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-brand-700">İdarəetmə</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Ev tapşırıqları</h1>
          <p className="mt-2 text-muted">
            Tapşırıq dərc et, hər sualın cavablarına və nəticə sıralamasına bax.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setError("");
            setCreateModalOpen(true);
          }}
        >
          <span aria-hidden="true" className="text-lg leading-none">+</span>
          Yeni ev tapşırığı
        </Button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-success-50 p-3 text-sm text-success-600">{notice}</p>}

      <Modal
        open={createModalOpen}
        title="Yeni ev tapşırığı"
        description="Qrup və quizləri seçərək ev tapşırığını dərc et."
        onClose={() => {
          if (!saving) setCreateModalOpen(false);
        }}
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={createAssignment}>
          <Input
            label="Tapşırığın adı"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            maxLength={200}
            required
          />
          <Select
            label="Qrup"
            value={groupId}
            onChange={(event) => setGroupId(event.currentTarget.value)}
            required
            disabled={!data.groups.length}
          >
            <option value="">Qrup seç</option>
            {[...data.groups, ...data.archivedGroups].map((group) => (
              <option key={group._id} value={group._id}>
                {group.name}{group.archivedAt ? " (arxivdə)" : ""}
              </option>
            ))}
          </Select>
          <Input
            label="Son tarix (istəyə görə)"
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.currentTarget.value)}
          />
          <fieldset className="space-y-2 md:col-span-2">
            <legend className="mb-2 text-sm font-medium">Quizləri seç</legend>
            {data.quizzes.map((quiz) => (
              <label
                key={quiz._id}
                className={`flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm ${
                  quiz.taskIds.length ? "cursor-pointer hover:bg-surface-muted" : "opacity-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={quizIds.includes(quiz._id)}
                  disabled={!quiz.taskIds.length}
                  onChange={() =>
                    setQuizIds((current) =>
                      current.includes(quiz._id)
                        ? current.filter((id) => id !== quiz._id)
                        : [...current, quiz._id],
                    )
                  }
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="min-w-0 flex-1 truncate">{quiz.title}</span>
                <span className="text-xs text-muted">{quiz.taskIds.length} sual</span>
              </label>
            ))}
            {!data.quizzes.length && (
              <p className="text-sm text-muted">Əvvəlcə quiz və quizə aid tapşırıqlar yarat.</p>
            )}
          </fieldset>
          <Button
            type="submit"
            className="md:col-span-2 md:w-fit"
            disabled={saving || !data.groups.length || !quizIds.length}
          >
            {saving ? "Dərc olunur..." : "Ev tapşırığını dərc et"}
          </Button>
        </form>
      </Modal>

      <section className="mt-8">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-xl font-bold">Dərc edilmiş tapşırıqlar</h2>
          <Select
            label="Qrupa görə süzgəc"
            className="sm:max-w-xs"
            value={selectedGroupFilter}
            onChange={(event) => {
              setSelectedGroupFilter(event.currentTarget.value);
              setAssignmentPage(1);
            }}
          >
            <option value="all">Bütün qruplar</option>
            {[...data.groups, ...data.archivedGroups].map((group) => (
              <option key={group._id} value={group._id}>
                {group.name}{group.archivedAt ? " (arxivdə)" : ""}
              </option>
            ))}
          </Select>
        </div>
        {loading ? (
          <p className="py-10 text-center text-muted">Siyahı yüklənir...</p>
        ) : filteredAssignments.length ? (
          <Card className="divide-y divide-border p-0">
            {paginatedAssignments.map((assignment) => (
              <article
                key={assignment._id}
                className="flex flex-col gap-4 p-5 transition hover:bg-surface-muted/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-700">
                    {typeof assignment.groupId === "string" ? "Qrup" : assignment.groupId.name}
                  </p>
                  <h3 className="mt-1 truncate text-lg font-bold">{assignment.title}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {assignment.taskIds.length} sual
                    {assignment.dueAt
                      ? ` · Son tarix ${new Date(assignment.dueAt).toLocaleString("az-AZ")}`
                      : " · Son tarix təyin edilməyib"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Link
                    href={`/admin/assignments/${assignment._id}`}
                    className="inline-flex items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Nəticələrə bax
                  </Link>
                  <ScoreLeaderboard
                    title={`${assignment.title} — skor cədvəli`}
                    description="Qrupdakı şagirdlərin işlədiyi, düzgün və səhv sualların sayı."
                    buttonLabel="🏆 Skor cədvəli"
                    loadEntries={async () => {
                      const result = await requestJson<{
                        leaderboard: ScoreLeaderboardEntry[];
                      }>(`/api/assignments/${assignment._id}`);
                      return result.leaderboard;
                    }}
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setError("");
                      setDeleting(assignment);
                    }}
                  >
                    Sil
                  </Button>
                </div>
              </article>
            ))}
            <Pagination
              page={currentAssignmentPage}
              pageSize={ASSIGNMENTS_PER_PAGE}
              totalItems={filteredAssignments.length}
              onPageChange={setAssignmentPage}
            />
          </Card>
        ) : (
          <Card className="py-10 text-center text-muted">
            {selectedGroupFilter === "all"
              ? "Hələ ev tapşırığı dərc edilməyib."
              : "Bu qrup üçün ev tapşırığı tapılmadı."}
          </Card>
        )}
      </section>
      <Modal
        open={deleting !== null}
        title="Ev tapşırığını həmişəlik sil"
        description="Bu əməliyyat geri qaytarıla bilməz. Şagirdlərin bütün cavabları və nəticələri də silinəcək."
        onClose={() => {
          if (!saving) setDeleting(null);
        }}
      >
        {deleting && (
          <div className="space-y-4">
            <p className="font-semibold">{deleting.title}</p>
            {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDeleting(null)}
              >
                Ləğv et
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={saving}
                onClick={() => void deleteAssignment()}
              >
                {saving ? "Silinir..." : "Həmişəlik sil"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardShell>
  );
}
