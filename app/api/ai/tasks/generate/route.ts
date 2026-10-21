import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { isNonEmptyString, jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { Quiz } from "@/src/models/Quiz";
import { TASK_TYPES, type TaskType } from "@/src/models/Task";

export const maxDuration = 90;

interface GeneratedTask {
  title: string;
  prompt: string;
  type: TaskType;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getGeneratedText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return null;
  const candidate = value.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content)) return null;
  const parts = candidate.content.parts;
  if (!Array.isArray(parts)) return null;
  const textPart = parts.find(
    (part) => isRecord(part) && typeof part.text === "string",
  );
  return isRecord(textPart) && typeof textPart.text === "string"
    ? textPart.text
    : null;
}

function parseGeneratedTasks(value: unknown, count: number): GeneratedTask[] | null {
  if (!isRecord(value) || !Array.isArray(value.tasks) || value.tasks.length !== count) {
    return null;
  }

  const tasks: GeneratedTask[] = [];
  for (const item of value.tasks) {
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.title) ||
      item.title.trim().length > 200 ||
      !isNonEmptyString(item.prompt) ||
      item.prompt.trim().length > 10000 ||
      typeof item.type !== "string" ||
      !TASK_TYPES.includes(item.type as TaskType) ||
      !Array.isArray(item.options) ||
      !item.options.every(
        (option) =>
          typeof option === "string" &&
          option.trim().length > 0 &&
          option.trim().length <= 1000,
      ) ||
      !isNonEmptyString(item.correctAnswer) ||
      item.correctAnswer.trim().length > 2000 ||
      typeof item.explanation !== "string" ||
      item.explanation.trim().length > 5000 ||
      !["easy", "medium", "hard"].includes(String(item.difficulty))
    ) {
      return null;
    }

    const type = item.type as TaskType;
    const options = item.options.map((option) => option.trim());
    const answer = item.correctAnswer.trim();
    if (type === "short_answer") {
      if (options.length !== 0) return null;
    } else {
      if (options.length < 2 || options.length > 10) return null;
      const indexes = answer.split(/[,\s]+/).map(Number);
      if (
        indexes.some(
          (index) =>
            !Number.isInteger(index) || index < 1 || index > options.length,
        ) ||
        new Set(indexes).size !== indexes.length ||
        (type === "single_choice" && indexes.length !== 1) ||
        (type === "multiple_choice" && indexes.length < 2) ||
        (type === "drag_drop" && indexes.length !== options.length)
      ) {
        return null;
      }
    }

    tasks.push({
      title: item.title.trim(),
      prompt: item.prompt.trim(),
      type,
      options,
      correctAnswer: answer,
      explanation: item.explanation.trim(),
      difficulty: item.difficulty as GeneratedTask["difficulty"],
    });
  }
  return tasks;
}

export async function POST(request: Request) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const body = await readJsonObject(request);
  if (
    !body ||
    !isNonEmptyString(body.prompt) ||
    body.prompt.trim().length > 6000 ||
    typeof body.quizId !== "string" ||
    !mongoose.Types.ObjectId.isValid(body.quizId) ||
    typeof body.count !== "number" ||
    !Number.isInteger(body.count) ||
    body.count < 1 ||
    body.count > 10
  ) {
    return jsonError("Prompt, quiz və 1-10 aralığında say tələb olunur.", 400);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError("Gemini istifadə etmək üçün GEMINI_API_KEY təyin edin.", 503);
  }
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    return jsonError("GEMINI_MODEL mühit dəyişəni yanlışdır.", 500);
  }

  await connectToDatabase();
  const quiz = await Quiz.findOne({
    _id: body.quizId,
    createdBy: admin._id,
  }).select("title");
  if (!quiz) return jsonError("Seçilən quiz tapılmadı.", 404);

  const schema = {
    type: "OBJECT",
    properties: {
      tasks: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            prompt: { type: "STRING" },
            type: { type: "STRING", enum: TASK_TYPES },
            options: { type: "ARRAY", items: { type: "STRING" } },
            correctAnswer: { type: "STRING" },
            explanation: { type: "STRING" },
            difficulty: {
              type: "STRING",
              enum: ["easy", "medium", "hard"],
            },
          },
          required: [
            "title",
            "prompt",
            "type",
            "options",
            "correctAnswer",
            "explanation",
            "difficulty",
          ],
        },
      },
    },
    required: ["tasks"],
  };
  const generationPrompt = [
    "Sən BeMath tədris platforması üçün Azərbaycan dilində keyfiyyətli riyaziyyat və məntiq tapşırıqları yaradırsan.",
    `Seçilmiş quiz: ${quiz.title}`,
    `Dəqiq ${body.count} fərqli tapşırıq yarat.`,
    "Müəllimin tələbi:",
    body.prompt.trim(),
    "Tapşırıq növləri: single_choice (bir düzgün variant), multiple_choice (ən azı iki düzgün variant), drag_drop (variantların düzgün ardıcıllığı), short_answer (qısa yazılı cavab).",
    "Variantlı tapşırıqlarda 2-6 qısa variant ver; correctAnswer 1-dən başlayan variant nömrələrini vergüllə göstər. drag_drop üçün bütün variantların düzgün ardıcıllığını yaz.",
    "short_answer üçün options boş massiv, correctAnswer isə qəbul ediləcək qısa cavab olsun. Hər tapşırıqda aydın sual, doğru cavab və qısa izah olsun. Hesablamaları və düzgün cavabları diqqətlə yoxla.",
    "Yalnız tələb olunan JSON sxeminə uyğun nəticə qaytar. HTML və Markdown istifadə etmə.",
  ].join("\n\n");

  let response: Response;


  console.log({
          contents: [{ parts: [{ text: generationPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        })
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: generationPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
        signal: AbortSignal.timeout(90000),
      },
    );
  } catch {
    return jsonError("Gemini API-yə qoşulmaq mümkün olmadı.", 502);
  }
  if (!response.ok) {
    return jsonError(`Gemini API sorğusu uğursuz oldu (${response.status}).`, 502);
  }

  let providerResult: unknown;
  try {
    providerResult = await response.json();
  } catch {
    return jsonError("Gemini API etibarlı JSON cavabı qaytarmadı.", 502);
  }
  const generatedText = getGeneratedText(providerResult);
  if (!generatedText) {
    return jsonError("Gemini tapşırıq yarada bilmədi. Yenidən cəhd edin.", 502);
  }

  let generatedData: unknown;
  try {
    generatedData = JSON.parse(generatedText);
  } catch {
    return jsonError("Gemini strukturlaşdırılmış tapşırıq qaytarmadı.", 502);
  }
  const tasks = parseGeneratedTasks(generatedData, body.count);
  if (!tasks) {
    return jsonError(
      "Gemini tapşırıq formatını düzgün yaratmadı. Promptu dəqiqləşdirib yenidən yoxlayın.",
      502,
    );
  }

  return Response.json({ tasks });
}
