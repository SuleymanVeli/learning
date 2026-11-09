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
import { User } from "@/src/models/User";

export async function GET(request: Request) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  await connectToDatabase();
  const requestedTeacherId = new URL(request.url).searchParams.get(
    "videoTeacherId",
  );
  if (
    admin.role === "admin" &&
    requestedTeacherId !== null &&
    !/^[\da-f]{24}$/i.test(requestedTeacherId)
  ) {
    return jsonError("Müəllim seçimi yanlışdır.", 400);
  }
  const videoTeacher =
    admin.role === "admin" && requestedTeacherId
      ? await User.findOne({
          _id: requestedTeacherId,
          role: { $in: ["admin", "teacher"] },
          isActive: true,
        }).select("_id")
      : admin;
  if (!videoTeacher) return jsonError("Müəllim tapılmadı.", 404);
  const [tasks, quizzes] = await Promise.all([
    Task.find({
      $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
    })
      .select("+correctAnswer +explanation")
      .sort({ createdAt: -1 })
      .lean(),
    Quiz.find({}).select("title taskIds").lean(),
  ]);
  const taskVideos = await TeacherTaskVideo.find({
    ...(admin.role === "admin" ? {} : { teacherId: admin._id }),
    taskId: { $in: tasks.map((task) => task._id) },
  })
    .select("teacherId taskId videoId")
    .populate("teacherId", "name")
    .lean();
  const videosByTaskId = new Map<
    string,
    { teacherId: string; teacherName: string; videoId: string }[]
  >();
  for (const video of taskVideos) {
    const teacher = video.teacherId;
    const teacherId =
      teacher && typeof teacher === "object" && "_id" in teacher
        ? String(teacher._id)
        : String(video.teacherId);
    const teacherName =
      teacher && typeof teacher === "object" && "name" in teacher
        ? String(teacher.name)
        : "";
    const rows = videosByTaskId.get(video.taskId.toString()) ?? [];
    rows.push({ teacherId, teacherName, videoId: video.videoId });
    videosByTaskId.set(video.taskId.toString(), rows);
  }
  const memberships = new Map<string, { id: string; title: string }[]>();
  for (const quiz of quizzes) {
    for (const taskId of quiz.taskIds) {
      const key = taskId.toString();
      const items = memberships.get(key) ?? [];
      items.push({ id: quiz._id.toString(), title: quiz.title });
      memberships.set(key, items);
    }
  }
  return Response.json({
    tasks: tasks.map((task) => ({
      ...task,
      videoExplanationId:
        videosByTaskId
          .get(task._id.toString())
          ?.find((video) => video.teacherId === videoTeacher._id.toString())
          ?.videoId ??
        (task.createdBy.equals(videoTeacher._id)
          ? task.videoExplanationId
          : undefined) ??
        "",
      ...(admin.role === "admin"
        ? {
            videoExplanations: [
              ...(videosByTaskId.get(task._id.toString()) ?? []),
              ...(task.videoExplanationId &&
              !videosByTaskId
                .get(task._id.toString())
                ?.some(
                  (video) =>
                    video.teacherId === task.createdBy.toString(),
                )
                ? [
                    {
                      teacherId: task.createdBy.toString(),
                      teacherName: "",
                      videoId: task.videoExplanationId,
                    },
                  ]
                : []),
            ],
          }
        : {}),
      quizzes: memberships.get(task._id.toString()) ?? [],
    })),
  });
}

export async function POST(request: Request) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const body = await readJsonObject(request);
  if (!body) return jsonError("Tapşırığın məlumatları yanlışdır.", 400);
  const parsed = parseTask(body);
  if (!parsed.value) {
    return jsonError(parsed.error ?? "Tapşırığın məlumatları yanlışdır.", 400);
  }
  const taskData = parsed.value;
  if (!taskData.quizId) {
    return jsonError("Tapşırığın əlavə ediləcəyi quiz-i seçin.", 400);
  }

  await connectToDatabase();
  const videoUpdates = await parseTeacherVideoUpdates(admin, body);
  if (videoUpdates instanceof Response) return videoUpdates;
  const quiz = await Quiz.findById(taskData.quizId);
  if (!quiz) return jsonError("Seçilən quiz tapılmadı.", 404);

  const task = await Task.create({
    title: taskData.title,
    prompt: taskData.prompt,
    contentBlocks: taskData.contentBlocks,
    type: taskData.type,
    options: taskData.options,
    correctAnswer: taskData.correctAnswer,
    explanation: taskData.explanation,
    difficulty: taskData.difficulty,
    createdBy: admin._id,
  });
  await syncTeacherTaskVideos(task._id, videoUpdates);
  quiz.taskIds.push(task._id);
  await quiz.save();

  return Response.json(
    { task, quizId: quiz._id.toString() },
    { status: 201 },
  );
}
