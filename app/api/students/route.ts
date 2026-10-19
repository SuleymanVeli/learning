import mongoose from "mongoose";
import { connectToDatabase } from "@/src/lib/mongodb";
import { requireUser } from "@/src/lib/auth";
import { Group } from "@/src/models/Group";
import { User } from "@/src/models/User";

type GroupReference =
  | mongoose.Types.ObjectId
  | string
  | {
      _id: mongoose.Types.ObjectId | string;
      name: string;
      archivedAt?: Date | null;
    };

export async function GET() {
  const admin = await requireUser("admin");
  if (admin instanceof Response) return admin;

  await connectToDatabase();
  const groups = await Group.find({
    adminId: admin._id,
  }).select("_id").lean();
  const students = await User.find({
    role: "student",
    groupIds: { $in: groups.map((group) => group._id) },
  })
    .select("_id name email groupIds createdAt isActive approvalStatus")
    .populate("groupIds", "name accessCode archivedAt")
    .sort({ createdAt: -1 })
    .lean();

  return Response.json({
    students: students.map((student) => ({
      ...student,
      approvalStatus: student.approvalStatus ?? "approved",
      groupIds: student.groupIds.map((group: GroupReference) =>
        typeof group === "object" && "_id" in group
          ? group._id.toString()
          : group.toString(),
      ),
      groups: student.groupIds.map((group: GroupReference) =>
        typeof group === "object" && "name" in group
          ? {
              id: "_id" in group ? String(group._id) : "",
              name: String(group.name),
              archived: Boolean("archivedAt" in group && group.archivedAt),
            }
          : { id: String(group), name: "Qrup", archived: false },
      ),
    })),
  });
}
