import type { TaskType } from "@/src/models/Task";

export function normalizeAnswer(
  answer: unknown,
  type: TaskType,
): string | string[] | null {
  if (type === "multiple_choice" || type === "drag_drop") {
    if (
      !Array.isArray(answer) ||
      !answer.every((item) => typeof item === "string")
    ) {
      return null;
    }
    const values = answer.map((item: string) => item.trim());
    return type === "multiple_choice" ? values.sort() : values;
  }
  if (typeof answer !== "string") return null;
  const normalized = answer.trim();
  return type === "short_answer" ? normalized.toLocaleLowerCase() : normalized;
}

export function isCorrectAnswer(
  answer: unknown,
  correctAnswer: unknown,
  type: TaskType,
) {
  const normalizedAnswer = normalizeAnswer(answer, type);
  const normalizedCorrect = normalizeAnswer(correctAnswer, type);
  return (
    normalizedAnswer !== null &&
    normalizedCorrect !== null &&
    JSON.stringify(normalizedAnswer) === JSON.stringify(normalizedCorrect)
  );
}

export function isValidAnswer(
  answer: unknown,
  type: TaskType,
  optionIds: Set<string>,
) {
  if (type === "multiple_choice" || type === "drag_drop") {
    return (
      Array.isArray(answer) &&
      answer.length > 0 &&
      answer.every(
        (item: unknown) =>
          typeof item === "string" &&
          optionIds.has(item) &&
          item.length <= 100,
      ) &&
      new Set(answer).size === answer.length
    );
  }
  if (typeof answer !== "string" || answer.trim().length === 0) return false;
  if (type === "single_choice") return optionIds.has(answer);
  return answer.length <= 2000;
}
