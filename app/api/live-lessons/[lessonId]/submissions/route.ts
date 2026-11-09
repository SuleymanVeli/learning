import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser, teacherGroupScope } from "@/src/lib/auth";
import { Group } from "@/src/models/Group";
import { publishLessonSignal } from "@/src/lib/firebase-admin";
import { isCorrectAnswer, isValidAnswer } from "@/src/lib/quiz";
import { LiveLesson } from "@/src/models/LiveLesson";
import { Submission } from "@/src/models/Submission";
import { Task } from "@/src/models/Task";

export async function GET(
  request: Request,
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
  const lesson = await LiveLesson.findOne({
    _id: lessonId,
    ...(isAdmin
      ? {}
      : {
          groupId: { $in: user.groupIds },
          status: { $in: ["draft", "live", "ended"] },
        }),
  }).lean();
  if (!lesson) return jsonError("Canlı dərs tapılmadı.", 404);
  if (
    isAdmin &&
    user.role !== "admin" &&
    !(await Group.exists({
      _id: lesson.groupId,
      ...teacherGroupScope(user),
    }))
  ) {
    return jsonError("Canlı dərs tapılmadı.", 404);
  }

  const requestedTaskIndex = Number(
    new URL(request.url).searchParams.get("taskIndex"),
  );
  const taskIndex =
    isAdmin && Number.isInteger(requestedTaskIndex) && requestedTaskIndex >= 0
      ? requestedTaskIndex
      : lesson.activeTaskIndex;
  const taskId = lesson.taskIds[taskIndex];
  if (!taskId) {
    return Response.json({
      submissions: [],
      revealed: false,
      reopened: false,
    });
  }

  const isClosed =
    lesson.status === "ended" ||
    (lesson.status === "live" &&
      (lesson.activeTaskIndex !== taskIndex ||
        !lesson.endsAt ||
        lesson.endsAt.getTime() <= Date.now()));
  const reopened =
    !isAdmin &&
    lesson.reopenedStudentIds.some((studentId: mongoose.Types.ObjectId) =>
      studentId.equals(user._id),
    );
  const ownSubmission = isAdmin
    ? true
    : await Submission.exists({
        lessonId: lesson._id,
        taskId,
        studentId: user._id,
      });
  if (!ownSubmission) {
    return Response.json({
      submissions: [],
      revealed: isClosed,
      reopened,
    });
  }

  const submissions = await Submission.find({
    lessonId: lesson._id,
    taskId,
  })
    .select("+isCorrect +isCorrectOverride")
    .populate("studentId", "name email avatar")
    .lean();
  submissions.sort((left, right) => {
    if (isClosed) {
      const correctness =
        Number(right.isCorrectOverride ?? right.isCorrect) -
        Number(left.isCorrectOverride ?? left.isCorrect);
      if (correctness) return correctness;
    }
    return left.submittedAt.getTime() - right.submittedAt.getTime();
  });
  return Response.json({
    submissions: submissions.map((submission) => ({
      ...submission,
      isCorrect: isClosed
        ? (submission.isCorrectOverride ?? submission.isCorrect)
        : undefined,
      ...(isAdmin
        ? {
            isCorrectOverride: submission.isCorrectOverride === true,
            reopened:
              submission.studentId !== null &&
              typeof submission.studentId === "object" &&
              lesson.reopenedStudentIds.some((studentId: mongoose.Types.ObjectId) =>
                studentId.equals(submission.studentId._id),
              ),
          }
        : {}),
    })),
    revealed: isClosed,
    reopened,
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
  if (
    !body ||
    typeof body.submissionId !== "string" ||
    !mongoose.Types.ObjectId.isValid(body.submissionId) ||
    (body.action !== "mark-correct" && body.action !== "clear-override")
  ) {
    return jsonError("Cavabın qiymətləndirmə məlumatları yanlışdır.", 400);
  }

  await connectToDatabase();
  const lesson = await LiveLesson.findOne({
    _id: lessonId,
  }).select("_id groupId");
  if (!lesson) return jsonError("Canlı dərs tapılmadı.", 404);
  if (
    admin.role !== "admin" &&
    !(await Group.exists({
      _id: lesson.groupId,
      ...teacherGroupScope(admin),
    }))
  ) {
    return jsonError("Canlı dərs tapılmadı.", 404);
  }

  const submissionId = new mongoose.Types.ObjectId(body.submissionId);
  const submission = await Submission.findOne({
    _id: submissionId,
    lessonId: lesson._id,
  }).select("_id");
  if (!submission) return jsonError("Şagird cavabı tapılmadı.", 404);

  if (body.action === "mark-correct") {
    await Submission.updateOne(
      { _id: submission._id },
      { $set: { isCorrectOverride: true } },
    );
  } else {
    await Submission.updateOne(
      { _id: submission._id },
      { $unset: { isCorrectOverride: 1 } },
    );
  }

  const realtime = await publishLessonSignal(lesson._id.toString());
  return Response.json({ success: true, realtimeSynced: realtime.synced });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const student = await requireUser("student");
  if (student instanceof Response) return student;

  const { lessonId } = await params;
  if (!mongoose.Types.ObjectId.isValid(lessonId)) {
    return jsonError("Canlı dərs tapılmadı.", 404);
  }
  const body = await readJsonObject(request);
  if (!body || body.answer === undefined) {
    return jsonError("Cavab tələb olunur.", 400);
  }

  await connectToDatabase();
  const lesson = await LiveLesson.findOne({
    _id: lessonId,
    groupId: { $in: student.groupIds },
    status: "live",
  });
  if (!lesson) return jsonError("Aktiv canlı dərs tapılmadı.", 404);

  const taskId = lesson.taskIds[lesson.activeTaskIndex];
  if (!taskId) return jsonError("Dərsdə aktiv tapşırıq yoxdur.", 409);
  const reopened = lesson.reopenedStudentIds.some((id: mongoose.Types.ObjectId) =>
    id.equals(student._id),
  );
  if (
    (!lesson.endsAt || lesson.endsAt.getTime() <= Date.now()) &&
    !reopened
  ) {
    return jsonError("Cavablandırma vaxtı bitib.", 409);
  }

  const [task, previousSubmission] = await Promise.all([
    Task.findById(taskId).select("+correctAnswer"),
    Submission.findOne({
      lessonId: lesson._id,
      taskId,
      studentId: student._id,
    }).select("_id"),
  ]);
  if (!task) return jsonError("Tapşırıq tapılmadı.", 404);
  if (
    previousSubmission &&
    !reopened
  ) {
    return jsonError("Bu tapşırığa cavab artıq göndərilib.", 409);
  }
  if (
    !isValidAnswer(
      body.answer,
      task.type,
      new Set(
        task.options.map((option: { id: string }) => option.id),
      ),
    )
  ) {
    return jsonError("Cavab formatı tapşırıq üçün uyğun deyil.", 400);
  }

  if (reopened) {
    const claimed = await LiveLesson.updateOne(
      {
        _id: lesson._id,
        status: "live",
        activeTaskIndex: lesson.activeTaskIndex,
        endsAt: lesson.endsAt,
        reopenedStudentIds: student._id,
      },
      { $pull: { reopenedStudentIds: student._id } },
    );
    if (claimed.modifiedCount !== 1) {
      return jsonError("Cavab göndərmək üçün icazə artıq istifadə olunub.", 409);
    }
  } else {
    const stillAcceptingAnswers = await LiveLesson.exists({
      _id: lesson._id,
      status: "live",
      activeTaskIndex: lesson.activeTaskIndex,
      endsAt: { $gt: new Date() },
    });
    if (!stillAcceptingAnswers) {
      return jsonError("Tapşırıq və ya cavablandırma vaxtı dəyişib.", 409);
    }
  }

  const submissionData = {
    answer: body.answer,
    isCorrect: isCorrectAnswer(body.answer, task.correctAnswer, task.type),
    submittedAt: new Date(),
  };

  if (previousSubmission) {
    await Submission.updateOne(
      { _id: previousSubmission._id },
      {
        $set: submissionData,
        $unset: { isCorrectOverride: 1 },
      },
    );
  } else {
    try {
      await Submission.create({
        lessonId: lesson._id,
        taskId,
        studentId: student._id,
        ...submissionData,
      });
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000
      ) {
        return jsonError("Bu tapşırığa cavab artıq göndərilib.", 409);
      }
      throw error;
    }
  }

  const realtime = await publishLessonSignal(lesson._id.toString());
  return Response.json({
    success: true,
    message: "Cavabınız qeydə alındı.",
    realtimeSynced: realtime.synced,
  });
}
