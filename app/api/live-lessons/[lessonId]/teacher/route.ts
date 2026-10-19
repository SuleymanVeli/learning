import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { LiveLesson } from "@/src/models/LiveLesson";
import { Task } from "@/src/models/Task";
import { sanitizeTaskContentBlocks } from "@/src/lib/task-content-html";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { lessonId } = await params;
  if (!mongoose.Types.ObjectId.isValid(lessonId)) {
    return jsonError("Canlı dərs tapılmadı.", 404);
  }

  await connectToDatabase();
  const lesson = await LiveLesson.findOne({
    _id: lessonId,
    createdBy: admin._id,
  })
    .populate("groupId", "name")
    .lean();
  if (!lesson) return jsonError("Canlı dərs tapılmadı.", 404);

  const taskRows = await Task.find({ _id: { $in: lesson.taskIds } })
    .select("title prompt contentBlocks type options explanation +correctAnswer")
    .lean();
  const tasksById = new Map(
    taskRows.map((task) => [task._id.toString(), task]),
  );
  const tasks = lesson.taskIds.flatMap((taskId: mongoose.Types.ObjectId) => {
    const task = tasksById.get(taskId.toString());
    if (!task) return [];
    return [{
      _id: task._id.toString(),
      title: task.title,
      prompt: task.prompt,
      contentBlocks: sanitizeTaskContentBlocks(task.contentBlocks),
      type: task.type,
      options: task.options,
      correctAnswer: task.correctAnswer,
      explanation: task.explanation,
    }];
  });

  return Response.json({
    title: lesson.title,
    groupName:
      typeof lesson.groupId === "object" && "name" in lesson.groupId
        ? lesson.groupId.name
        : "Qrup",
    status: lesson.status,
    activeTaskIndex: lesson.activeTaskIndex,
    taskCount: lesson.taskIds.length,
    tasks,
  });
}
