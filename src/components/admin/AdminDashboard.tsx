"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Select } from "@/src/components/ui/Select";
import Link from "next/link";
import { subscribeToLessonSignal } from "@/src/lib/firebase";
import { requestJson } from "@/src/lib/client-api";

interface GroupItem {
  _id: string;
  name: string;
  accessCode: string;
}

interface QuizItem {
  _id: string;
  title: string;
  taskIds: { _id: string; title: string; type: string }[] | string[];
}

interface StudentItem {
  _id: string;
  name: string;
  email: string;
  groupIds: string[];
}

interface AssignmentItem {
  _id: string;
  title: string;
  dueAt?: string;
  groupId: { _id: string; name: string } | string;
  taskIds: { _id: string; title: string }[] | string[];
}

interface LessonItem {
  _id: string;
  title: string;
  status: "draft" | "live" | "ended";
  durationSeconds: number;
  endsAt?: string;
  activeTaskIndex: number;
  groupId: { _id: string; name: string } | string;
  taskIds: { _id: string; title: string; type: string }[] | string[];
}

interface SubmissionItem {
  _id: string;
  answer: unknown;
  isCorrect: boolean;
  submittedAt: string;
  studentId: { _id: string; name: string; email: string } | string;
}

interface AdminData {
  groups: GroupItem[];
  quizzes: QuizItem[];
  students: StudentItem[];
  assignments: AssignmentItem[];
  lessons: LessonItem[];
}

const emptyData: AdminData = {
  groups: [],
  quizzes: [],
  students: [],
  assignments: [],
  lessons: [],
};

function groupName(group: LessonItem["groupId"] | AssignmentItem["groupId"]) {
  return typeof group === "string" ? "Qrup" : group.name;
}

function taskTitle(task: { title: string } | string) {
  return typeof task === "string" ? "Tapşırıq" : task.title;
}

function displayAnswer(answer: unknown) {
  if (Array.isArray(answer)) return answer.join(", ");
  return typeof answer === "string" ? answer : JSON.stringify(answer);
}

export function AdminDashboard() {
  return (
    <RoleGate role="admin">
      {(user) => <AdminContent name={user.name} />}
    </RoleGate>
  );
}

function AdminContent({ name }: { name: string }) {
  const [data, setData] = useState(emptyData);
  const [submissions, setSubmissions] = useState<Record<string, SubmissionItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(0);
  const loadData = useCallback(async () => {
    const [groupsResult, quizzesResult, studentsResult, assignmentsResult, lessonsResult] =
      await Promise.all([
        requestJson<{ groups: GroupItem[] }>("/api/groups"),
        requestJson<{ quizzes: QuizItem[] }>("/api/quizzes"),
        requestJson<{ students: StudentItem[] }>("/api/students"),
        requestJson<{ assignments: AssignmentItem[] }>("/api/assignments"),
        requestJson<{ lessons: LessonItem[] }>("/api/live-lessons"),
      ]);
    setData({
      groups: groupsResult.groups,
      quizzes: quizzesResult.quizzes,
      students: studentsResult.students,
      assignments: assignmentsResult.assignments,
      lessons: lessonsResult.lessons,
    });
  }, []);

  const refreshSubmissions = useCallback(async (lessonList: LessonItem[]) => {
    const activeLessons = lessonList.filter((lesson) => lesson.status === "live");
    const result = await Promise.all(
      activeLessons.map(async (lesson) => {
        const response = await requestJson<{ submissions: SubmissionItem[] }>(
          `/api/live-lessons/${lesson._id}/submissions`,
        );
        return [lesson._id, response.submissions] as const;
      }),
    );
    setSubmissions(Object.fromEntries(result));
  }, []);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const liveLessonIdsKey = data.lessons
    .filter((lesson) => lesson.status === "live")
    .map((lesson) => lesson._id)
    .join(",");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [groupsResult, quizzesResult, studentsResult, assignmentsResult, lessonsResult] =
          await Promise.all([
            requestJson<{ groups: GroupItem[] }>("/api/groups"),
            requestJson<{ quizzes: QuizItem[] }>("/api/quizzes"),
            requestJson<{ students: StudentItem[] }>("/api/students"),
            requestJson<{ assignments: AssignmentItem[] }>("/api/assignments"),
            requestJson<{ lessons: LessonItem[] }>("/api/live-lessons"),
          ]);
        if (cancelled) return;
        const nextData = {
          groups: groupsResult.groups,
          quizzes: quizzesResult.quizzes,
          students: studentsResult.students,
          assignments: assignmentsResult.assignments,
          lessons: lessonsResult.lessons,
        };
        setData(nextData);
        setLoading(false);
        await refreshSubmissions(nextData.lessons);
      } catch (cause) {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "Məlumatları yükləmək olmadı.",
        );
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshSubmissions]);

  useEffect(() => {
    const liveLessonIds = liveLessonIdsKey
      ? liveLessonIdsKey.split(",")
      : [];
    if (!liveLessonIds.length) return;
    const subscriptions = liveLessonIds
      .map((lessonId) =>
        subscribeToLessonSignal(
          lessonId,
          () => {
            void requestJson<{ lessons: LessonItem[] }>("/api/live-lessons")
              .then(async ({ lessons }) => {
                setData((current) => ({ ...current, lessons }));
                await refreshSubmissions(lessons);
              })
              .catch((cause: unknown) => {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Canlı dərs yenilənmədi.",
                );
              });
          },
          (cause) =>
            setError(`Canlı sinxronizasiya xətası: ${cause.message}`),
        ),
      )
      .filter((unsubscribe): unsubscribe is () => void => Boolean(unsubscribe));
    if (!subscriptions.length) return;
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [liveLessonIdsKey, refreshSubmissions]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const { lessons } = await requestJson<{ lessons: LessonItem[] }>(
          "/api/live-lessons",
        );
        setData((current) => ({ ...current, lessons }));
        await refreshSubmissions(lessons);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Canlı məlumat yenilənmədi.",
        );
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [refreshSubmissions]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  async function perform(
    request: () => Promise<unknown>,
    successMessage: string,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request();
      await refresh();
      const realtimeSynced =
        result !== null &&
        typeof result === "object" &&
        "realtimeSynced" in result &&
        result.realtimeSynced === false;
      setNotice(
        realtimeSynced
          ? `${successMessage} Firebase sinxronizasiyası aktiv deyil; panel yenilənməni yoxlamağa davam edir.`
          : successMessage,
      );
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Əməliyyatı tamamlamaq olmadı.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const quizIds = form.getAll("quizIds").map(String);
    if (quizIds.length === 0) {
      setError("Canlı dərs üçün ən azı bir quiz seçin.");
      return;
    }
    const payload = {
      title: form.get("title"),
      groupId: form.get("groupId"),
      quizIds,
      durationSeconds: Number(form.get("durationSeconds")),
    };
    if (await perform(
      () =>
        requestJson("/api/live-lessons", {
          method: "POST",
          body: JSON.stringify(payload),
        }        ),
        "Canlı dərs hazırlandı. Başlatmaq üçün dərs kartından düyməni seçin.",
    )) formElement.reset();
  }

  async function lessonAction(lessonId: string, action: string) {
    await perform(
      () =>
        requestJson(`/api/live-lessons/${lessonId}`, {
          method: "PATCH",
          body: JSON.stringify({ action }),
        }),
      "Canlı dərs yeniləndi.",
    );
  }

  async function reopenStudent(lessonId: string, studentId: string) {
    await perform(
      () =>
        requestJson(`/api/live-lessons/${lessonId}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "reopen-student", studentId }),
        }),
      "Şagird üçün cavablandırma yenidən aktiv edildi.",
    );
  }

  if (loading) {
    return (
      <DashboardShell name={name} role="admin">
        <div className="py-24 text-center text-muted">Panel yüklənir...</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell name={name} role="admin">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-brand-700">
            İdarəetmə paneli
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Salam, {name.split(" ")[0]}!
          </h1>
          <p className="mt-2 text-muted">
            Qrupları, tapşırıqları və dərsləri bir yerdən idarə et.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          Məlumatları yenilə
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

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Qruplar", data.groups.length, "İdarə etdiyin siniflər"],
          ["Şagirdlər", data.students.length, "Qruplardakı hesablar"],
          ["Quizlər", data.quizzes.length, "Hazır istifadə üçün"],
          ["Canlı dərslər", data.lessons.filter((item) => item.status === "live").length, "Hazırda aktiv"],
        ].map(([label, count, description]) => (
          <Card key={label} className="p-5">
            <p className="text-sm font-medium text-muted">{label}</p>
            <p className="mt-2 text-3xl font-bold">{count}</p>
            <p className="mt-1 text-xs text-muted">{description}</p>
          </Card>
        ))}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Qruplar</h2>
              <p className="mt-1 text-sm text-muted">
                Sinifləri və qoşulma kodlarını idarə et.
              </p>
            </div>
            <Link
              href="/admin/groups"
              className="shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Qruplara bax
            </Link>
          </div>
          <div className="mt-5 space-y-2">
            {data.groups.map((group) => (
              <div key={group._id} className="flex items-center justify-between rounded-xl bg-surface-muted px-4 py-3">
                <span className="font-medium">{group.name}</span>
                <span className="rounded-lg bg-brand-50 px-2.5 py-1 font-mono text-xs font-semibold text-brand-700">
                  {group.accessCode}
                </span>
              </div>
            ))}
            {data.groups.length === 0 && <p className="text-sm text-muted">Hələ qrup yaradılmayıb.</p>}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Şagird hesabları</h2>
          <p className="mt-1 text-sm text-muted">
            Şagirdlər qrupa dəvət linki ilə qoşulub öz hesablarını yaradır.
            Aktivlik və hesab əməliyyatlarını şagirdlər səhifəsindən idarə et.
          </p>
          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-surface-muted px-4 py-3">
            <div>
              <p className="font-semibold">{data.students.length} şagird</p>
              <p className="mt-1 text-xs text-muted">
                Qruplara görə filtrlə və hesabları idarə et
              </p>
            </div>
            <Link
              href="/admin/users"
              className="shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Şagirdlərə bax
            </Link>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Quiz bankı</h2>
              <p className="mt-1 text-sm text-muted">
                Quizləri və təkrar istifadə olunan tapşırıqları ayrıca səhifədə
                idarə et.
              </p>
              <p className="mt-4 text-sm font-semibold">
                {data.quizzes.length} quiz mövcuddur
              </p>
            </div>
            <Link
              href="/admin/quizzes"
              className="shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Quizləri idarə et
            </Link>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Ev tapşırıqları</h2>
          <p className="mt-1 text-sm text-muted">
            Dərc et və hər sual üzrə şagirdlərin nəticələrinə bax.
          </p>
          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-surface-muted px-4 py-3">
            <div>
              <p className="font-semibold">{data.assignments.length} dərc edilmiş</p>
              <p className="mt-1 text-xs text-muted">Quiz və son tarixləri ayrıca idarə et</p>
            </div>
            <Link
              href="/admin/assignments"
              className="shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              İdarə et
            </Link>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-bold">Canlı dərs hazırla</h2>
            <p className="mt-1 text-sm text-muted">
              Qrup və sualları seç, vaxtı təyin et, sonra dərsi başlat.
            </p>
          </div>
        </div>
        <form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={createLesson}>
          <Input label="Dərsin adı" name="title" maxLength={200} required />
          <Select label="Qrup" name="groupId" required disabled={!data.groups.length}>
            <option value="">Qrup seç</option>
            {data.groups.map((group) => <option key={group._id} value={group._id}>{group.name}</option>)}
          </Select>
          <Select label="Hər sual üçün vaxt" name="durationSeconds" defaultValue="120">
            <option value="60">1 dəqiqə</option>
            <option value="120">2 dəqiqə</option>
            <option value="180">3 dəqiqə</option>
            <option value="300">5 dəqiqə</option>
          </Select>
          <div className="md:col-span-3"><QuizPicker quizzes={data.quizzes} /></div>
          <Button className="md:col-span-3 md:w-fit" type="submit" disabled={busy || !data.groups.length || !data.quizzes.length}>
            Canlı dərs yarat
          </Button>
        </form>
      </Card>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-700">Dərs otağı</p>
            <h2 className="mt-1 text-2xl font-bold">Canlı dərslər</h2>
          </div>
          <span className="text-sm text-muted">{data.lessons.length} dərs</span>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {data.lessons.map((lesson) => {
            const activeTask = lesson.taskIds[lesson.activeTaskIndex];
            const roster = data.students.filter(
              (student) =>
                student.groupIds.includes(
                  typeof lesson.groupId === "string"
                    ? lesson.groupId
                    : lesson.groupId._id,
                ),
            );
            return (
              <Card key={lesson._id} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted">{groupName(lesson.groupId)}</p>
                    <h3 className="mt-1 text-lg font-bold">{lesson.title}</h3>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    lesson.status === "live"
                      ? "bg-success-50 text-success-600"
                      : lesson.status === "ended"
                        ? "bg-surface-muted text-muted"
                        : "bg-warning-50 text-warning-600"
                  }`}>
                    {lesson.status === "live" ? "Canlı" : lesson.status === "ended" ? "Bitib" : "Hazır"}
                  </span>
                </div>
                <div className="mt-4 rounded-xl bg-surface-muted p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Sual {lesson.activeTaskIndex + 1} / {lesson.taskIds.length}
                  </p>
                  <p className="mt-1 font-medium">
                    {activeTask ? taskTitle(activeTask) : "Tapşırıq seçilməyib"}
                  </p>
                  {lesson.status === "live" && lesson.endsAt && (
                    <p className="mt-1 text-sm text-brand-700">
                      {clock
                        ? `${Math.max(0, Math.ceil((new Date(lesson.endsAt).getTime() - clock) / 1000))} san. qalıb`
                        : "Taymer yüklənir..."}
                    </p>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {lesson.status === "draft" && (
                    <Button size="sm" disabled={busy} onClick={() => void lessonAction(lesson._id, "start")}>Dərsi başlat</Button>
                  )}
                  {lesson.status === "live" && lesson.activeTaskIndex < lesson.taskIds.length - 1 && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void lessonAction(lesson._id, "next-task")}>Növbəti sual</Button>
                  )}
                  {lesson.status === "live" && (
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => void lessonAction(lesson._id, "end")}>Dərsi bitir</Button>
                  )}
                </div>
                {lesson.status === "live" && (
                  <div className="mt-5 border-t border-border pt-4">
                    <h4 className="text-sm font-semibold">Şagird cavabları</h4>
                    <div className="mt-3 space-y-2">
                      {roster.map((student) => {
                        const studentSubmission = (submissions[lesson._id] ?? []).find(
                          (submission) =>
                            typeof submission.studentId === "string"
                              ? submission.studentId === student._id
                              : submission.studentId._id === student._id,
                        );
                        return (
                          <div key={student._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{student.name}</p>
                              <p className="text-xs text-muted">
                                {studentSubmission
                                  ? `${displayAnswer(studentSubmission.answer)} · ${studentSubmission.isCorrect ? "Düzgün" : "Səhv"}`
                                  : "Cavab gözlənilir"}
                              </p>
                            </div>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void reopenStudent(lesson._id, student._id)}>
                              Yenidən aktiv et
                            </Button>
                          </div>
                        );
                      })}
                      {roster.length === 0 && (
                        <p className="text-sm text-muted">Bu qrupda hələ şagird yoxdur.</p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
          {data.lessons.length === 0 && (
            <Card className="text-center text-sm text-muted lg:col-span-2">
              Hələ canlı dərs yaradılmayıb.
            </Card>
          )}
        </div>
      </section>
    </DashboardShell>
  );
}

function QuizPicker({ quizzes }: { quizzes: QuizItem[] }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-foreground">
        Quizləri seç
      </legend>
      {quizzes.map((quiz) => (
        <label
          key={quiz._id}
          className={`flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm ${
            quiz.taskIds.length
              ? "cursor-pointer hover:bg-surface-muted"
              : "cursor-not-allowed opacity-50"
          }`}
        >
          <input
            type="checkbox"
            name="quizIds"
            value={quiz._id}
            disabled={quiz.taskIds.length === 0}
            className="h-4 w-4 accent-brand-600"
          />
          <span className="min-w-0 flex-1 truncate">{quiz.title}</span>
          <span className="text-xs text-muted">
            {quiz.taskIds.length
              ? `${quiz.taskIds.length} tapşırıq`
              : "Boş quiz"}
          </span>
        </label>
      ))}
      {quizzes.length === 0 && (
        <p className="rounded-xl bg-warning-50 px-3 py-2 text-sm text-warning-600">
          Əvvəlcə quiz yarat, sonra həmin quizə tapşırıqlar əlavə et.
        </p>
      )}
    </fieldset>
  );
}
