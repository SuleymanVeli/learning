import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
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
      ? { createdBy: user._id }
      : {
          groupId: { $in: user.groupIds },
          status: { $in: ["draft", "live", "ended"] },
        }),
  }).lean();
  if (!lesson) return jsonError("Canlı dərs tapılmadı.", 404);

  const requestedTaskIndex = Number(
    new URL(request.url).searchParams.get("taskIndex"),
  );
  const taskIndex =
    isAdmin && Number.isInteger(requestedTaskIndex) && requestedTaskIndex >= 0
      ? requestedTaskIndex
      : lesson.activeTaskIndex;
  const taskId = lesson.taskIds[taskIndex];
  if (!taskId) return Response.json({ submissions: [], revealed: false });

  const isClosed =
    lesson.status === "ended" ||
    (lesson.status === "live" &&
      (lesson.activeTaskIndex !== taskIndex ||
        !lesson.endsAt ||
        lesson.endsAt.getTime() <= Date.now()));
  const ownSubmission = isAdmin
    ? true
    : await Submission.exists({
        lessonId: lesson._id,
        taskId,
        studentId: user._id,
      });
  if (!ownSubmission) {
    return Response.json({ submissions: [], revealed: isClosed });
  }

  const submissions = await Submission.find({
    lessonId: lesson._id,
    taskId,
  })
    .select("+isCorrect")
    .populate("studentId", "name email avatar")
    .lean();
  submissions.sort((left, right) => {
    if (isClosed) {
      const correctness =
        Number(right.isCorrect) - Number(left.isCorrect);
      if (correctness) return correctness;
    }
    return left.submittedAt.getTime() - right.submittedAt.getTime();
  });
  return Response.json({
    submissions: submissions.map((submission) => ({
      ...submission,
      isCorrect: isClosed ? submission.isCorrect : undefined,
    })),
    revealed: isClosed,
  });
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
      { $set: submissionData },
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
