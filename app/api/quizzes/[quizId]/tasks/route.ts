import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { parseTask } from "@/src/lib/task-validation";
import { Quiz } from "@/src/models/Quiz";
import { Task } from "@/src/models/Task";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quizId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { quizId } = await params;
  if (!mongoose.Types.ObjectId.isValid(quizId)) {
    return jsonError("Quiz tapılmadı.", 404);
  }
  const body = await readJsonObject(request);
  if (
    !body ||
    !Array.isArray(body.tasks) ||
    body.tasks.length === 0 ||
    body.tasks.length > 100
  ) {
    return jsonError(
      "Əlavə ediləcək tapşırıqlar 1-100 elementdən ibarət massiv olmalıdır.",
      400,
    );
  }

  const taskData = [];
  for (const [index, value] of body.tasks.entries()) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return jsonError(`${index + 1}-ci tapşırığın JSON formatı yanlışdır.`, 400);
    }
    const parsed = parseTask({
      ...(value as Record<string, unknown>),
      quizId,
    });
    if (!parsed.value) {
      return jsonError(
        `${index + 1}-ci tapşırıq: ${parsed.error ?? "məlumatlar yanlışdır."}`,
        400,
      );
    }
    taskData.push(parsed.value);
  }

  await connectToDatabase();
  const quiz = await Quiz.findOne({ _id: quizId, createdBy: admin._id });
  if (!quiz) return jsonError("Quiz tapılmadı.", 404);

  const tasks = await Task.insertMany(
    taskData.map((task) => ({
      title: task.title,
      prompt: task.prompt,
      contentBlocks: task.contentBlocks,
      type: task.type,
      options: task.options,
      correctAnswer: task.correctAnswer,
      explanation: task.explanation,
      difficulty: task.difficulty,
      createdBy: admin._id,
    })),
  );
  quiz.taskIds.push(...tasks.map((task) => task._id));
  await quiz.save();

  return Response.json({ createdCount: tasks.length }, { status: 201 });
}
