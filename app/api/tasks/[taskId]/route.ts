import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { parseTask } from "@/src/lib/task-validation";
import { Quiz } from "@/src/models/Quiz";
import { Task } from "@/src/models/Task";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { taskId } = await params;
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return jsonError("Tapşırıq tapılmadı.", 404);
  }
  const body = await readJsonObject(request);
  if (!body) return jsonError("Tapşırığın məlumatları yanlışdır.", 400);
  const parsed = parseTask(body);
  if (!parsed.value) {
    return jsonError(parsed.error ?? "Tapşırığın məlumatları yanlışdır.", 400);
  }
  const taskData = parsed.value;

  await connectToDatabase();
  const [task, quiz] = await Promise.all([
    Task.findOne({
      _id: taskId,
      createdBy: admin._id,
      $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
    }),
    Quiz.findOne({ _id: taskData.quizId, createdBy: admin._id }),
  ]);
  if (!task) return jsonError("Tapşırıq tapılmadı.", 404);
  if (!quiz) return jsonError("Seçilən quiz tapılmadı.", 404);

  task.title = taskData.title;
  task.prompt = taskData.prompt;
  task.contentBlocks = taskData.contentBlocks;
  task.type = taskData.type;
  task.options = taskData.options;
  task.correctAnswer = taskData.correctAnswer;
  task.explanation = taskData.explanation;
  task.difficulty = taskData.difficulty;
  await task.save();
  await Quiz.updateOne(
    { _id: quiz._id },
    { $addToSet: { taskIds: task._id } },
  );
  return Response.json({ task });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { taskId } = await params;
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return jsonError("Tapşırıq tapılmadı.", 404);
  }

  await connectToDatabase();
  const task = await Task.findOneAndUpdate(
    {
      _id: taskId,
      createdBy: admin._id,
      $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
    },
    { $set: { archivedAt: new Date() } },
    { new: true },
  );
  if (!task) return jsonError("Tapşırıq tapılmadı.", 404);

  await Quiz.updateMany(
    { createdBy: admin._id, taskIds: task._id },
    { $pull: { taskIds: task._id } },
  );
  return Response.json({ success: true });
}
