import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { isNonEmptyString, jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { publishLessonSignal } from "@/src/lib/firebase-admin";
import { Group } from "@/src/models/Group";
import { LiveLesson } from "@/src/models/LiveLesson";
import { User } from "@/src/models/User";
import { Task, type TaskDocument } from "@/src/models/Task";
import { Submission } from "@/src/models/Submission";
import { sanitizeTaskContentBlocks } from "@/src/lib/task-content-html";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const admin = await requireUser("admin");
  const isAdmin = !(admin instanceof Response);
  const user = isAdmin ? admin : await requireUser("student");
  if (user instanceof Response) return user;

  const { lessonId } = await params;
  if (!mongoose.Types.ObjectId.isValid(lessonId)) {
    return jsonError("Canlı dərs tapılmadı.", 404);
  }
  await connectToDatabase();
  const lesson = await LiveLesson.findById(lessonId)
    .populate("groupId", "name")
    .lean();
  if (!lesson) return jsonError("Canlı dərs tapılmadı.", 404);
  if (isAdmin) {
    if (lesson.createdBy.toString() !== user._id.toString()) {
      return jsonError("Canlı dərs tapılmadı.", 404);
    }
  } else {
    if (
      (lesson.status !== "draft" &&
        lesson.status !== "live" &&
        lesson.status !== "ended") ||
      !user.groupIds.some((groupId) => groupId.equals(lesson.groupId._id))
    ) {
      return jsonError("Canlı dərs tapılmadı.", 404);
    }
  }

  let leaderboard: {
    studentId: string;
    name: string;
    rank: number;
    answered: number;
    correct: number;
    incorrect: number;
    isCurrentStudent: boolean;
  }[] = [];
  const group = await Group.findOne({
    _id: lesson.groupId._id,
    ...(isAdmin ? { adminId: user._id } : { studentIds: user._id }),
    archivedAt: null,
  })
    .select("studentIds")
    .lean();
  if (!group) return jsonError("Canlı dərs tapılmadı.", 404);

  const closedTaskIds =
    lesson.status === "ended"
      ? lesson.taskIds
      : lesson.taskIds.slice(0, lesson.activeTaskIndex);
  const [students, submissions] = await Promise.all([
    User.find({
      _id: { $in: group.studentIds },
      role: "student",
      isActive: true,
      approvalStatus: "approved",
    })
      .select("_id name")
      .lean(),
    closedTaskIds.length
      ? Submission.find({
          lessonId: lesson._id,
          taskId: { $in: closedTaskIds },
          studentId: { $in: group.studentIds },
        })
          .select("studentId +isCorrect")
          .lean()
      : Promise.resolve([]),
  ]);
  const statsByStudent = new Map<
    string,
    { answered: number; correct: number; incorrect: number }
  >();
  for (const submission of submissions) {
    const studentId = submission.studentId.toString();
    const stats = statsByStudent.get(studentId) ?? {
      answered: 0,
      correct: 0,
      incorrect: 0,
    };
    stats.answered += 1;
    if (submission.isCorrect) stats.correct += 1;
    else stats.incorrect += 1;
    statsByStudent.set(studentId, stats);
  }
  const rankedStudents = students
    .map((student) => ({
      studentId: student._id.toString(),
      name: student.name,
      ...(statsByStudent.get(student._id.toString()) ?? {
        answered: 0,
        correct: 0,
        incorrect: 0,
      }),
      isCurrentStudent: !isAdmin && student._id.equals(user._id),
    }))
    .sort(
      (left, right) =>
        right.correct - left.correct ||
        left.incorrect - right.incorrect ||
        left.name.localeCompare(right.name, "az"),
    );
  let previousScore: { correct: number; incorrect: number } | null = null;
  let currentRank = 0;
  leaderboard = rankedStudents.map((student, index) => {
    if (
      !previousScore ||
      student.correct !== previousScore.correct ||
      student.incorrect !== previousScore.incorrect
    ) {
      currentRank = index + 1;
    }
    previousScore = {
      correct: student.correct,
      incorrect: student.incorrect,
    };
    return { ...student, rank: currentRank };
  });

  const tasks = await Task.find({ _id: { $in: lesson.taskIds } })
    .select("title prompt contentBlocks type options")
    .lean();
  const taskById = new Map(
    tasks.map((task: TaskDocument) => [task._id.toString(), task]),
  );
  const hasStarted =
    lesson.status !== "draft" && Boolean(lesson.startedAt && lesson.endsAt);
  const tabs = lesson.taskIds.flatMap(
    (taskId: mongoose.Types.ObjectId, index: number) => {
    const task = taskById.get(taskId.toString());
    if (!task) return [];
    const title = {
      _id: task._id.toString(),
      title: task.title,
    };
    const shared =
      isAdmin || (hasStarted && index === lesson.activeTaskIndex)
        ? {
            ...title,
            prompt: task.prompt,
            contentBlocks: sanitizeTaskContentBlocks(task.contentBlocks),
            type: task.type,
            options: task.options,
          }
        : title;
    return [shared];
    },
  );

  return Response.json({
    lesson: {
      id: lesson._id.toString(),
      title: lesson.title,
      groupName:
        typeof lesson.groupId === "object" && "name" in lesson.groupId
          ? lesson.groupId.name
          : "Qrup",
      quizIds:
        lesson.quizIds?.map((id: mongoose.Types.ObjectId) => id.toString()) ?? [],
      status: lesson.status,
      hasStarted,
      activeTaskIndex: lesson.activeTaskIndex,
      durationSeconds: lesson.durationSeconds,
      startedAt: lesson.startedAt?.toISOString() ?? null,
      endsAt: lesson.endsAt?.toISOString() ?? null,
      tabs,
      ...(!isAdmin ? { leaderboard } : {}),
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { lessonId } = await params;
  if (!mongoose.Types.ObjectId.isValid(lessonId)) {
    return jsonError("Canlı dərs tapılmadı.", 404);
  }

  const body = await readJsonObject(request);
  if (!body || typeof body.action !== "string") {
    return jsonError("Əməliyyat göstərilməyib.", 400);
  }

  await connectToDatabase();
  const lesson = await LiveLesson.findOne({
    _id: lessonId,
    createdBy: admin._id,
  });
  if (!lesson) return jsonError("Canlı dərs tapılmadı.", 404);

  if (body.action === "start") {
    if (lesson.status === "ended") return jsonError("Bitmiş dərsi başlatmaq olmur.", 409);
    if (typeof body.taskIndex === "number") {
      if (
        !Number.isInteger(body.taskIndex) ||
        body.taskIndex < 0 ||
        body.taskIndex >= lesson.taskIds.length
      ) {
        return jsonError("Dərs tabı tapılmadı.", 400);
      }
      lesson.activeTaskIndex = body.taskIndex;
    }
    if (typeof body.durationSeconds === "number") {
      if (
        !Number.isInteger(body.durationSeconds) ||
        body.durationSeconds < 15 ||
        body.durationSeconds > 3600
      ) {
        return jsonError("Müddət 15-3600 saniyə aralığında olmalıdır.", 400);
      }
      lesson.durationSeconds = body.durationSeconds;
    }
    const now = new Date();
    lesson.status = "live";
    lesson.startedAt = now;
    lesson.endsAt = new Date(
      now.getTime() + lesson.durationSeconds * 1000,
    );
    lesson.reopenedStudentIds = [];
  } else if (body.action === "end") {
    if (lesson.status !== "live") {
      return jsonError("Yalnız aktiv dərsi bitirmək olar.", 409);
    }
    lesson.status = "ended";
    lesson.endsAt = new Date();
  } else if (body.action === "next-task") {
    if (
      lesson.status !== "live" ||
      lesson.activeTaskIndex >= lesson.taskIds.length - 1
    ) {
      return jsonError("Növbəti tapşırıq mövcud deyil.", 409);
    }
    lesson.activeTaskIndex += 1;
    lesson.startedAt = new Date();
    lesson.endsAt = new Date(
      lesson.startedAt.getTime() + lesson.durationSeconds * 1000,
    );
    lesson.reopenedStudentIds = [];
  } else if (body.action === "stop-task") {
    if (lesson.status !== "live") {
      return jsonError("Yalnız aktiv dərsdə cari tabı dayandırmaq olar.", 409);
    }
    lesson.endsAt = new Date();
  } else if (body.action === "edit") {
    if (lesson.status === "live") {
      return jsonError("Aktiv dərsin məlumatlarını dəyişmək olmur.", 409);
    }
    if (
      !isNonEmptyString(body.title) ||
      body.title.trim().length > 200 ||
      typeof body.groupId !== "string" ||
      !mongoose.Types.ObjectId.isValid(body.groupId) ||
      !Array.isArray(body.quizIds) ||
      !body.quizIds.length ||
      !body.quizIds.every(
        (id) => typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
      )
    ) {
      return jsonError("Canlı dərsin məlumatları yanlışdır.", 400);
    }
    const { resolveQuizTaskIds } = await import("@/src/lib/quiz-selection");
    const taskIds = await resolveQuizTaskIds(body.quizIds, admin._id);
    if (!taskIds?.length) return jsonError("Quiz tapılmadı və ya boşdur.", 404);
    const group = await Group.findOne({
      _id: body.groupId,
      adminId: admin._id,
      archivedAt: null,
    }).select("_id");
    if (!group) return jsonError("Qrup tapılmadı.", 404);
    lesson.title = body.title.trim();
    lesson.groupId = group._id;
    lesson.quizIds = body.quizIds.map(
      (quizId: string) => new mongoose.Types.ObjectId(quizId),
    );
    lesson.taskIds = taskIds.map(
      (taskId) => new mongoose.Types.ObjectId(taskId),
    );
    lesson.activeTaskIndex = 0;
  } else if (
    body.action === "reopen-student" &&
    typeof body.studentId === "string" &&
    mongoose.Types.ObjectId.isValid(body.studentId)
  ) {
    if (lesson.status !== "live") {
      return jsonError("Yalnız aktiv dərsdə cavabı yenidən açmaq olar.", 409);
    }
    const [group, student] = await Promise.all([
      Group.findOne({
        _id: lesson.groupId,
        adminId: admin._id,
        archivedAt: null,
        studentIds: body.studentId,
      }).select("_id"),
      User.findOne({
        _id: body.studentId,
        role: "student",
      }).select("_id"),
    ]);
    if (!group || !student) {
      return jsonError("Şagird bu qrupa daxil deyil.", 404);
    }

    lesson.reopenedStudentIds.addToSet(student._id);
  } else {
    return jsonError("Dəstəklənməyən əməliyyatdır.", 400);
  }

  await lesson.save();
  const realtime = await publishLessonSignal(lesson._id.toString());
  return Response.json({ lesson, realtimeSynced: realtime.synced });
}

export async function DELETE(
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
  });
  if (!lesson) return jsonError("Canlı dərs tapılmadı.", 404);
  if (lesson.status === "live") {
    return jsonError("Aktiv dərsi silmək olmaz. Əvvəlcə bitirin.", 409);
  }
  const hasSubmissions = await Submission.exists({ lessonId: lesson._id });
  if (hasSubmissions) {
    return jsonError(
      "Cavabları olan dərsi silmək olmaz; nəticələrin tarixçəsi qorunur.",
      409,
    );
  }
  await lesson.deleteOne();
  return Response.json({ success: true });
}
