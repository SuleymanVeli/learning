import mongoose from "mongoose";
import { Quiz } from "@/src/models/Quiz";

export async function resolveQuizTaskIds(
  quizIds: unknown,
  createdBy: mongoose.Types.ObjectId,
) {
  if (
    !Array.isArray(quizIds) ||
    quizIds.length === 0 ||
    quizIds.length > 100 ||
    !quizIds.every(
      (id) => typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
    ) ||
    new Set(quizIds).size !== quizIds.length
  ) {
    return null;
  }

  const normalizedQuizIds = quizIds.map((id: string) =>
    new mongoose.Types.ObjectId(id).toString(),
  );
  const quizzes = await Quiz.find({
    _id: { $in: normalizedQuizIds },
    createdBy,
  }).select("taskIds");
  if (quizzes.length !== normalizedQuizIds.length) return null;

  const taskIds = new Set<string>();
  for (const quizId of normalizedQuizIds) {
    const quiz = quizzes.find((item) => item._id.toString() === quizId);
    if (!quiz) return null;
    for (const taskId of quiz.taskIds) taskIds.add(taskId.toString());
  }
  return taskIds.size ? [...taskIds] : null;
}
