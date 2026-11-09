import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { isNonEmptyString, jsonError, readJsonObject } from "@/src/lib/api";
import { requireUser, teacherGroupScope } from "@/src/lib/auth";
import { Group } from "@/src/models/Group";
import { User } from "@/src/models/User";

export async function PATCH(
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
  if (!body) return jsonError("Sorğu məlumatları yanlışdır.", 400);
  const restore = body.action === "restore";
  const updateInvite = body.action === "invite";
  const assignTeacher = body.action === "assign-teacher";
  if (
    body.action !== undefined &&
    !restore &&
    !updateInvite &&
    !assignTeacher
  ) {
    return jsonError("Dəstəklənməyən əməliyyatdır.", 400);
  }
  if (updateInvite && typeof body.inviteEnabled !== "boolean") {
    return jsonError("Dəvət linkinin aktivliyi düzgün göstərilməyib.", 400);
  }
  if (
    assignTeacher &&
    (admin.role !== "admin" ||
      typeof body.teacherId !== "string" ||
      !mongoose.Types.ObjectId.isValid(body.teacherId))
  ) {
    return jsonError("Müəllim təyini yanlışdır və ya icazəniz yoxdur.", 400);
  }
  const name = isNonEmptyString(body.name) ? body.name.trim() : "";
  if (!restore && !updateInvite && !assignTeacher && (!name || name.length > 100)) {
    return jsonError("Qrup adı 1-100 simvol olmalıdır.", 400);
  }

  await connectToDatabase();
  const group = await Group.findOne({
    _id: groupId,
    ...teacherGroupScope(admin),
    ...(restore ? { archivedAt: { $ne: null } } : { archivedAt: null }),
  });
  if (!group) {
    return jsonError(restore ? "Arxivlənmiş qrup tapılmadı." : "Aktiv qrup tapılmadı.", 404);
  }

  if (restore) {
    group.archivedAt = null;
  } else if (updateInvite) {
    group.inviteEnabled = body.inviteEnabled as boolean;
  } else if (assignTeacher) {
    const teacher = await User.findOne({
      _id: body.teacherId,
      role: { $in: ["admin", "teacher"] },
      isActive: true,
    }).select("_id");
    if (!teacher) return jsonError("Müəllim tapılmadı.", 404);
    group.teacherId = teacher._id;
  } else {
    group.name = name;
  }
  await group.save();

  return Response.json({ group });
}

export async function DELETE(
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
  const group = await Group.findOneAndUpdate(
    { _id: groupId, ...teacherGroupScope(admin), archivedAt: null },
    { $set: { archivedAt: new Date(), inviteEnabled: false } },
    { new: true },
  );
  if (!group) return jsonError("Aktiv qrup tapılmadı.", 404);

  return Response.json({ group });
}
