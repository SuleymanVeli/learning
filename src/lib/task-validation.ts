import mongoose from "mongoose";
import { isNonEmptyString } from "@/src/lib/api";
import { sanitizeTaskHtml } from "@/src/lib/task-content-html";
import {
  TASK_TYPES,
  type TaskContentBlock,
  type TaskOption,
  type TaskType,
} from "@/src/models/Task";

function parseOptions(value: unknown): TaskOption[] | null {
  if (!Array.isArray(value)) return null;
  const options: TaskOption[] = [];
  for (const option of value) {
    if (
      option === null ||
      typeof option !== "object" ||
      !("id" in option) ||
      !("text" in option) ||
      !isNonEmptyString(option.id) ||
      !isNonEmptyString(option.text)
    ) {
      return null;
    }
    options.push({ id: option.id.trim(), text: option.text.trim() });
  }
  if (
    options.some(
      (option) => option.id.length > 100 || option.text.length > 1000,
    ) ||
    new Set(options.map((option) => option.id)).size !== options.length
  ) {
    return null;
  }
  return options;
}

interface ParsedTask {
  title: string;
  prompt: string;
  contentBlocks: TaskContentBlock[];
  type: TaskType;
  options: TaskOption[];
  correctAnswer: unknown;
  explanation: string | undefined;
  difficulty: "easy" | "medium" | "hard";
  quizId: string;
}

function parseContentBlocks(value: unknown): TaskContentBlock[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return null;
  }
  const blocks: TaskContentBlock[] = [];
  let textLength = 0;
  let imageCount = 0;

  for (const block of value) {
    if (block === null || typeof block !== "object" || !("type" in block)) {
      return null;
    }
    if (
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
    ) {
      textLength += block.text.length;
      if (textLength > 10000) return null;
      blocks.push({ type: "text", text: sanitizeTaskHtml(block.text) });
      continue;
    }
    if (
      block.type === "image" &&
      "url" in block &&
      typeof block.url === "string" &&
      block.url.length <= 2048 &&
      "width" in block &&
      typeof block.width === "number" &&
      Number.isInteger(block.width) &&
      block.width >= 10 &&
      block.width <= 100 &&
      (!("maxWidthPx" in block) ||
        (typeof block.maxWidthPx === "number" &&
          Number.isInteger(block.maxWidthPx) &&
          block.maxWidthPx >= 1 &&
          block.maxWidthPx <= 4096)) &&
      "alt" in block &&
      typeof block.alt === "string" &&
      block.alt.length <= 300
    ) {
      let imageUrl: URL;
      try {
        imageUrl = new URL(block.url);
      } catch {
        return null;
      }
      if (
        imageUrl.protocol !== "https:" ||
        !imageUrl.hostname.endsWith(".public.blob.vercel-storage.com")
      ) {
        return null;
      }
      imageCount += 1;
      if (imageCount > 20) return null;
      blocks.push({
        type: "image",
        url: imageUrl.toString(),
        width: block.width,
        maxWidthPx:
          "maxWidthPx" in block && typeof block.maxWidthPx === "number"
            ? block.maxWidthPx
            : undefined,
        alt: block.alt,
      });
      continue;
    }
    return null;
  }

  return blocks.some(
    (block) => block.type === "image" || block.text.trim().length > 0,
  )
    ? blocks
    : null;
}

type TaskParseResult =
  | { error: string; value?: never }
  | { value: ParsedTask; error?: never };

export function parseTask(
  body: Record<string, unknown>,
): TaskParseResult {
  const contentBlocks =
    body.contentBlocks === undefined
      ? isNonEmptyString(body.prompt)
        ? [{ type: "text" as const, text: body.prompt.trim() }]
        : null
      : parseContentBlocks(body.contentBlocks);
  const prompt =
    contentBlocks
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim() ?? "";
  if (
    !isNonEmptyString(body.title) ||
    body.title.trim().length > 200 ||
    !contentBlocks ||
    typeof body.type !== "string" ||
    !TASK_TYPES.includes(body.type as TaskType) ||
    body.correctAnswer === undefined
  ) {
    return { error: "Tapşırığın məlumatları yanlışdır və ya natamamdır." };
  }
  if (prompt.length > 10000) {
    return { error: "Tapşırığın mətn hissəsi 10 000 simvoldan uzun ola bilməz." };
  }

  const options = parseOptions(body.options ?? []);
  if (!options) return { error: "Cavab variantlarının formatı yanlışdır." };
  if (
    (body.type === "single_choice" || body.type === "multiple_choice") &&
    options.length < 2
  ) {
    return { error: "Seçimli sualda ən azı iki variant olmalıdır." };
  }
  const optionIds = new Set(options.map((option) => option.id));
  if (
    body.type === "single_choice" &&
    (typeof body.correctAnswer !== "string" ||
      !optionIds.has(body.correctAnswer))
  ) {
    return { error: "Düzgün cavab mövcud variantlardan biri olmalıdır." };
  }
  if (
    (body.type === "multiple_choice" || body.type === "drag_drop") &&
    (!Array.isArray(body.correctAnswer) ||
      body.correctAnswer.length === 0 ||
      body.correctAnswer.length > options.length ||
      !body.correctAnswer.every(
        (answer) => typeof answer === "string" && optionIds.has(answer),
      ) ||
      new Set(body.correctAnswer).size !== body.correctAnswer.length ||
      (body.type === "drag_drop" &&
        body.correctAnswer.length !== options.length))
  ) {
    return {
      error:
        body.type === "drag_drop"
          ? "Düzgün ardıcıllıq bütün variantlardan ibarət olmalıdır."
          : "Düzgün cavab mövcud variantlardan ibarət olmalıdır.",
    };
  }
  if (
    body.type === "short_answer" &&
    (typeof body.correctAnswer !== "string" ||
      body.correctAnswer.trim().length === 0 ||
      body.correctAnswer.length > 2000)
  ) {
    return { error: "Düzgün yazılı cavab 1-2000 simvol olmalıdır." };
  }
  if (
    body.difficulty !== undefined &&
    !["easy", "medium", "hard"].includes(String(body.difficulty))
  ) {
    return { error: "Çətinlik səviyyəsi yanlışdır." };
  }
  const quizId = body.quizId;
  if (typeof quizId !== "string" || !mongoose.Types.ObjectId.isValid(quizId)) {
    return { error: "Tapşırığın əlavə ediləcəyi quiz-i seçin." };
  }

  return {
    value: {
      title: body.title.trim(),
      prompt,
      contentBlocks,
      type: body.type as TaskType,
      options,
      correctAnswer: body.correctAnswer,
      explanation:
        typeof body.explanation === "string"
          ? body.explanation.trim()
          : undefined,
      difficulty: (body.difficulty ?? "medium") as "easy" | "medium" | "hard",
      quizId,
    },
  };
}
