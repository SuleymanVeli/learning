import { jsonError, isNonEmptyString, readJsonObject } from "@/src/lib/api";
import { hashPassword, publicUser, requireUser, verifyPassword } from "@/src/lib/auth";
import { User } from "@/src/models/User";

const AVATAR_PATHS = new Set(
  Array.from({ length: 12 }, (_, index) => `/avatars/avatar-${index + 1}.png`),
);

export async function PATCH(request: Request) {
  const student = await requireUser("student");
  if (student instanceof Response) return student;

  const body = await readJsonObject(request);
  if (!body) return jsonError("Profil məlumatları yanlışdır.", 400);

  if ("name" in body) {
    if (!isNonEmptyString(body.name) || body.name.trim().length > 100) {
      return jsonError("Ad və soyad 1-100 simvol olmalıdır.", 400);
    }
    student.name = body.name.trim();
  }

  if ("avatar" in body) {
    if (typeof body.avatar !== "string" || !AVATAR_PATHS.has(body.avatar)) {
      return jsonError("Avatar seçimi yanlışdır.", 400);
    }
    student.avatar = body.avatar;
  }

  if ("newPassword" in body || "currentPassword" in body) {
    if (
      typeof body.currentPassword !== "string" ||
      typeof body.newPassword !== "string" ||
      body.newPassword.length < 8 ||
      body.newPassword.length > 128
    ) {
      return jsonError("Cari şifrə və 8-128 simvolluq yeni şifrə daxil edin.", 400);
    }
    const studentWithPassword = await User.findById(student._id).select(
      "+passwordHash",
    );
    if (
      !studentWithPassword ||
      !(await verifyPassword(
        body.currentPassword,
        studentWithPassword.passwordHash,
      ))
    ) {
      return jsonError("Cari şifrə yanlışdır.", 400);
    }
    student.passwordHash = await hashPassword(body.newPassword);
    student.authVersion += 1;
  }

  await student.save();
  return Response.json({ user: publicUser(student) });
}
