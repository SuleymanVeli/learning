import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  isNonEmptyString,
  jsonError,
  readJsonObject,
} from "@/src/lib/api";
import {
  hashPassword,
  publicUser,
  setSessionCookie,
  verifyPassword,
} from "@/src/lib/auth";
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

  const existingStudent = await User.findOne({ email }).select("+passwordHash");
  if (existingStudent) {
    if (
      existingStudent.role !== "student" ||
      !(await verifyPassword(body.password, existingStudent.passwordHash))
    ) {
      return jsonError("E-poçt və ya şifrə yanlışdır.", 401);
    }
    if (!existingStudent.isActive) {
      return jsonError(
        "Bu hesab deaktiv edilib. Administratorla əlaqə saxlayın.",
        403,
      );
    }

    const groupUpdate = await Group.updateOne(
      { _id: group._id, archivedAt: null, inviteEnabled: true },
      { $addToSet: { studentIds: existingStudent._id } },
    );
    if (groupUpdate.matchedCount !== 1) {
      return jsonError("Qrup dəvət linki etibarsız və ya deaktiv edilib.", 404);
    }

    const alreadyInGroup = group.studentIds.some(
      (studentId: mongoose.Types.ObjectId) =>
        studentId.equals(existingStudent._id),
    );
    const studentUpdate = await User.updateOne(
      { _id: existingStudent._id, role: "student", isActive: true },
      { $addToSet: { groupIds: group._id } },
    );
    if (studentUpdate.matchedCount !== 1 && !alreadyInGroup) {
      await Group.updateOne(
        { _id: group._id },
        { $pull: { studentIds: existingStudent._id } },
      );
    }
    if (studentUpdate.matchedCount !== 1) {
      return jsonError("Şagird hesabı aktiv deyil.", 403);
    }
    existingStudent.groupIds.addToSet(group._id);
    await setSessionCookie(
      existingStudent._id.toString(),
      existingStudent.authVersion ?? 0,
    );
    return Response.json({ user: publicUser(existingStudent) });
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
      return jsonError(
        "Bu e-poçtla hesab artıq mövcuddur. Mövcud hesabınızın şifrəsi ilə qrupa qoşulun.",
        409,
      );
    }
    throw error;
  }

  group.studentIds.addToSet(student._id);
  await group.save();
  await setSessionCookie(student._id.toString(), student.authVersion ?? 0);

  return Response.json({ user: publicUser(student) }, { status: 201 });
}
