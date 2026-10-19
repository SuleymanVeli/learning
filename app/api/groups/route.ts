import { randomBytes } from "node:crypto";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, isNonEmptyString, readJsonObject } from "@/src/lib/api";
import { requireUser } from "@/src/lib/auth";
import { Group } from "@/src/models/Group";

export async function GET(request: Request) {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  await connectToDatabase();
  const includeArchived = new URL(request.url).searchParams.get("archived") === "true";
  const groups = await Group.find({
    adminId: admin._id,
    archivedAt: includeArchived ? { $ne: null } : null,
  })
    .select("name accessCode inviteEnabled createdAt archivedAt studentIds")
    .sort({ createdAt: -1 })
    .lean();
  return Response.json({
    groups: groups.map(({ studentIds, ...group }) => ({
      ...group,
      inviteEnabled: group.inviteEnabled === true,
      studentCount: studentIds.length,
    })),
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
    studentIds: [],
    archivedAt: null,
  });

  return Response.json({ group }, { status: 201 });
}
