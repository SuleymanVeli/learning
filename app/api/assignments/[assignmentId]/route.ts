import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { isCorrectAnswer, isValidAnswer } from "@/src/lib/quiz";
import { Assignment } from "@/src/models/Assignment";
import { Group } from "@/src/models/Group";
import { HomeworkSubmission } from "@/src/models/HomeworkSubmission";
import { Task, type TaskDocument } from "@/src/models/Task";
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

  if (isAdmin) {
    if (assignment.createdBy.toString() !== user._id.toString()) {
      return jsonError("Ev tapşırığı tapılmadı.", 404);
    }
  } else {
    const group = await Group.exists({
      _id: assignment.groupId,
      studentIds: user._id,
      archivedAt: null,
    });
    if (!group) return jsonError("Bu ev tapşırığına giriş icazəniz yoxdur.", 403);
  }

  const [tasks, submissions] = await Promise.all([
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
      .select("taskId answer isCorrect submittedAt studentId")
      .populate("studentId", "name email avatar")
      .lean(),
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

  return Response.json({
    assignment: {
      id: assignment._id.toString(),
      title: assignment.title,
      dueAt: assignment.dueAt?.toISOString() ?? null,
      deadlinePassed,
    },
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
              submittedAt: submission.submittedAt,
              studentId: submission.studentId,
            })),
          ...(isAdmin
            ? {}
            : {
                submission: taskSubmissions[0]
                  ? {
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
  if (assignment.dueAt && assignment.dueAt.getTime() < Date.now()) {
    return jsonError("Ev tapşırığının son vaxtı bitib.", 409);
  }
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
  }).select("_id");
  if (existing) {
    return jsonError("Bu suala cavab artıq göndərilib.", 409);
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
