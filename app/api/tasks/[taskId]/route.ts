import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { parseTask } from "@/src/lib/task-validation";
import {
  parseTeacherVideoUpdates,
  syncTeacherTaskVideos,
} from "@/src/lib/teacher-task-videos";
import { Quiz } from "@/src/models/Quiz";
import { Task } from "@/src/models/Task";
import { TeacherTaskVideo } from "@/src/models/TeacherTaskVideo";

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
  const videoUpdates = await parseTeacherVideoUpdates(admin, body);
  if (videoUpdates instanceof Response) return videoUpdates;
  const task = await Task.findOne({
      _id: taskId,
      $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
    });
  if (!task) return jsonError("Tapşırıq tapılmadı.", 404);
  const quiz = taskData.quizId
    ? await Quiz.findOne({
        _id: taskData.quizId,
      })
    : null;
  if (taskData.quizId && !quiz) {
    return jsonError("Seçilən quiz tapılmadı.", 404);
  }

  task.title = taskData.title;
  task.prompt = taskData.prompt;
  task.contentBlocks = taskData.contentBlocks;
  task.type = taskData.type;
  task.options = taskData.options;
  task.correctAnswer = taskData.correctAnswer;
  task.explanation = taskData.explanation;
  task.difficulty = taskData.difficulty;
  await task.save();
  await syncTeacherTaskVideos(task._id, videoUpdates);
  if (
    videoUpdates.some(({ teacherId }) => task.createdBy.equals(teacherId)) &&
    task.videoExplanationId
  ) {
    await Task.updateOne(
      { _id: task._id },
      { $unset: { videoExplanationId: 1 } },
    );
    task.videoExplanationId = undefined;
  }
  if (quiz) {
    await Quiz.updateOne(
      { _id: quiz._id },
      { $addToSet: { taskIds: task._id } },
    );
  }
  return Response.json({
    task: {
      ...task.toObject(),
      videoExplanationId: task.createdBy.equals(admin._id)
        ? task.videoExplanationId
        : undefined,
    },
  });
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
      $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
    },
    { $set: { archivedAt: new Date() } },
    { new: true },
  );
  if (!task) return jsonError("Tapşırıq tapılmadı.", 404);

  await Quiz.updateMany(
    { taskIds: task._id },
    { $pull: { taskIds: task._id } },
  );
  await TeacherTaskVideo.deleteMany({ taskId: task._id });
  return Response.json({ success: true });
}
