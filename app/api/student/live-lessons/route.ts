import { connectToDatabase } from "@/src/lib/mongodb";
import { requireUser } from "@/src/lib/auth";
import { Group } from "@/src/models/Group";
import { LiveLesson } from "@/src/models/LiveLesson";

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
  const lessons = groupIds.length
    ? await LiveLesson.find({
        groupId: { $in: groupIds },
        status: { $in: ["draft", "live"] },
      })
        .select("_id title groupId activeTaskIndex taskIds status startedAt endsAt")
        .sort({ createdAt: -1 })
        .lean()
    : [];
  const groupNames = new Map(
    groups.map((group) => [group._id.toString(), group.name]),
  );

  return Response.json({
    groups,
    lessons: lessons.map((lesson) => ({
      id: lesson._id.toString(),
      title: lesson.title,
      groupId: lesson.groupId.toString(),
      groupName: groupNames.get(lesson.groupId.toString()) ?? "Qrup",
      taskIndex: lesson.activeTaskIndex,
      taskCount: lesson.taskIds.length,
      hasStarted:
        lesson.status === "live" && Boolean(lesson.startedAt && lesson.endsAt),
    })),
  });
}
