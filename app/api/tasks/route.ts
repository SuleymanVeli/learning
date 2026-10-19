import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { parseTask } from "@/src/lib/task-validation";
import { Quiz } from "@/src/models/Quiz";
import { Task } from "@/src/models/Task";

export async function GET() {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  await connectToDatabase();
  const [tasks, quizzes] = await Promise.all([
    Task.find({
      createdBy: admin._id,
      $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
    })
      .select("+correctAnswer +explanation")
      .sort({ createdAt: -1 })
      .lean(),
    Quiz.find({ createdBy: admin._id }).select("title taskIds").lean(),
  ]);
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

  await connectToDatabase();
  const quiz = await Quiz.findOne({
    _id: taskData.quizId,
    createdBy: admin._id,
  });
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
  quiz.taskIds.push(task._id);
  await quiz.save();

  return Response.json(
    { task, quizId: quiz._id.toString() },
    { status: 201 },
  );
}
