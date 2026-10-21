"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/src/components/app/DashboardShell";
import { RoleGate } from "@/src/components/app/RoleGate";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Modal } from "@/src/components/ui/Modal";
import { Select } from "@/src/components/ui/Select";
import { Textarea } from "@/src/components/ui/Textarea";
import { requestJson } from "@/src/lib/client-api";
import type { TaskType } from "@/src/models/Task";

interface QuizItem {
  _id: string;
  title: string;
}

interface GeneratedTask {
  title: string;
  prompt: string;
  type: TaskType;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

interface DraftTask extends GeneratedTask {
  draftId: string;
}

const taskTypes: { value: TaskType; label: string }[] = [
  { value: "single_choice", label: "Bir düzgün cavab" },
  { value: "multiple_choice", label: "Bir neçə düzgün cavab" },
  { value: "drag_drop", label: "Ardıcıllıq qur" },
  { value: "short_answer", label: "Yazılı cavab" },
];

function parseAnswerIndexes(answer: string) {
  return answer
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
}

export function AiTaskGenerator() {
  return (
    <RoleGate role="admin">
      {(user) => <AiTaskGeneratorContent name={user.name} />}
    </RoleGate>
  );
}

function AiTaskGeneratorContent({ name }: { name: string }) {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [quizId, setQuizId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState("3");
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    requestJson<{ quizzes: QuizItem[] }>("/api/quizzes")
      .then(({ quizzes: loadedQuizzes }) => {
        if (cancelled) return;
        setQuizzes(loadedQuizzes);
        if (loadedQuizzes.length) setQuizId(loadedQuizzes[0]._id);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Quizləri yükləmək olmadı.",
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

  async function generateTasks() {
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const result = await requestJson<{ tasks: GeneratedTask[] }>(
        "/api/ai/tasks/generate",
        {
          method: "POST",
          body: JSON.stringify({ prompt, quizId, count: Number(count) }),
        },
      );
      setDrafts(
        result.tasks.map((task, index) => ({
          ...task,
          draftId: `${Date.now()}-${index}`,
        })),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "AI tapşırıqları yaratmaq mümkün olmadı.",
      );
    } finally {
      setGenerating(false);
    }
  }

  function updateDraft(draftId: string, changes: Partial<GeneratedTask>) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.draftId === draftId ? { ...draft, ...changes } : draft,
      ),
    );
  }

  async function saveDrafts() {
    const quiz = quizzes.find((item) => item._id === quizId);
    if (!quiz) {
      setError("Tapşırıqlar üçün quiz seçin.");
      return;
    }
    const payloads: {
      draft: DraftTask;
      body: Record<string, unknown>;
    }[] = [];
    for (const draft of drafts) {
      const title = draft.title.trim();
      const taskPrompt = draft.prompt.trim();
      if (!title || title.length > 200 || !taskPrompt || taskPrompt.length > 10000) {
        setError(`“${draft.title || "Adsız tapşırıq"}” üçün başlıq və sual mətnini yoxlayın.`);
        return;
      }
      let options: { id: string; text: string }[] = [];
      let correctAnswer: string | string[];
      if (draft.type === "short_answer") {
        correctAnswer = draft.correctAnswer.trim();
        if (!correctAnswer || correctAnswer.length > 2000) {
          setError(`“${title}” üçün düzgün yazılı cavabı daxil edin.`);
          return;
        }
      } else {
        const optionTexts = draft.options
          .map((option) => option.trim())
          .filter(Boolean);
        const indexes = parseAnswerIndexes(draft.correctAnswer);
        if (
          optionTexts.length < 2 ||
          optionTexts.length > 10 ||
          optionTexts.some((option) => option.length > 1000) ||
          !indexes.length ||
          indexes.some(
            (index) =>
              !Number.isInteger(index) ||
              index < 1 ||
              index > optionTexts.length,
          ) ||
          new Set(indexes).size !== indexes.length ||
          (draft.type === "single_choice" && indexes.length !== 1) ||
          (draft.type === "multiple_choice" && indexes.length < 2) ||
          (draft.type === "drag_drop" &&
            indexes.length !== optionTexts.length)
        ) {
          setError(`“${title}” üçün variantları və düzgün cavab nömrələrini yoxlayın.`);
          return;
        }
        options = optionTexts.map((text, index) => ({
          id: `option-${index + 1}`,
          text,
        }));
        const correctIds = indexes.map((index) => `option-${index}`);
        correctAnswer =
          draft.type === "single_choice" ? correctIds[0] : correctIds;
      }
      payloads.push({
        draft,
        body: {
          title,
          prompt: taskPrompt,
          contentBlocks: [{ type: "text", text: taskPrompt }],
          type: draft.type,
          options,
          correctAnswer,
          explanation: draft.explanation.trim(),
          difficulty: draft.difficulty,
          quizId,
        },
      });
    }

    setSaving(true);
    setError("");
    setNotice("");
    let savedCount = 0;
    try {
      for (const { draft, body } of payloads) {
        await requestJson("/api/tasks", {
          method: "POST",
          body: JSON.stringify(body),
        });
        savedCount += 1;
        setDrafts((current) =>
          current.filter((item) => item.draftId !== draft.draftId),
        );
      }
      setNotice(`${savedCount} tapşırıq “${quiz.title}” quizinə əlavə olundu.`);
      setDrafts([]);
    } catch (cause) {
      const detail =
        cause instanceof Error ? cause.message : "Yadda saxlamaq mümkün olmadı.";
      setError(
        savedCount
          ? `${savedCount} tapşırıq yadda saxlanıldı. Qalanları saxlanmadı: ${detail}`
          : detail,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell name={name} role="admin">
      <div className="mb-7">
        <p className="text-sm font-semibold text-brand-700">İdarəetmə / Tapşırıqlar</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          AI ilə tapşırıq yarat
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Mövzunu və istəklərini yaz, quiz seç və Gemini-dən tapşırıq layihələri al.
          Yoxlayıb redaktə etməyənə qədər heç nə yadda saxlanılmır.
        </p>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl bg-success-50 p-3 text-sm text-success-600">{notice}</p>}

      {!loading && !quizzes.length ? (
        <Card>
          <h2 className="font-bold">Əvvəlcə quiz yarat</h2>
          <p className="mt-2 text-sm text-muted">
            AI yaratdığı tapşırıqları seçilmiş quizə əlavə edir.
          </p>
          <a href="/admin/quizzes" className="mt-4 inline-block font-semibold text-brand-700">
            Quizlərə keç →
          </a>
        </Card>
      ) : (
        <Card className="max-w-3xl">
          <div className="space-y-5">
            <Select
              label="Tapşırıqların əlavə olunacağı quiz"
              value={quizId}
              onChange={(event) => setQuizId(event.currentTarget.value)}
              disabled={loading || generating || saving}
            >
              {loading ? (
                <option value="">Quizlər yüklənir...</option>
              ) : (
                quizzes.map((quiz) => (
                  <option key={quiz._id} value={quiz._id}>{quiz.title}</option>
                ))
              )}
            </Select>
            <Textarea
              label="Prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
              placeholder="Məsələn: 4-cü sinif üçün kəsrlərin müqayisəsi mövzusunda, gündəlik həyatdan nümunəli və orta çətinlikli suallar hazırla. Hər sualın izahı qısa olsun."
              rows={7}
              maxLength={6000}
              required
            />
            <div className="max-w-xs">
              <Select
                label="Tapşırıq sayı"
                value={count}
                onChange={(event) => setCount(event.currentTarget.value)}
                disabled={generating || saving}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                  <option key={value} value={value}>{value} tapşırıq</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">
                Gemini cavabları səhv yarada bilər. Yadda saxlamazdan əvvəl yoxlayın.
              </p>
              <Button
                type="button"
                disabled={loading || generating || saving || !quizId || !prompt.trim()}
                onClick={() => void generateTasks()}
              >
                {generating ? "Tapşırıqlar yaradılır..." : "Tapşırıqları yarat"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal
        open={drafts.length > 0}
        title="Yaradılmış tapşırıqlar"
        description="Mətnləri, cavab variantlarını və düzgün cavabları yoxlayıb redaktə edin. Yadda saxlamadığınız layihələr səhifədən çıxanda silinəcək."
        onClose={() => {
          if (!saving) {
            setDrafts([]);
            setError("");
          }
        }}
      >
        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          {drafts.map((draft, index) => (
            <Card key={draft.draftId} className="space-y-4 bg-surface-muted/40">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold">Tapşırıq {index + 1}</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    setDrafts((current) =>
                      current.filter((item) => item.draftId !== draft.draftId),
                    )
                  }
                >
                  Çıxar
                </Button>
              </div>
              <Input
                label="Başlıq"
                value={draft.title}
                maxLength={200}
                onChange={(event) =>
                  updateDraft(draft.draftId, { title: event.currentTarget.value })
                }
                disabled={saving}
              />
              <Textarea
                label="Sual mətni"
                value={draft.prompt}
                rows={4}
                maxLength={10000}
                onChange={(event) =>
                  updateDraft(draft.draftId, { prompt: event.currentTarget.value })
                }
                disabled={saving}
              />
              <Select
                label="Tapşırıq növü"
                value={draft.type}
                onChange={(event) =>
                  updateDraft(draft.draftId, {
                    type: event.currentTarget.value as TaskType,
                  })
                }
                disabled={saving}
              >
                {taskTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </Select>
              {draft.type !== "short_answer" && (
                <Textarea
                  label="Variantlar (hər sətirdə bir variant)"
                  value={draft.options.join("\n")}
                  rows={4}
                  onChange={(event) =>
                    updateDraft(draft.draftId, {
                      options: event.currentTarget.value.split("\n"),
                    })
                  }
                  disabled={saving}
                />
              )}
              <Input
                label={
                  draft.type === "short_answer"
                    ? "Düzgün yazılı cavab"
                    : draft.type === "single_choice"
                      ? "Düzgün variantın nömrəsi"
                      : draft.type === "multiple_choice"
                        ? "Düzgün variantların nömrələri"
                        : "Düzgün ardıcıllığın nömrələri"
                }
                value={draft.correctAnswer}
                placeholder={draft.type === "short_answer" ? "" : "Məsələn: 1, 3"}
                onChange={(event) =>
                  updateDraft(draft.draftId, {
                    correctAnswer: event.currentTarget.value,
                  })
                }
                disabled={saving}
              />
              <Textarea
                label="İzah"
                value={draft.explanation}
                rows={2}
                maxLength={5000}
                onChange={(event) =>
                  updateDraft(draft.draftId, {
                    explanation: event.currentTarget.value,
                  })
                }
                disabled={saving}
              />
              <Select
                label="Çətinlik"
                value={draft.difficulty}
                onChange={(event) =>
                  updateDraft(draft.draftId, {
                    difficulty: event.currentTarget.value as GeneratedTask["difficulty"],
                  })
                }
                disabled={saving}
              >
                <option value="easy">Asan</option>
                <option value="medium">Orta</option>
                <option value="hard">Çətin</option>
              </Select>
            </Card>
          ))}
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setDrafts([]);
              setError("");
            }}
          >
            Ləğv et
          </Button>
          <Button
            type="button"
            disabled={saving || !drafts.length}
            onClick={() => void saveDrafts()}
          >
            {saving ? "Yadda saxlanılır..." : "Yadda saxla"}
          </Button>
        </div>
      </Modal>
    </DashboardShell>
  );
}
