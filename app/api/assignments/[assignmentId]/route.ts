import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { isCorrectAnswer, isValidAnswer } from "@/src/lib/quiz";
import { Assignment } from "@/src/models/Assignment";
import { Group } from "@/src/models/Group";
import { HomeworkSubmission } from "@/src/models/HomeworkSubmission";
import { Task, type TaskDocument } from "@/src/models/Task";
import { User } from "@/src/models/User";
import { sanitizeTaskContentBlocks } from "@/src/lib/task-content-html";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const admin = await requireUser("admin");
  const isAdmin = !(admin instanceof Response);
  const user = isAdmin ? admin : await requireUser("student");
  if (user instanceof Response) return user;

  const { assignmentId } = await params;
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    return jsonError("Ev tapşırığı tapılmadı.", 404);
  }

  await connectToDatabase();
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    publishedAt: { $ne: null },
  }).lean();
  if (!assignment) return jsonError("Ev tapşırığı tapılmadı.", 404);

  let assignmentGroup: { studentIds: mongoose.Types.ObjectId[] } | null = null;
  if (isAdmin) {
    if (assignment.createdBy.toString() !== user._id.toString()) {
      return jsonError("Ev tapşırığı tapılmadı.", 404);
    }
    assignmentGroup = await Group.findOne({
      _id: assignment.groupId,
      adminId: user._id,
      archivedAt: null,
    })
      .select("studentIds")
      .lean();
  } else {
    assignmentGroup = await Group.findOne({
      _id: assignment.groupId,
      studentIds: user._id,
      archivedAt: null,
    })
      .select("studentIds")
      .lean();
    if (!assignmentGroup)
      return jsonError("Bu ev tapşırığına giriş icazəniz yoxdur.", 403);
  }

  if (!assignmentGroup) return jsonError("Ev tapşırığı tapılmadı.", 404);
  const rosterIds = assignmentGroup.studentIds;
  const [tasks, submissions, roster, allSubmissions] = await Promise.all([
    Task.find({ _id: { $in: assignment.taskIds } })
      .select(
        isAdmin
          ? "title prompt contentBlocks type options explanation +correctAnswer"
          : "title prompt contentBlocks type options",
      )
      .lean(),
    HomeworkSubmission.find({
      assignmentId: assignment._id,
      ...(isAdmin ? {} : { studentId: user._id }),
    })
      .select("taskId answer isCorrect retryAllowed submittedAt studentId")
      .populate("studentId", "name email avatar")
      .lean(),
    User.find({
      _id: { $in: rosterIds },
      role: "student",
      isActive: true,
      approvalStatus: "approved",
    })
      .select("_id name")
      .lean(),
    rosterIds.length
      ? HomeworkSubmission.find({
          assignmentId: assignment._id,
          studentId: { $in: rosterIds },
          taskId: { $in: assignment.taskIds },
        })
          .select("studentId isCorrect")
          .lean()
      : Promise.resolve([]),
  ]);
  const tasksById = new Map<string, TaskDocument>(
    tasks.map((task: TaskDocument) => [task._id.toString(), task]),
  );
  const submissionsByTask = new Map<string, (typeof submissions)[number][]>();
  for (const submission of submissions) {
    const taskKey = submission.taskId.toString();
    const rows = submissionsByTask.get(taskKey) ?? [];
    rows.push(submission);
    submissionsByTask.set(taskKey, rows);
  }
  const now = Date.now();
  const deadlinePassed =
    assignment.dueAt !== undefined && assignment.dueAt.getTime() < now;
  const orderedTasks: TaskDocument[] = assignment.taskIds.flatMap(
    (taskId: mongoose.Types.ObjectId) => {
      const task = tasksById.get(taskId.toString());
      return task ? [task] : [];
    },
  );
  const leaderboardStats = new Map<
    string,
    { answered: number; correct: number; incorrect: number }
  >();
  for (const submission of allSubmissions) {
    const studentId = submission.studentId.toString();
    const stats = leaderboardStats.get(studentId) ?? {
      answered: 0,
      correct: 0,
      incorrect: 0,
    };
    stats.answered += 1;
    if (submission.isCorrect) stats.correct += 1;
    else stats.incorrect += 1;
    leaderboardStats.set(studentId, stats);
  }
  const leaderboardStatsRows = roster
    .map((student) => ({
      studentId: student._id.toString(),
      name: student.name,
      ...(leaderboardStats.get(student._id.toString()) ?? {
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
  const leaderboard = leaderboardStatsRows.map((student, index) => {
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

  return Response.json({
    assignment: {
      id: assignment._id.toString(),
      title: assignment.title,
      dueAt: assignment.dueAt?.toISOString() ?? null,
      deadlinePassed,
    },
    leaderboard,
    tasks: orderedTasks.map((task) => {
        const taskSubmissions = submissionsByTask.get(task._id.toString()) ?? [];
        return {
          ...task,
          contentBlocks: sanitizeTaskContentBlocks(task.contentBlocks),
          ...(isAdmin
            ? {
                correctAnswer: task.correctAnswer,
                explanation: task.explanation,
              }
            : {}),
          submissions: taskSubmissions
            .sort(
              (left, right) =>
                Number(right.isCorrect) - Number(left.isCorrect) ||
                left.submittedAt.getTime() - right.submittedAt.getTime(),
            )
            .map((submission) => ({
              answer: submission.answer,
              isCorrect: submission.isCorrect,
              retryAllowed: submission.retryAllowed,
              submittedAt: submission.submittedAt,
              studentId: submission.studentId,
            })),
          ...(isAdmin
            ? {}
            : {
                retryAllowed: taskSubmissions.some(
                  (submission) => submission.retryAllowed,
                ),
                submission: taskSubmissions[0]
                  ? taskSubmissions[0].retryAllowed
                    ? null
                    : {
                        answer: taskSubmissions[0].answer,
                        isCorrect: taskSubmissions[0].isCorrect,
                        submittedAt: taskSubmissions[0].submittedAt,
                      }
                  : null,
              }),
        };
      }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const student = await requireUser("student");
  if (student instanceof Response) return student;

  const { assignmentId } = await params;
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    return jsonError("Ev tapşırığı tapılmadı.", 404);
  }
  const body = await readJsonObject(request);
  if (
    !body ||
    typeof body.taskId !== "string" ||
    !mongoose.Types.ObjectId.isValid(body.taskId) ||
    body.answer === undefined
  ) {
    return jsonError("Tapşırıq və cavab tələb olunur.", 400);
  }
  const taskObjectId = new mongoose.Types.ObjectId(body.taskId);

  await connectToDatabase();
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    publishedAt: { $ne: null },
  });
  if (!assignment) return jsonError("Ev tapşırığı tapılmadı.", 404);

  const group = await Group.exists({
    _id: assignment.groupId,
    studentIds: student._id,
    archivedAt: null,
  });
  if (!group) return jsonError("Bu ev tapşırığına giriş icazəniz yoxdur.", 403);
  if (
    !assignment.taskIds.some((taskId: mongoose.Types.ObjectId) =>
      taskId.equals(taskObjectId),
    )
  ) {
    return jsonError("Bu tapşırıq ev tapşırığına aid deyil.", 404);
  }

  const existing = await HomeworkSubmission.findOne({
    assignmentId: assignment._id,
    taskId: taskObjectId,
    studentId: student._id,
  }).select("_id retryAllowed");
  if (existing && !existing.retryAllowed) {
    return jsonError("Bu suala cavab artıq göndərilib.", 409);
  }
  if (
    !existing &&
    assignment.dueAt &&
    assignment.dueAt.getTime() < Date.now()
  ) {
    return jsonError("Ev tapşırığının son vaxtı bitib.", 409);
  }

  const task = await Task.findById(taskObjectId).select("+correctAnswer");
  if (!task) return jsonError("Tapşırıq tapılmadı.", 404);
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

  const isCorrect = isCorrectAnswer(
    body.answer,
    task.correctAnswer,
    task.type,
  );
  if (existing?.retryAllowed) {
    const submission = await HomeworkSubmission.findOneAndUpdate(
      {
        _id: existing._id,
        retryAllowed: true,
      },
      {
        $set: {
          answer: body.answer,
          isCorrect,
          retryAllowed: false,
          submittedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!submission) {
      return jsonError("Bu suala cavab artıq göndərilib.", 409);
    }
    return Response.json({
      submission: {
        answer: submission.answer,
        isCorrect: submission.isCorrect,
        submittedAt: submission.submittedAt,
      },
    });
  }

  try {
    const submission = await HomeworkSubmission.create({
      assignmentId: assignment._id,
      taskId: task._id,
      studentId: student._id,
      answer: body.answer,
      isCorrect,
    });
    return Response.json(
      {
        submission: {
          answer: submission.answer,
          isCorrect: submission.isCorrect,
          submittedAt: submission.submittedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      return jsonError("Bu suala cavab artıq göndərilib.", 409);
    }
    throw error;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { assignmentId } = await params;
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    return jsonError("Ev tapşırığı tapılmadı.", 404);
  }
  const body = await readJsonObject(request);
  if (
    !body ||
    body.action !== "reset-incorrect" ||
    typeof body.taskId !== "string" ||
    !mongoose.Types.ObjectId.isValid(body.taskId) ||
    typeof body.studentId !== "string" ||
    !mongoose.Types.ObjectId.isValid(body.studentId)
  ) {
    return jsonError("Yenidən cəhd məlumatları yanlışdır.", 400);
  }

  await connectToDatabase();
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    createdBy: admin._id,
  }).select("taskIds");
  if (!assignment) return jsonError("Ev tapşırığı tapılmadı.", 404);

  const taskId = new mongoose.Types.ObjectId(body.taskId);
  if (
    !assignment.taskIds.some((assignmentTaskId: mongoose.Types.ObjectId) =>
      assignmentTaskId.equals(taskId),
    )
  ) {
    return jsonError("Tapşırıq bu ev tapşırığına aid deyil.", 404);
  }

  const filter = {
    assignmentId: assignment._id,
    taskId,
    studentId: new mongoose.Types.ObjectId(body.studentId),
  };
  const submission = await HomeworkSubmission.findOne(filter).select(
    "isCorrect retryAllowed",
  );
  if (!submission) return jsonError("Şagird cavabı tapılmadı.", 404);
  if (submission.isCorrect) {
    return jsonError("Yalnız səhv cavab üçün yenidən cəhd açmaq olar.", 409);
  }
  if (submission.retryAllowed) {
    return Response.json({ success: true });
  }

  const result = await HomeworkSubmission.updateOne(
    { _id: submission._id, isCorrect: false, retryAllowed: { $ne: true } },
    { $set: { retryAllowed: true } },
  );
  if (result.modifiedCount !== 1) {
    const current = await HomeworkSubmission.findById(submission._id).select(
      "retryAllowed",
    );
    if (!current?.retryAllowed) {
      return jsonError("Cavabı yenidən açmaq mümkün olmadı.", 409);
    }
  }

  return Response.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { assignmentId } = await params;
  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    return jsonError("Ev tapşırığı tapılmadı.", 404);
  }

  await connectToDatabase();
  const session = await mongoose.startSession();
  let deleted = false;
  try {
    await session.withTransaction(async () => {
      const assignment = await Assignment.findOne({
        _id: assignmentId,
        createdBy: admin._id,
      })
        .select("_id")
        .session(session);
      if (!assignment) return;

      await HomeworkSubmission.deleteMany({
        assignmentId: assignment._id,
      }).session(session);
      const result = await Assignment.deleteOne({
        _id: assignment._id,
        createdBy: admin._id,
      }).session(session);
      if (result.deletedCount !== 1) {
        throw new Error("Ev tapşırığını silmək mümkün olmadı.");
      }
      deleted = true;
    });
  } finally {
    await session.endSession();
  }

  if (!deleted) return jsonError("Ev tapşırığı tapılmadı.", 404);

  return Response.json({ success: true });
}
