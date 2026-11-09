import { randomBytes } from "node:crypto";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, isNonEmptyString, readJsonObject } from "@/src/lib/api";
import { requireUser, teacherGroupScope } from "@/src/lib/auth";
import { Group } from "@/src/models/Group";

export async function GET(request: Request) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  await connectToDatabase();
  const includeArchived = new URL(request.url).searchParams.get("archived") === "true";
  const groups = await Group.find({
    ...teacherGroupScope(admin),
    archivedAt: includeArchived ? { $ne: null } : null,
  })
    .select("name accessCode inviteEnabled createdAt archivedAt studentIds teacherId adminId")
    .populate("teacherId", "name")
    .populate("adminId", "name")
    .sort({ createdAt: -1 })
    .lean();

  return Response.json({
    groups: groups.map(({ studentIds, teacherId, adminId, ...group }) => {
      const teacher = teacherId ?? adminId;
      return {
        ...group,
        teacherId:
          teacher && typeof teacher === "object" && "_id" in teacher
            ? String(teacher._id)
            : "",
        teacherName:
          teacher && typeof teacher === "object" && "name" in teacher
            ? String(teacher.name)
            : "Müəllim təyin edilməyib",
        inviteEnabled: group.inviteEnabled === true,
        studentCount: studentIds.length,
      };
    }),
  });
}

export async function POST(request: Request) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  const body = await readJsonObject(request);
  if (!body || !isNonEmptyString(body.name) || body.name.trim().length > 100) {
    return jsonError("Qrup adı 1-100 simvol olmalıdır.", 400);
  }

  await connectToDatabase();
  const group = await Group.create({
    name: body.name.trim(),
    accessCode: randomBytes(6).toString("hex").toUpperCase(),
    inviteEnabled: false,
    adminId: admin._id,
    teacherId: admin._id,
    studentIds: [],
    archivedAt: null,
  });

  return Response.json({ group }, { status: 201 });
}
