import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  jsonError,
  isNonEmptyString,
  readJsonObject,
} from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { Assignment } from "@/src/models/Assignment";
import { Group } from "@/src/models/Group";
import { Task } from "@/src/models/Task";
import { resolveQuizTaskIds } from "@/src/lib/quiz-selection";

export async function GET() {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  await connectToDatabase();
  const assignments = await Assignment.find({ createdBy: admin._id })
    .populate("groupId", "name")
    .populate("taskIds", "title type")
    .sort({ createdAt: -1 })
    .lean();
  return Response.json({ assignments });
}

export async function POST(request: Request) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const body = await readJsonObject(request);
  if (
    !body ||
    !isNonEmptyString(body.title) ||
    body.title.trim().length > 200 ||
    !isNonEmptyString(body.groupId) ||
    !(
      (Array.isArray(body.quizIds) &&
        body.quizIds.length > 0 &&
        body.quizIds.every(
          (id) =>
            typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
        )) ||
      (Array.isArray(body.taskIds) &&
        body.taskIds.length > 0 &&
        body.taskIds.every(
          (id) =>
            typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
        ))
    )
  ) {
    return jsonError("Ev tapşırığının məlumatları yanlışdır.", 400);
  }

  const dueAt =
    typeof body.dueAt === "string" ? new Date(body.dueAt) : undefined;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    return jsonError("Son tarix düzgün tarix olmalıdır.", 400);
  }

  await connectToDatabase();
  const taskIds =
    body.quizIds !== undefined
      ? await resolveQuizTaskIds(body.quizIds, admin._id)
      : [...new Set(body.taskIds as string[])];
  if (!taskIds) return jsonError("Quiz tapılmadı və ya boşdur.", 404);

  const [group, tasks] = await Promise.all([
    Group.findOne({
      _id: body.groupId,
      adminId: admin._id,
      archivedAt: null,
    }).select("_id"),
    Task.find({ _id: { $in: taskIds }, createdBy: admin._id }).select("_id"),
  ]);
  if (!group) return jsonError("Qrup tapılmadı.", 404);
  if (tasks.length !== taskIds.length) {
    return jsonError("Quizdəki tapşırıqlardan biri tapılmadı.", 404);
  }

  const assignment = await Assignment.create({
    title: body.title.trim(),
    groupId: group._id,
    taskIds: taskIds.map((taskId) => new mongoose.Types.ObjectId(taskId)),
    dueAt,
    createdBy: admin._id,
    publishedAt: new Date(),
  });
  return Response.json({ assignment }, { status: 201 });
}
