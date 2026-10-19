import { connectToDatabase } from "@/src/lib/mongodb";
import { Group } from "@/src/models/Group";
import { jsonError } from "@/src/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accessCode: string }> },
) {
  const { accessCode } = await params;
  await connectToDatabase();
  const group = await Group.findOne({
    accessCode: accessCode.toUpperCase(),
    archivedAt: null,
    inviteEnabled: true,
  })
    .select("name")
    .lean();
  if (!group) return jsonError("Qrup dəvət linki etibarsız və ya deaktiv edilib.", 404);
  return Response.json({ group: { name: group.name } });
}
