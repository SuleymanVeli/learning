import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { isNonEmptyString, jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { Quiz } from "@/src/models/Quiz";
import { Task } from "@/src/models/Task";

export async function GET() {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  await connectToDatabase();
  const quizzes = await Quiz.find({ createdBy: admin._id })
    .populate("taskIds", "title type difficulty")
    .sort({ createdAt: -1 })
    .lean();
  return Response.json({ quizzes });
}

export async function POST(request: Request) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const body = await readJsonObject(request);
  if (
    !body ||
    !isNonEmptyString(body.title) ||
    body.title.trim().length > 200 ||
    (body.taskIds !== undefined &&
      (!Array.isArray(body.taskIds) ||
        body.taskIds.length > 200 ||
        !body.taskIds.every(
          (id: unknown) =>
            typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
        ) ||
        new Set(body.taskIds).size !== body.taskIds.length))
  ) {
    return jsonError("Quizin məlumatları yanlışdır.", 400);
  }

  await connectToDatabase();
  const taskIds = (body.taskIds ?? []) as string[];
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

  const quiz = await Quiz.create({
    title: body.title.trim(),
    taskIds: tasks.map((task) => task._id),
    createdBy: admin._id,
  });
  return Response.json({ quiz }, { status: 201 });
}
