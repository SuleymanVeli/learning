import { connectToDatabase } from "@/src/lib/mongodb";
import {
  isNonEmptyString,
  jsonError,
  readJsonObject,
} from "@/src/lib/api";
import { hashPassword, publicUser, setSessionCookie } from "@/src/lib/auth";
import { Group } from "@/src/models/Group";
import { User } from "@/src/models/User";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (
    !body ||
    !isNonEmptyString(body.name) ||
    body.name.trim().length > 100 ||
    !isNonEmptyString(body.email) ||
    !isNonEmptyString(body.password) ||
    !isNonEmptyString(body.accessCode)
  ) {
    return jsonError("Bütün sahələri düzgün doldurun.", 400);
  }
  if (body.password.length < 8 || body.password.length > 128) {
    return jsonError("Şifrə 8-128 simvol aralığında olmalıdır.", 400);
  }

  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Düzgün e-poçt ünvanı daxil edin.", 400);
  }
  if (!/^[a-f\d]{12}$/i.test(body.accessCode)) {
    return jsonError("Qrup dəvət linki düzgün deyil.", 400);
  }

  await connectToDatabase();
  const group = await Group.findOne({
    accessCode: body.accessCode.toUpperCase(),
    archivedAt: null,
    inviteEnabled: true,
  });
  if (!group) return jsonError("Qrup dəvət linki etibarsız və ya deaktiv edilib.", 404);
  if (await User.exists({ email })) {
    return jsonError("Bu e-poçtla hesab artıq mövcuddur.", 409);
  }

  let student;
  try {
    student = await User.create({
      name: body.name.trim(),
      email,
      passwordHash: await hashPassword(body.password),
      role: "student",
      groupIds: [group._id],
      isActive: true,
      approvalStatus: "pending",
      authVersion: 0,
    });
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

  group.studentIds.addToSet(student._id);
  await group.save();
  await setSessionCookie(student._id.toString(), student.authVersion ?? 0);

  return Response.json({ user: publicUser(student) }, { status: 201 });
}
