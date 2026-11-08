"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import { Modal } from "@/src/components/ui/Modal";
import { Select } from "@/src/components/ui/Select";
import { TaskContentEditor } from "@/src/components/admin/TaskContentEditor";
import { TaskOptionEditor } from "@/src/components/admin/TaskOptionEditor";
import { requestJson } from "@/src/lib/client-api";
import type {
  TaskContentBlock,
  TaskOption,
  TaskType,
} from "@/src/models/Task";

interface QuizOption {
  id: string;
  title: string;
}

interface BulkTaskDraft {
  id: string;
  title: string;
  taskType: TaskType;
  contentBlocks: TaskContentBlock[];
  options: TaskOption[];
  correctOptions: string[];
  correctText: string;
  correctSequence: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

interface BulkDraft {
  step: "setup" | "forms";
  names: string;
  quizId: string;
  tasks: BulkTaskDraft[];
  activeIndex: number;
}

interface TaskPayload {
  title: string;
  prompt: string;
  contentBlocks: TaskContentBlock[];
  type: TaskType;
  options: TaskOption[];
  correctAnswer: string | string[];
  explanation: string;
  difficulty: BulkTaskDraft["difficulty"];
}

const STORAGE_KEY = "bebras-admin-bulk-task-draft-v1";

function emptyDraft(): BulkDraft {
  return { step: "setup", names: "", quizId: "", tasks: [], activeIndex: 0 };
}

function isTaskContentBlock(value: unknown): value is TaskContentBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Record<string, unknown>;
  if (block.type === "text") return typeof block.text === "string";
  return (
    block.type === "image" &&
    typeof block.url === "string" &&
    typeof block.width === "number" &&
    typeof block.alt === "string" &&
    (block.maxWidthPx === undefined || typeof block.maxWidthPx === "number")
  );
}

function isTaskOption(value: unknown): value is TaskOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Record<string, unknown>;
  return (
    typeof option.id === "string" &&
    typeof option.text === "string" &&
    (option.imageUrl === undefined || typeof option.imageUrl === "string") &&
    (option.imageWidthPx === undefined ||
      typeof option.imageWidthPx === "number") &&
    (option.imageHeightPx === undefined ||
      typeof option.imageHeightPx === "number")
  );
}

function isBulkTaskDraft(value: unknown): value is BulkTaskDraft {
  if (!value || typeof value !== "object") return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.taskType === "string" &&
    ["single_choice", "multiple_choice", "drag_drop", "short_answer"].includes(
      task.taskType,
    ) &&
    Array.isArray(task.contentBlocks) &&
    task.contentBlocks.every(isTaskContentBlock) &&
    Array.isArray(task.options) &&
    task.options.every(isTaskOption) &&
    Array.isArray(task.correctOptions) &&
    task.correctOptions.every((id) => typeof id === "string") &&
    typeof task.correctText === "string" &&
    typeof task.correctSequence === "string" &&
    typeof task.explanation === "string" &&
    ["easy", "medium", "hard"].includes(String(task.difficulty))
  );
}

function isBulkDraft(value: unknown): value is BulkDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    (draft.step === "setup" || draft.step === "forms") &&
    typeof draft.names === "string" &&
    typeof draft.quizId === "string" &&
    Array.isArray(draft.tasks) &&
    draft.tasks.length <= 100 &&
    draft.tasks.every(isBulkTaskDraft) &&
    typeof draft.activeIndex === "number" &&
    Number.isInteger(draft.activeIndex) &&
    (draft.step !== "forms" || draft.tasks.length > 0) &&
    (draft.tasks.length === 0 ||
      (draft.activeIndex >= 0 && draft.activeIndex < draft.tasks.length))
  );
}

function readSavedDraft(): { draft: BulkDraft | null; error: string } {
  if (typeof window === "undefined") return { draft: null, error: "" };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { draft: null, error: "" };
    const parsed: unknown = JSON.parse(saved);
    return isBulkDraft(parsed)
      ? { draft: parsed, error: "" }
      : { draft: null, error: "Saxlanmış qaralama oxuna bilmədi." };
  } catch {
    return { draft: null, error: "Saxlanmış qaralama oxuna bilmədi." };
  }
}

function createTaskDraft(title: string): BulkTaskDraft {
  return {
    id: crypto.randomUUID(),
    title,
    taskType: "single_choice",
    contentBlocks: [{ type: "text", text: "" }],
    options: [
      { id: `option-${crypto.randomUUID()}`, text: "" },
      { id: `option-${crypto.randomUUID()}`, text: "" },
      { id: `option-${crypto.randomUUID()}`, text: "" },
      { id: `option-${crypto.randomUUID()}`, text: "" },
    ],
    correctOptions: [],
    correctText: "",
    correctSequence: "",
    explanation: "",
    difficulty: "medium",
  };
}

function buildTaskPayload(draft: BulkTaskDraft): TaskPayload {
  const title = draft.title.trim();
  if (!title) throw new Error("Hər tapşırığın adını daxil edin.");

  const prompt = draft.contentBlocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (
    !draft.contentBlocks.length ||
    draft.contentBlocks.length > 100 ||
    draft.contentBlocks.filter((block) => block.type === "image").length > 20 ||
    draft.contentBlocks
      .filter((block) => block.type === "text")
      .reduce((length, block) => length + block.text.length, 0) > 10000 ||
    (!prompt && !draft.contentBlocks.some((block) => block.type === "image"))
  ) {
    throw new Error(`“${title}” tapşırığının mətnini və ya şəklini əlavə edin.`);
  }

  const options =
    draft.taskType === "short_answer"
      ? []
      : draft.options
          .map((option) => ({ ...option, text: option.text.trim() }))
          .filter((option) => option.text || option.imageUrl);
  if (
    draft.taskType !== "short_answer" &&
    (options.length < 2 ||
      options.some((option) => !option.text && !option.imageUrl))
  ) {
    throw new Error(`“${title}” üçün ən azı iki cavab variantı daxil edin.`);
  }

  let correctAnswer: string | string[];
  if (draft.taskType === "short_answer") {
    correctAnswer = draft.correctText.trim();
    if (!correctAnswer) {
      throw new Error(`“${title}” üçün düzgün yazılı cavabı daxil edin.`);
    }
  } else if (
    draft.taskType === "single_choice" ||
    draft.taskType === "multiple_choice"
  ) {
    const selected = draft.correctOptions.filter((id) =>
      options.some((option) => option.id === id),
    );
    if (
      !selected.length ||
      (draft.taskType === "single_choice" && selected.length !== 1)
    ) {
      throw new Error(
        `“${title}” üçün ${draft.taskType === "single_choice" ? "bir düzgün variant" : "ən azı bir düzgün variant"} seçin.`,
      );
    }
    correctAnswer =
      draft.taskType === "single_choice" ? selected[0] : selected;
  } else {
    const indexes = draft.correctSequence
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    if (
      indexes.length !== options.length ||
      indexes.some(
        (index) =>
          !Number.isInteger(index) || index < 1 || index > options.length,
      ) ||
      new Set(indexes).size !== indexes.length
    ) {
      throw new Error(
        `“${title}” üçün düzgün ardıcıllıqda hər variantı bir dəfə göstərin.`,
      );
    }
    correctAnswer = indexes.map((index) => options[index - 1].id);
  }

  return {
    title,
    prompt,
    contentBlocks: draft.contentBlocks,
    type: draft.taskType,
    options,
    correctAnswer,
    explanation: draft.explanation,
    difficulty: draft.difficulty,
  };
}

export function BulkTaskModal({
  quizzes,
  onClose,
  onComplete,
}: {
  quizzes: QuizOption[];
  onClose: () => void;
  onComplete: (createdCount: number, warning: string) => void;
}) {
  const [savedDraft] = useState(readSavedDraft);
  const [draft, setDraft] = useState<BulkDraft>(emptyDraft);
  const draftRef = useRef(draft);
  const [storageError, setStorageError] = useState(savedDraft.error);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function persistDraft(next: BulkDraft) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError("Qaralamanı brauzer yaddaşında saxlamaq olmadı.");
    }
  }

  function updateDraft(update: (current: BulkDraft) => BulkDraft) {
    const next = update(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    persistDraft(next);
    setError("");
  }

  function updateTask(index: number, update: (task: BulkTaskDraft) => BulkTaskDraft) {
    updateDraft((current) => {
      const tasks = current.tasks.map((task, taskIndex) =>
        taskIndex === index ? update(task) : task,
      );
      return {
        ...current,
        tasks,
        names: tasks.map((task) => task.title).join("\n"),
      };
    });
  }

  function updateName(index: number, name: string) {
    updateDraft((current) => {
      const names = current.names ? current.names.split(/\r?\n/) : [""];
      names[index] = name;
      const tasks = current.tasks.map((task, taskIndex) =>
        taskIndex === index ? { ...task, title: name } : task,
      );
      return { ...current, names: names.join("\n"), tasks };
    });
  }

  function addName() {
    updateDraft((current) => ({
      ...current,
      names: current.names ? `${current.names}\n` : "\n",
    }));
  }

  function removeName(index: number) {
    updateDraft((current) => {
      const names = current.names ? current.names.split(/\r?\n/) : [""];
      names.splice(index, 1);
      const tasks = current.tasks.filter((_, taskIndex) => taskIndex !== index);
      return {
        ...current,
        names: names.join("\n"),
        tasks,
        activeIndex:
          tasks.length === 0
            ? 0
            : Math.min(current.activeIndex, tasks.length - 1),
      };
    });
  }

  function removeTask(index: number) {
    updateDraft((current) => {
      const tasks = current.tasks.filter((_, taskIndex) => taskIndex !== index);
      return {
        ...current,
        tasks,
        names: tasks.map((task) => task.title).join("\n"),
        activeIndex:
          tasks.length === 0
            ? 0
            : index < current.activeIndex
              ? current.activeIndex - 1
              : Math.min(current.activeIndex, tasks.length - 1),
        step: tasks.length === 0 ? "setup" : current.step,
      };
    });
  }

  function moveToForms() {
    const names = draft.names
      ? draft.names
          .split(/\r?\n/)
          .map((name, index) => ({ name: name.trim(), index }))
          .filter(({ name }) => Boolean(name))
      : [];
    if (!draft.quizId) {
      setError("Tapşırıqların əlavə ediləcəyi quiz-i seçin.");
      return;
    }
    if (!names.length) {
      setError("Ən azı bir tapşırıq adı daxil edin.");
      return;
    }
    if (names.length > 100) {
      setError("Bir dəfəyə maksimum 100 tapşırıq əlavə etmək olar.");
      return;
    }
    updateDraft((current) => ({
      ...current,
      names: names.map(({ name }) => name).join("\n"),
      tasks: names.map(
        ({ name, index }) => current.tasks[index] ?? createTaskDraft(name),
      ).map((task, index) => ({ ...task, title: names[index].name })),
      activeIndex: 0,
      step: "forms",
    }));
  }

  function restoreDraft() {
    const recovered = savedDraft.draft;
    if (!recovered) return;
    updateDraft(() => recovered);
    setError("");
  }

  async function saveTasks() {
    setError("");
    if (!draft.quizId || !draft.tasks.length) {
      setError("Quiz seçin və tapşırıq formalarını doldurun.");
      return;
    }

    let taskPayload: TaskPayload[];
    try {
      taskPayload = draft.tasks.map(buildTaskPayload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Form məlumatları yanlışdır.");
      return;
    }

    setSaving(true);
    let createdCount: number | null = null;
    try {
      const result = await requestJson<{ createdCount: number }>(
        `/api/quizzes/${draft.quizId}/tasks`,
        {
          method: "POST",
          body: JSON.stringify({ tasks: taskPayload }),
        },
      );
      createdCount = result.createdCount;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Tapşırıqları əlavə etmək olmadı.",
      );
    } finally {
      setSaving(false);
    }
    if (createdCount === null) return;

    let cleanupWarning = "";
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      cleanupWarning = " Qaralamanı yaddaşdan silmək mümkün olmadı.";
    }
    onComplete(createdCount, cleanupWarning);
    onClose();
  }

  const activeTask = draft.tasks[draft.activeIndex];

  return (
    <Modal
      open
      title="Tapşırıqları toplu əlavə et"
      size="full"
      onClose={onClose}
    >
      <div className="space-y-5">
        {storageError && (
          <p role="alert" className="rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-600">
            {storageError}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-600">
            {error}
          </p>
        )}

        {draft.step === "setup" ? (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Tapşırıq adları
                </p>
                <div className="space-y-2">
                  {(draft.names ? draft.names.split(/\r?\n/) : [""]).map(
                    (name, index) => (
                      <div key={index} className="flex items-end gap-2">
                        <Input
                          label={`Tapşırıq ${index + 1}`}
                          value={name}
                          maxLength={200}
                          onChange={(event) =>
                            updateName(index, event.currentTarget.value)
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`Tapşırıq ${index + 1}-i sil`}
                          onClick={() => removeName(index)}
                        >
                          Sil
                        </Button>
                      </div>
                    ),
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addName}
                >
                  Ad əlavə et
                </Button>
                {savedDraft.draft && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={restoreDraft}
                  >
                    Qaralamanı bərpa et
                  </Button>
                )}
              </div>
              <Select
                label="Quiz"
                value={draft.quizId}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    quizId: event.currentTarget.value,
                  }))
                }
                required
              >
                <option value="">Quiz seçin</option>
                {quizzes.map((quiz) => (
                  <option key={quiz.id} value={quiz.id}>
                    {quiz.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!quizzes.length}
                onClick={moveToForms}
              >
                Növbəti
              </Button>
            </div>
          </>
        ) : (
          <>
            <div
              className="flex gap-2 overflow-x-auto border-b border-border pb-2"
              role="tablist"
              aria-label="Tapşırıq formaları"
            >
              {draft.tasks.map((task, index) => (
                <div key={task.id} className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={draft.activeIndex === index}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        activeIndex: index,
                      }))
                    }
                    className={`max-w-56 truncate rounded-lg px-3 py-2 text-sm font-semibold ${
                      draft.activeIndex === index
                        ? "bg-brand-50 text-brand-700"
                        : "text-muted hover:bg-surface-muted"
                    }`}
                  >
                    {task.title || `Tapşırıq ${index + 1}`}
                  </button>
                  <button
                    type="button"
                    aria-label={`“${task.title || `Tapşırıq ${index + 1}`}” formasını sil`}
                    disabled={saving}
                    onClick={() => removeTask(index)}
                    className="rounded px-2 py-1 text-xs text-danger-600 hover:bg-danger-50 disabled:opacity-50"
                  >
                    Sil
                  </button>
                </div>
              ))}
            </div>
            {activeTask && (
              <BulkTaskFields
                key={activeTask.id}
                task={activeTask}
                index={draft.activeIndex}
                saving={saving}
                onChange={(update) => updateTask(draft.activeIndex, update)}
              />
            )}
            <div className="flex flex-wrap justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() =>
                  updateDraft((current) => ({ ...current, step: "setup" }))
                }
              >
                Əvvəlki
              </Button>
              <div className="flex gap-2">
                {draft.activeIndex > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        activeIndex: current.activeIndex - 1,
                      }))
                    }
                  >
                    Əvvəlki tapşırıq
                  </Button>
                )}
                {draft.activeIndex < draft.tasks.length - 1 ? (
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        activeIndex: current.activeIndex + 1,
                      }))
                    }
                  >
                    Növbəti tapşırıq
                  </Button>
                ) : (
                  <Button type="button" disabled={saving} onClick={() => void saveTasks()}>
                    {saving ? "Əlavə olunur..." : "Göndər"}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function BulkTaskFields({
  task,
  index,
  saving,
  onChange,
}: {
  task: BulkTaskDraft;
  index: number;
  saving: boolean;
  onChange: (update: (task: BulkTaskDraft) => BulkTaskDraft) => void;
}) {
  const [taskType, setTaskType] = useState(task.taskType);
  const [options, setOptions] = useState(task.options);
  const [correctOptions, setCorrectOptions] = useState(task.correctOptions);

  function update<K extends keyof BulkTaskDraft>(
    key: K,
    value: BulkTaskDraft[K],
  ) {
    onChange((current) => ({ ...current, [key]: value }));
  }

  function changeType(nextType: TaskType) {
    setTaskType(nextType);
    update("taskType", nextType);
  }

  function changeOptions(nextOptions: TaskOption[]) {
    setOptions(nextOptions);
    update("options", nextOptions);
  }

  function changeCorrectOptions(nextCorrectOptions: string[]) {
    setCorrectOptions(nextCorrectOptions);
    update("correctOptions", nextCorrectOptions);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        <Input
          label="Tapşırığın adı"
          value={task.title}
          maxLength={200}
          required
          onChange={(event) => update("title", event.currentTarget.value)}
        />
        <TaskContentEditor
          initialBlocks={task.contentBlocks}
          prompt=""
          disabled={saving}
          onChange={(next) => {
            update("contentBlocks", next);
          }}
        />
      </div>
      <div className="space-y-4">
        <Select
          label="Tapşırıq növü"
          value={taskType}
          onChange={(event) => changeType(event.currentTarget.value as TaskType)}
        >
          <option value="single_choice">Bir düzgün cavab</option>
          <option value="multiple_choice">Bir neçə düzgün cavab</option>
          <option value="drag_drop">Ardıcıllıq qur</option>
          <option value="short_answer">Yazılı cavab</option>
        </Select>
        {taskType === "short_answer" ? (
          <Input
            label="Düzgün yazılı cavab"
            value={task.correctText}
            maxLength={2000}
            required
            onChange={(event) => update("correctText", event.currentTarget.value)}
          />
        ) : (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-foreground">
              Cavab variantları
            </legend>
            {options.map((option, optionIndex) => (
              <TaskOptionEditor
                key={option.id}
                option={option}
                label={`Variant ${optionIndex + 1}`}
                correctInputName={`correct-option-${task.id}`}
                correct={correctOptions.includes(option.id)}
                correctInputType={
                  taskType === "single_choice" ? "radio" : "checkbox"
                }
                showCorrectControl={taskType !== "drag_drop"}
                disabled={saving}
                onChange={(nextOption) =>
                  changeOptions(
                    options.map((item) =>
                      item.id === option.id ? nextOption : item,
                    ),
                  )
                }
                onCorrectChange={() =>
                  changeCorrectOptions(
                    taskType === "multiple_choice"
                      ? correctOptions.includes(option.id)
                        ? correctOptions.filter((id) => id !== option.id)
                        : [...correctOptions, option.id]
                      : correctOptions.includes(option.id)
                        ? []
                        : [option.id],
                  )
                }
                onRemove={
                  options.length > 2
                    ? () => {
                        changeOptions(
                          options.filter((item) => item.id !== option.id),
                        );
                        changeCorrectOptions(
                          correctOptions.filter((id) => id !== option.id),
                        );
                      }
                    : undefined
                }
              />
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() =>
                changeOptions([
                  ...options,
                  { id: `option-${crypto.randomUUID()}`, text: "" },
                ])
              }
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Variant əlavə et
            </Button>
          </fieldset>
        )}
        {taskType === "drag_drop" && (
          <Input
            label="Düzgün ardıcıllığın nömrələri"
            value={task.correctSequence}
            placeholder="Məsələn: 2, 1, 3"
            required
            onChange={(event) =>
              update("correctSequence", event.currentTarget.value)
            }
          />
        )}
      </div>
      <p className="text-xs text-muted xl:col-span-2">
        {index + 1}-ci tapşırıq · dəyişikliklər avtomatik saxlanılır.
      </p>
    </div>
  );
}
