"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import { requestJson } from "@/src/lib/client-api";

interface GroupSummary {
  _id: string;
  name: string;
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
  groupId: { name: string } | string;
  taskIds: unknown[];
}

interface ManagementData {
  groups: GroupSummary[];
  quizzes: QuizSummary[];
  assignments: AssignmentSummary[];
}

const emptyData: ManagementData = { groups: [], quizzes: [], assignments: [] };

async function fetchManagementData(): Promise<ManagementData> {
  const [groupsResult, quizzesResult, assignmentsResult] = await Promise.all([
    requestJson<{ groups: GroupSummary[] }>("/api/groups"),
    requestJson<{ quizzes: QuizSummary[] }>("/api/quizzes"),
    requestJson<{ assignments: AssignmentSummary[] }>("/api/assignments"),
  ]);
  return {
    groups: groupsResult.groups,
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
      setNotice("Ev tapşırığı dərc olundu.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ev tapşırığını dərc etmək olmadı.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell name={name} role="admin">
      <div className="mb-7">
        <p className="text-sm font-semibold text-brand-700">İdarəetmə</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Ev tapşırıqları</h1>
        <p className="mt-2 text-muted">
          Tapşırıq dərc et, hər sualın cavablarına və nəticə sıralamasına bax.
        </p>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-success-50 p-3 text-sm text-success-600">{notice}</p>}

      <Card>
        <h2 className="text-xl font-bold">Yeni ev tapşırığı</h2>
        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={createAssignment}>
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
            {data.groups.map((group) => (
              <option key={group._id} value={group._id}>{group.name}</option>
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
      </Card>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-bold">Dərc edilmiş tapşırıqlar</h2>
        {loading ? (
          <p className="py-10 text-center text-muted">Siyahı yüklənir...</p>
        ) : data.assignments.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.assignments.map((assignment) => (
              <Card key={assignment._id}>
                <p className="text-sm text-brand-700">
                  {typeof assignment.groupId === "string" ? "Qrup" : assignment.groupId.name}
                </p>
                <h3 className="mt-1 text-lg font-bold">{assignment.title}</h3>
                <p className="mt-2 text-sm text-muted">
                  {assignment.taskIds.length} sual
                  {assignment.dueAt
                    ? ` · Son tarix ${new Date(assignment.dueAt).toLocaleString("az-AZ")}`
                    : " · Son tarix təyin edilməyib"}
                </p>
                <Link
                  href={`/admin/assignments/${assignment._id}`}
                  className="mt-4 inline-flex rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Nəticələrə bax
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="py-10 text-center text-muted">Hələ ev tapşırığı dərc edilməyib.</Card>
        )}
      </section>
    </DashboardShell>
  );
}
