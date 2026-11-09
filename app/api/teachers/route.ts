import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, isNonEmptyString, readJsonObject } from "@/src/lib/api";
import { hashPassword, requireUser } from "@/src/lib/auth";
import { User } from "@/src/models/User";

export async function GET() {
  const user = await requireUser("admin");
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return jsonError("Müəllim siyahısına baxmaq icazəniz yoxdur.", 403);
  }

  await connectToDatabase();
  const teachers = await User.find({
    role: { $in: ["admin", "teacher"] },
    isActive: true,
  })
    .select("_id name email role avatar")
    .sort({ name: 1 })
    .lean();
  return Response.json({
    teachers: teachers.map((teacher) => ({
      ...teacher,
      role: "teacher",
    })),
  });
}

export async function POST(request: Request) {
  const user = await requireUser("admin");
  if (user instanceof Response) return user;
  if (user.role !== "admin") {
    return jsonError("Yeni müəllim hesabı yaratmaq icazəniz yoxdur.", 403);
  }

  const body = await readJsonObject(request);
  if (
    !body ||
    !isNonEmptyString(body.name) ||
    body.name.trim().length > 100 ||
    !isNonEmptyString(body.email) ||
    !isNonEmptyString(body.password) ||
    body.password.length < 8 ||
    body.password.length > 128
  ) {
    return jsonError("Ad, e-poçt və 8-128 simvolluq şifrə daxil edin.", 400);
  }

  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Düzgün e-poçt ünvanı daxil edin.", 400);
  }

  await connectToDatabase();
  try {
    const teacher = await User.create({
      name: body.name.trim(),
      email,
      passwordHash: await hashPassword(body.password),
      role: "teacher",
      groupIds: [],
      isActive: true,
      approvalStatus: "approved",
      authVersion: 0,
    });
    return Response.json(
      {
        teacher: {
          id: teacher._id.toString(),
          name: teacher.name,
          email: teacher.email,
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
      return jsonError("Bu e-poçtla hesab artıq mövcuddur.", 409);
    }
    throw error;
  }
}
