import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  jsonError,
  isNonEmptyString,
  readJsonObject,
} from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { Group } from "@/src/models/Group";
import { LiveLesson } from "@/src/models/LiveLesson";
import { Quiz } from "@/src/models/Quiz";
import { Task } from "@/src/models/Task";
import { resolveQuizTaskIds } from "@/src/lib/quiz-selection";
import { randomInt } from "node:crypto";

interface QuizTaskSelection {
  quizId: string;
  count: number;
}

function isQuizTaskSelection(value: unknown): value is QuizTaskSelection {
  return (
    value !== null &&
    typeof value === "object" &&
    "quizId" in value &&
    typeof value.quizId === "string" &&
    mongoose.Types.ObjectId.isValid(value.quizId) &&
    "count" in value &&
    typeof value.count === "number" &&
    Number.isInteger(value.count) &&
    value.count >= 1 &&
    value.count <= 200
  );
}

function shuffle<T>(values: T[]) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

export async function GET() {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  await connectToDatabase();
  const lessons = await LiveLesson.find({ createdBy: admin._id })
    .populate("groupId", "name")
    .populate("taskIds", "title type")
    .sort({ createdAt: -1 })
    .lean();
  return Response.json({ lessons });
}

export async function POST(request: Request) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const body = await readJsonObject(request);
  const conflictingSelections =
    body?.quizSelections !== undefined &&
    (body.quizIds !== undefined || body.taskIds !== undefined);
  if (
    !body ||
    !isNonEmptyString(body.title) ||
    body.title.trim().length > 200 ||
    !isNonEmptyString(body.groupId) ||
    conflictingSelections ||
    !(
      (Array.isArray(body.quizIds) &&
        body.quizIds.length > 0 &&
        body.quizIds.every(
          (id) =>
            typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
        )) ||
      (Array.isArray(body.quizSelections) &&
        body.quizSelections.length > 0 &&
        body.quizSelections.length <= 100 &&
        body.quizSelections.every(isQuizTaskSelection) &&
        new Set(body.quizSelections.map((selection) => selection.quizId)).size ===
          body.quizSelections.length) ||
      (Array.isArray(body.taskIds) &&
        body.taskIds.length > 0 &&
        body.taskIds.every(
          (id) =>
            typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
        ))
    )
  ) {
    return jsonError("Canlı dərsin məlumatları yanlışdır.", 400);
  }

  const durationSeconds = body.durationSeconds ?? 120;
  if (
    typeof durationSeconds !== "number" ||
    !Number.isInteger(durationSeconds) ||
    durationSeconds < 15 ||
    durationSeconds > 3600
  ) {
    return jsonError("Müddət 15-3600 saniyə aralığında olmalıdır.", 400);
  }

  await connectToDatabase();
  let taskIds: string[];
  let lessonQuizIds: string[];
  if (Array.isArray(body.quizSelections)) {
    const selections = body.quizSelections as QuizTaskSelection[];
    const quizzes = await Quiz.find({
      _id: { $in: selections.map((selection) => selection.quizId) },
      createdBy: admin._id,
    })
      .select("taskIds")
      .lean();
    if (quizzes.length !== selections.length) {
      return jsonError("Quiz tapılmadı.", 404);
    }

    const availableTaskIds: string[] = [
      ...new Set(
        quizzes.flatMap((quiz) =>
          quiz.taskIds.map((taskId: unknown) => String(taskId)),
        ),
      ),
    ];
    const availableTasks = await Task.find({
      _id: { $in: availableTaskIds },
      createdBy: admin._id,
      $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
    }).select("_id");
    const availableTaskIdSet = new Set(
      availableTasks.map((task) => task._id.toString()),
    );
    const quizById = new Map(
      quizzes.map((quiz) => [quiz._id.toString(), quiz]),
    );
    const selectedTaskIds = new Set<string>();
    taskIds = [];

    for (const selection of selections) {
      const quiz = quizById.get(selection.quizId);
      const quizTaskIds: string[] =
        quiz?.taskIds.map((taskId: unknown) => String(taskId)) ?? [];
      const candidates = [...new Set(quizTaskIds)].filter(
        (taskId) =>
          availableTaskIdSet.has(taskId) && !selectedTaskIds.has(taskId),
      );
      if (candidates.length < selection.count) {
        return jsonError(
          "Seçilmiş quizlərdə tələb olunan sayda fərqli aktiv tapşırıq yoxdur.",
          400,
        );
      }
      const chosenTaskIds = shuffle(candidates).slice(0, selection.count);
      for (const taskId of chosenTaskIds) {
        selectedTaskIds.add(taskId);
        taskIds.push(taskId);
      }
    }
    lessonQuizIds = selections.map((selection) => selection.quizId);
  } else if (body.quizIds !== undefined) {
    const resolvedTaskIds = await resolveQuizTaskIds(body.quizIds, admin._id);
    if (!resolvedTaskIds) {
      return jsonError("Quiz tapılmadı və ya boşdur.", 404);
    }
    taskIds = resolvedTaskIds;
    lessonQuizIds = body.quizIds as string[];
  } else {
    taskIds = [...new Set(body.taskIds as string[])];
    lessonQuizIds = [];
  }

  const [group, tasks] = await Promise.all([
    Group.findOne({
      _id: body.groupId,
      adminId: admin._id,
      archivedAt: null,
    }).select("_id"),
    Task.find({ _id: { $in: taskIds }, createdBy: admin._id }).select("_id"),
  ]);
  if (!group) return jsonError("Qrup tapılmadı.", 404);
  if (tasks.length !== new Set(taskIds).size) {
    return jsonError("Quizdəki tapşırıqlardan biri tapılmadı.", 404);
  }

  const lesson = await LiveLesson.create({
    title: body.title.trim(),
    groupId: group._id,
    quizIds: lessonQuizIds.map((id) => new mongoose.Types.ObjectId(id)),
    taskIds: taskIds.map((taskId) => new mongoose.Types.ObjectId(taskId)),
    durationSeconds,
    createdBy: admin._id,
  });
  return Response.json({ lesson }, { status: 201 });
}
