import { connectToDatabase } from "@/src/lib/mongodb";
import { requireUser } from "@/src/lib/auth";
import mongoose from "mongoose";
import { Assignment } from "@/src/models/Assignment";
import { Group } from "@/src/models/Group";
import { LiveLesson } from "@/src/models/LiveLesson";
import { Submission } from "@/src/models/Submission";
import { Task } from "@/src/models/Task";
import { sanitizeTaskContentBlocks } from "@/src/lib/task-content-html";

export async function GET() {
  const student = await requireUser("student");
  if (student instanceof Response) return student;

  await connectToDatabase();
  const groups = await Group.find({
    studentIds: student._id,
    archivedAt: null,
  })
    .select("_id name")
    .lean();
  const groupIds = groups.map((group) => group._id);

  const [assignments, lesson] = await Promise.all([
    Assignment.find({ groupId: { $in: groupIds }, publishedAt: { $ne: null } })
      .select("_id title dueAt groupId")
      .populate("groupId", "name")
      .sort({ createdAt: -1 })
      .lean(),
    LiveLesson.findOne({
      groupId: { $in: groupIds },
      status: { $in: ["draft", "live"] },
    })
      .sort({ status: -1, startedAt: -1, createdAt: -1 })
      .lean(),
  ]);

  let live = null;
  if (lesson) {
    const hasStarted =
      lesson.status === "live" && Boolean(lesson.startedAt && lesson.endsAt);
    const taskId = hasStarted ? lesson.taskIds[lesson.activeTaskIndex] : null;
    const [task, submission] = await Promise.all([
      taskId
        ? Task.findById(taskId)
            .select("title prompt contentBlocks type options")
            .lean()
        : null,
      taskId
        ? Submission.findOne({
            lessonId: lesson._id,
            taskId,
            studentId: student._id,
          }).select("_id")
        : null,
    ]);
    const reopened = lesson.reopenedStudentIds.some((id: mongoose.Types.ObjectId) =>
      id.equals(student._id),
    );
    const secondsRemaining = lesson.endsAt
      ? Math.max(0, Math.ceil((lesson.endsAt.getTime() - Date.now()) / 1000))
      : 0;

    live = {
      id: lesson._id.toString(),
      title: lesson.title,
      groupName: groups.find((group) => group._id.equals(lesson.groupId))?.name,
      taskIndex: lesson.activeTaskIndex,
      taskCount: lesson.taskIds.length,
      status: lesson.status,
      hasStarted,
      endsAt: lesson.endsAt?.toISOString() ?? null,
      secondsRemaining,
      reopened,
      task: task
        ? {
            ...task,
            contentBlocks: sanitizeTaskContentBlocks(task.contentBlocks),
          }
        : null,
      hasSubmitted: Boolean(submission),
      canAnswer:
        hasStarted &&
        Boolean(task) &&
        (reopened || (secondsRemaining > 0 && !submission)),
    };
  }

  return Response.json({
    groups,
    assignments,
    live,
  });
}
