import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser, teacherGroupScope } from "@/src/lib/auth";
import { Group } from "@/src/models/Group";
import { User } from "@/src/models/User";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { groupId } = await params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return jsonError("Qrup tapılmadı.", 404);
  }

  await connectToDatabase();
  const group = await Group.findOne({
    _id: groupId,
    ...teacherGroupScope(admin),
  })
    .select("studentIds")
    .lean();
  if (!group) return jsonError("Qrup tapılmadı.", 404);

  const students = await User.find({
    _id: { $in: group.studentIds },
    role: "student",
  })
    .select("_id name email isActive approvalStatus")
    .lean();
  const studentsById = new Map(
    students.map((student) => [student._id.toString(), student]),
  );

  return Response.json({
    students: group.studentIds.flatMap((studentId: mongoose.Types.ObjectId) => {
      const student = studentsById.get(studentId.toString());
      return student
        ? [{ ...student, approvalStatus: student.approvalStatus ?? "approved" }]
        : [];
    }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { groupId } = await params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return jsonError("Qrup tapılmadı.", 404);
  }

  const body = await readJsonObject(request);
  if (
    !body ||
    typeof body.sourceGroupId !== "string" ||
    !mongoose.Types.ObjectId.isValid(body.sourceGroupId) ||
    !Array.isArray(body.studentIds) ||
    body.studentIds.length === 0 ||
    body.studentIds.length > 500 ||
    body.studentIds.some(
      (studentId: unknown) =>
        typeof studentId !== "string" ||
        !mongoose.Types.ObjectId.isValid(studentId),
    )
  ) {
    return jsonError("Şagird qrupu və ən azı bir şagird seçin.", 400);
  }

  const studentIds = [
    ...new Set(
      body.studentIds.filter(
        (studentId: unknown): studentId is string =>
          typeof studentId === "string",
      ),
    ),
  ];
  if (studentIds.length > 500) {
    return jsonError("Bir dəfəyə ən çox 500 şagird əlavə etmək olar.", 400);
  }

  await connectToDatabase();
  const [targetGroup, sourceGroup] = await Promise.all([
    Group.findOne({
      _id: groupId,
      ...teacherGroupScope(admin),
      archivedAt: null,
    }).select("_id studentIds"),
    Group.findOne({
      _id: body.sourceGroupId,
      ...teacherGroupScope(admin),
      archivedAt: null,
    }).select("_id"),
  ]);
  if (!targetGroup) return jsonError("Aktiv qrup tapılmadı.", 404);
  if (!sourceGroup) return jsonError("Mənbə qrupu tapılmadı.", 404);
  if (targetGroup._id.equals(sourceGroup._id)) {
    return jsonError("Şagirdlər başqa qrupdan seçilməlidir.", 400);
  }

  const eligibleStudents = await User.find({
    _id: { $in: studentIds },
    role: "student",
    groupIds: sourceGroup._id,
  })
    .select("_id")
    .lean();
  if (eligibleStudents.length !== studentIds.length) {
    return jsonError(
      "Seçilmiş şagirdlərdən bəziləri mənbə qrupunun üzvü deyil.",
      400,
    );
  }

  const alreadyInTarget = new Set(
    targetGroup.studentIds.map((studentId: mongoose.Types.ObjectId) =>
      studentId.toString(),
    ),
  );
  const addedCount = studentIds.filter(
    (studentId) => !alreadyInTarget.has(studentId),
  ).length;

  await User.updateMany(
    { _id: { $in: studentIds }, role: "student" },
    { $addToSet: { groupIds: targetGroup._id } },
  );
  await Group.updateOne(
    { _id: targetGroup._id },
    {
      $addToSet: {
        studentIds: { $each: eligibleStudents.map(({ _id }) => _id) },
      },
    },
  );

  return Response.json({ addedCount });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const { groupId } = await params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return jsonError("Qrup tapılmadı.", 404);
  }

  const body = await readJsonObject(request);
  if (
    !body ||
    typeof body.studentId !== "string" ||
    !mongoose.Types.ObjectId.isValid(body.studentId) ||
    typeof body.confirmEmail !== "string" ||
    !body.confirmEmail.trim()
  ) {
    return jsonError("Şagirdi çıxarmaq üçün düzgün email ünvanını yazın.", 400);
  }

  await connectToDatabase();
  const group = await Group.findOne({
    _id: groupId,
    ...teacherGroupScope(admin),
    studentIds: body.studentId,
  }).select("_id");
  if (!group) return jsonError("Şagird bu qrupda tapılmadı.", 404);

  const student = await User.findOne({
    _id: body.studentId,
    role: "student",
    groupIds: group._id,
  }).select("_id email");
  if (!student) return jsonError("Şagird bu qrupda tapılmadı.", 404);
  if (body.confirmEmail.trim().toLowerCase() !== student.email) {
    return jsonError("E-poçt ünvanı uyğun gəlmir.", 400);
  }

  await Promise.all([
    Group.updateOne(
      { _id: group._id },
      { $pull: { studentIds: student._id } },
    ),
    User.updateOne(
      { _id: student._id, role: "student" },
      { $pull: { groupIds: group._id } },
    ),
  ]);

  return Response.json({ success: true });
}
