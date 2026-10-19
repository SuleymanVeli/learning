import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import {
  isNonEmptyString,
  jsonError,
  readJsonObject,
} from "@/src/lib/api";
import { hashPassword, requireUser } from "@/src/lib/auth";
import { Group } from "@/src/models/Group";
import { HomeworkSubmission } from "@/src/models/HomeworkSubmission";
import { LiveLesson } from "@/src/models/LiveLesson";
import { Submission } from "@/src/models/Submission";
import { User } from "@/src/models/User";

async function findManagedStudent(studentId: string, adminId: mongoose.Types.ObjectId) {
  if (!mongoose.Types.ObjectId.isValid(studentId)) return null;
  const groupIds = await Group.find({ adminId }).distinct("_id");
  if (!groupIds.length) return null;
  return User.findOne({
    _id: studentId,
    role: "student",
    groupIds: { $in: groupIds },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { studentId } = await params;
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    return jsonError("Şagird tapılmadı.", 404);
  }
  const body = await readJsonObject(request);
  if (!body) return jsonError("Sorğu məlumatları yanlışdır.", 400);
  if (
    body.action !== "activate" &&
    body.action !== "deactivate" &&
    body.action !== "reset-password" &&
    body.action !== "approve"
  ) {
    return jsonError("Dəstəklənməyən əməliyyatdır.", 400);
  }
  if (
    body.action === "reset-password" &&
    (!isNonEmptyString(body.password) ||
      body.password.length < 8 ||
      body.password.length > 128)
  ) {
    return jsonError("Müvəqqəti şifrə 8-128 simvol olmalıdır.", 400);
  }

  await connectToDatabase();
  const student = await findManagedStudent(studentId, admin._id);
  if (!student) return jsonError("İdarə etdiyiniz şagird tapılmadı.", 404);

  if (body.action === "approve") {
    student.approvalStatus = "approved";
  } else if (body.action === "reset-password") {
    if (!isNonEmptyString(body.password)) {
      return jsonError("Müvəqqəti şifrə 8-128 simvol olmalıdır.", 400);
    }
    student.passwordHash = await hashPassword(body.password);
    student.authVersion = (student.authVersion ?? 0) + 1;
  } else {
    const active = body.action === "activate";
    if (student.isActive !== active) {
      student.isActive = active;
      student.authVersion = (student.authVersion ?? 0) + 1;
    }
  }
  await student.save();

  return Response.json({
    student: {
      id: student._id.toString(),
      name: student.name,
      email: student.email,
      isActive: student.isActive !== false,
      approvalStatus: student.approvalStatus ?? "approved",
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { studentId } = await params;
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    return jsonError("Şagird tapılmadı.", 404);
  }
  const body = await readJsonObject(request);
  if (!body || !isNonEmptyString(body.confirmEmail)) {
    return jsonError("Təsdiq üçün şagirdin e-poçt ünvanını yazın.", 400);
  }

  await connectToDatabase();
  const student = await findManagedStudent(studentId, admin._id);
  if (!student) return jsonError("İdarə etdiyiniz şagird tapılmadı.", 404);
  if (body.confirmEmail.trim().toLowerCase() !== student.email) {
    return jsonError("E-poçt ünvanı uyğun gəlmir.", 400);
  }

  await Promise.all([
    Group.updateMany(
      { adminId: admin._id, studentIds: student._id },
      { $pull: { studentIds: student._id } },
    ),
    Submission.deleteMany({ studentId: student._id }),
    HomeworkSubmission.deleteMany({ studentId: student._id }),
    LiveLesson.updateMany(
      { createdBy: admin._id, reopenedStudentIds: student._id },
      { $pull: { reopenedStudentIds: student._id } },
    ),
  ]);
  await student.deleteOne();

  return Response.json({ success: true });
}
