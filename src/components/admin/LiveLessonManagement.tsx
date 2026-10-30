"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Modal } from "@/src/components/ui/Modal";
import { Pagination } from "@/src/components/ui/Pagination";
import { Select } from "@/src/components/ui/Select";
import { requestJson } from "@/src/lib/client-api";

interface Group {
  _id: string;
  name: string;
  archivedAt?: string | null;
}

interface Quiz {
  _id: string;
  title: string;
  taskIds: unknown[];
}

interface Lesson {
  _id: string;
  title: string;
  status: "draft" | "live" | "ended";
  durationSeconds: number;
  activeTaskIndex: number;
  endsAt?: string;
  quizIds?: string[];
  groupId: { _id: string; name: string } | string;
  taskIds: ({ _id: string; title: string } | string)[];
}

type Filter = "all" | Lesson["status"] | "ended";
const LESSONS_PER_PAGE = 10;

export function LiveLessonManagement() {
  return (
    <RoleGate role="admin">
      {(user) => <LiveLessonContent name={user.name} />}
    </RoleGate>
  );
}

function LiveLessonContent({ name }: { name: string }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [archivedGroups, setArchivedGroups] = useState<Group[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("all");
  const [lessonPage, setLessonPage] = useState(1);
  const [editing, setEditing] = useState<Lesson | null | "new">(null);
  const [deleting, setDeleting] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [lessonResult, groupResult, archivedGroupResult, quizResult] =
      await Promise.all([
        requestJson<{ lessons: Lesson[] }>("/api/live-lessons"),
        requestJson<{ groups: Group[] }>("/api/groups"),
        requestJson<{ groups: Group[] }>("/api/groups?archived=true"),
        requestJson<{ quizzes: Quiz[] }>("/api/quizzes"),
      ]);
    setLessons(lessonResult.lessons);
    setGroups(groupResult.groups);
    setArchivedGroups(archivedGroupResult.groups);
    setQuizzes(quizResult.quizzes);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchLessons = async () => {
      const [lessonResult, groupResult, archivedGroupResult, quizResult] =
        await Promise.all([
          requestJson<{ lessons: Lesson[] }>("/api/live-lessons"),
          requestJson<{ groups: Group[] }>("/api/groups"),
          requestJson<{ groups: Group[] }>("/api/groups?archived=true"),
          requestJson<{ quizzes: Quiz[] }>("/api/quizzes"),
        ]);
      if (cancelled) return;
      setLessons(lessonResult.lessons);
      setGroups(groupResult.groups);
      setArchivedGroups(archivedGroupResult.groups);
      setQuizzes(quizResult.quizzes);
    };
    void fetchLessons()
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(
            cause instanceof Error ? cause.message : "Dərsləri yükləmək olmadı.",
          );
      })
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const quizIds = form.getAll("quizIds").map(String);
    if (!quizIds.length) {
      setError("Dərs üçün ən azı bir quiz seçin.");
      return;
    }
    const payload = {
      title: form.get("title"),
      groupId: form.get("groupId"),
      quizIds,
      durationSeconds: Number(form.get("durationSeconds")),
    };
    setSaving(true);
    setError("");
    try {
      if (editing === "new") {
        await requestJson("/api/live-lessons", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await requestJson(`/api/live-lessons/${editing._id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "edit", ...payload }),
        });
      }
      if (editing === "new") {
        setSelectedGroupFilter("all");
        setFilter("all");
        setLessonPage(1);
      }
      setEditing(null);
      setNotice("Canlı dərs yadda saxlanıldı.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dərsi saxlamaq olmadı.");
    } finally {
      setSaving(false);
    }
  }

  async function action(lesson: Lesson, actionName: string) {
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/live-lessons/${lesson._id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: actionName }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dərs yenilənmədi.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLesson() {
    if (!deleting) return;
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/live-lessons/${deleting._id}`, { method: "DELETE" });
      setDeleting(null);
      setNotice("Canlı dərs silindi.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dərsi silmək olmadı.");
    } finally {
      setSaving(false);
    }
  }

  const visible = lessons.filter((lesson) => {
    const matchesStatus =
      filter === "all" ||
      (filter === "ended"
        ? lesson.status === "ended"
        : lesson.status === filter);
    const lessonGroupId =
      typeof lesson.groupId === "string" ? lesson.groupId : lesson.groupId._id;
    return (
      matchesStatus &&
      (selectedGroupFilter === "all" || lessonGroupId === selectedGroupFilter)
    );
  });
  const lessonPageCount = Math.max(
    1,
    Math.ceil(visible.length / LESSONS_PER_PAGE),
  );
  const currentLessonPage = Math.min(lessonPage, lessonPageCount);
  const paginatedLessons = visible.slice(
    (currentLessonPage - 1) * LESSONS_PER_PAGE,
    currentLessonPage * LESSONS_PER_PAGE,
  );

  return (
    <DashboardShell name={name} role="admin">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand-700">İdarəetmə</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Canlı dərslər</h1>
          <p className="mt-2 text-muted">
            Dərs yarat, tabları idarə et və cavab nəticələrinə bax.
          </p>
        </div>
        <Button onClick={() => { setError(""); setEditing("new"); }}>
          Canlı dərs əlavə et
        </Button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-success-50 p-3 text-sm text-success-600">{notice}</p>}

      <div className="mb-5 flex flex-wrap gap-2">
        {([
          ["all", "Hamısı"],
          ["live", "Canlı"],
          ["draft", "Hazır"],
          ["ended", "Bitmişlər"],
        ] as const).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? "primary" : "outline"}
            onClick={() => {
              setFilter(value);
              setLessonPage(1);
            }}
          >
            {label} {value === "ended" ? `(${lessons.filter((item) => item.status === "ended").length})` : ""}
          </Button>
        ))}
      </div>
      <div className="mb-5">
        <Select
          label="Qrupa görə süzgəc"
          className="sm:max-w-xs"
          value={selectedGroupFilter}
          onChange={(event) => {
            setSelectedGroupFilter(event.currentTarget.value);
            setLessonPage(1);
          }}
        >
          <option value="all">Bütün qruplar</option>
          {[...groups, ...archivedGroups].map((group) => (
            <option key={group._id} value={group._id}>
              {group.name}{group.archivedAt ? " (arxivdə)" : ""}
            </option>
          ))}
        </Select>
      </div>
      {loading ? (
        <p className="py-16 text-center text-muted">Dərslər yüklənir...</p>
      ) : visible.length ? (
        <Card className="divide-y divide-border p-0">
          {paginatedLessons.map((lesson) => (
            <article
              key={lesson._id}
              className="flex flex-col gap-4 p-5 transition hover:bg-surface-muted/50 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted">
                    {typeof lesson.groupId === "string" ? "Qrup" : lesson.groupId.name}
                  </p>
                  <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold">
                    {lesson.status === "draft" ? "Hazır" : lesson.status === "live" ? "Canlı" : "Bitib"}
                  </span>
                </div>
                <h2 className="mt-1 text-lg font-bold">{lesson.title}</h2>
                <p className="mt-1 text-sm text-muted">
                  {lesson.taskIds.length} sual · Tab {lesson.activeTaskIndex + 1} · {Math.round(lesson.durationSeconds / 60)} dəq.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {lesson.status === "draft" && (
                  <>
                    <Button size="sm" onClick={() => void action(lesson, "start")}>Başla</Button>
                    <Button size="sm" variant="outline" onClick={() => { setError(""); setEditing(lesson); }}>Redaktə</Button>
                  </>
                )}
                {lesson.status === "live" && (
                  <Button size="sm" variant="danger" onClick={() => void action(lesson, "end")}>Bitir</Button>
                )}
                <Link
                  href={`/admin/live-lessons/${lesson._id}`}
                  className="inline-flex items-center rounded-xl border-2 border-border px-3 py-1.5 text-sm font-semibold hover:border-brand-200 hover:bg-brand-50"
                >
                  Dərsə bax
                </Link>
                <Link
                  href={`/admin/live-lessons/${lesson._id}`}
                  className="inline-flex items-center rounded-xl border-2 border-border px-3 py-1.5 text-sm font-semibold hover:border-brand-200 hover:bg-brand-50"
                >
                  Nəticələrə bax
                </Link>
                {lesson.status !== "live" && (
                  <Button size="sm" variant="danger" onClick={() => setDeleting(lesson)}>Sil</Button>
                )}
              </div>
            </article>
          ))}
          <Pagination
            page={currentLessonPage}
            pageSize={LESSONS_PER_PAGE}
            totalItems={visible.length}
            onPageChange={setLessonPage}
          />
        </Card>
      ) : (
        <Card className="py-12 text-center text-sm text-muted">
          Bu süzgəcdə canlı dərs tapılmadı.
        </Card>
      )}

      <LessonModal
        open={editing !== null}
        lesson={editing && editing !== "new" ? editing : null}
        groups={groups}
        quizzes={quizzes}
        saving={saving}
        onClose={() => setEditing(null)}
        onSubmit={save}
      />
      <Modal
        open={deleting !== null}
        title="Canlı dərsi sil"
        description="Cavab tarixçəsi olan dərslər silinmir."
        onClose={() => setDeleting(null)}
      >
        {deleting && (
          <div className="space-y-4">
            <p className="font-semibold">{deleting.title}</p>
            {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)}>Ləğv et</Button>
              <Button variant="danger" disabled={saving} onClick={() => void removeLesson()}>Sil</Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardShell>
  );
}

function LessonModal({
  open,
  lesson,
  groups,
  quizzes,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  lesson: Lesson | null;
  groups: Group[];
  quizzes: Quiz[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const selectedGroupId =
    typeof lesson?.groupId === "string" ? lesson.groupId : lesson?.groupId._id;
  return (
    <Modal
      open={open}
      title={lesson ? "Canlı dərsi redaktə et" : "Canlı dərs əlavə et"}
      description="Hər seçilmiş sual dərs səhifəsində ayrıca tab olacaq."
      onClose={onClose}
    >
      <form key={lesson?._id ?? "new"} className="space-y-4" onSubmit={onSubmit}>
        <Input label="Dərsin adı" name="title" defaultValue={lesson?.title ?? ""} maxLength={200} required />
        <Select label="Qrup" name="groupId" defaultValue={selectedGroupId ?? ""} required>
          <option value="">Qrup seç</option>
          {groups.map((group) => <option key={group._id} value={group._id}>{group.name}</option>)}
        </Select>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Quizlər və tablar</span>
          <span className="block max-h-48 space-y-2 overflow-y-auto">
            {quizzes.map((quiz) => (
              <span key={quiz._id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                <input
                  type="checkbox"
                  name="quizIds"
                  value={quiz._id}
                  defaultChecked={lesson?.quizIds?.includes(quiz._id) ?? false}
                  disabled={!quiz.taskIds.length}
                  className="h-4 w-4 accent-brand-600"
                />
                {quiz.title} · {quiz.taskIds.length} sual
              </span>
            ))}
          </span>
        </label>
        <Select label="Standart vaxt (dəqiqə)" name="durationSeconds" defaultValue={String((lesson?.durationSeconds ?? 120) / 60)}>
          {[1, 2, 3, 5, 10, 15, 30, 60].map((minute) => <option key={minute} value={minute * 60}>{minute} dəq.</option>)}
        </Select>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button>
          <Button type="submit" disabled={saving || !groups.length || !quizzes.length}>
            {saving ? "Yadda saxlanılır..." : lesson ? "Dəyişiklikləri saxla" : "Dərsi yarat"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
