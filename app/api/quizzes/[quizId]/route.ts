import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { isNonEmptyString, jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { Quiz } from "@/src/models/Quiz";
import { Task } from "@/src/models/Task";

export async function PATCH(
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
    (body.title !== undefined &&
      (!isNonEmptyString(body.title) || body.title.trim().length > 200)) ||
    (body.taskIds !== undefined &&
      (!Array.isArray(body.taskIds) ||
        body.taskIds.length > 200 ||
        !body.taskIds.every(
          (id: unknown) =>
            typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
        ) ||
        new Set(body.taskIds).size !== body.taskIds.length)) ||
    (body.action !== undefined && body.action !== "add-tasks")
  ) {
    return jsonError("Quizin məlumatları yanlışdır.", 400);
  }

  await connectToDatabase();
  const quiz = await Quiz.findOne({ _id: quizId, createdBy: admin._id });
  if (!quiz) return jsonError("Quiz tapılmadı.", 404);
  let taskIds: string[] | undefined;
  if (body.taskIds !== undefined) {
    taskIds = body.taskIds as string[];
    const tasks = taskIds.length
      ? await Task.find({
          _id: { $in: taskIds },
          createdBy: admin._id,
          $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
        }).select("_id")
      : [];
    if (tasks.length !== taskIds.length) {
      return jsonError("Seçilən tapşırıqlardan biri tapılmadı.", 404);
    }
  }

  if (body.title !== undefined) {
    if (typeof body.title !== "string") return jsonError("Quizin adı yanlışdır.", 400);
    quiz.title = body.title.trim();
  }
  if (body.action === "add-tasks") {
    if (!taskIds?.length) {
      return jsonError("Quizə əlavə etmək üçün tapşırıq seçin.", 400);
    }
    const existing = new Set(
      quiz.taskIds.map((id: mongoose.Types.ObjectId) => id.toString()),
    );
    quiz.taskIds.push(
      ...taskIds
        .filter((taskId) => !existing.has(taskId))
        .map((taskId) => new mongoose.Types.ObjectId(taskId)),
    );
  } else if (taskIds !== undefined) {
    quiz.taskIds = taskIds.map(
      (taskId) => new mongoose.Types.ObjectId(taskId),
    );
  }
  await quiz.save();
  return Response.json({ quiz });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ quizId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;
  const { quizId } = await params;
  if (!mongoose.Types.ObjectId.isValid(quizId)) {
    return jsonError("Quiz tapılmadı.", 404);
  }

  await connectToDatabase();
  const quiz = await Quiz.findOneAndDelete({
    _id: quizId,
    createdBy: admin._id,
  });
  if (!quiz) return jsonError("Quiz tapılmadı.", 404);
  return Response.json({ success: true });
}
