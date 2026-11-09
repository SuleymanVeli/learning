import mongoose, { type Types } from "mongoose";
import { jsonError } from "@/src/lib/api";
import { TeacherTaskVideo } from "@/src/models/TeacherTaskVideo";
import { User, type UserDocument } from "@/src/models/User";

interface TeacherVideoUpdate {
  teacherId: Types.ObjectId;
  videoId: string;
}

const VIDEO_ID_PATTERN = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export async function parseTeacherVideoUpdates(
  user: UserDocument,
  body: Record<string, unknown>,
): Promise<TeacherVideoUpdate[] | Response> {
  if (user.role === "admin" && body.videoExplanations !== undefined) {
    if (!Array.isArray(body.videoExplanations)) {
      return jsonError("Müəllim videolarının siyahısı yanlışdır.", 400);
    }

    const updates: TeacherVideoUpdate[] = [];
    const teacherIds = new Set<string>();
    for (const item of body.videoExplanations) {
      if (
        item === null ||
        typeof item !== "object" ||
        !("teacherId" in item) ||
        typeof item.teacherId !== "string" ||
        !mongoose.Types.ObjectId.isValid(item.teacherId) ||
        !("videoId" in item) ||
        typeof item.videoId !== "string"
      ) {
        return jsonError("Müəllim videosunun məlumatları yanlışdır.", 400);
      }

      const teacherId = new mongoose.Types.ObjectId(item.teacherId);
      const key = teacherId.toString();
      const videoId = item.videoId.trim().toLowerCase();
      if (
        teacherIds.has(key) ||
        (videoId !== "" && !VIDEO_ID_PATTERN.test(videoId))
      ) {
        return jsonError("Müəllim videosunun məlumatları yanlışdır.", 400);
      }
      teacherIds.add(key);
      updates.push({ teacherId, videoId });
    }

    const activeTeacherCount = await User.countDocuments({
      _id: { $in: [...teacherIds] },
      role: { $in: ["admin", "teacher"] },
      isActive: true,
    });
    if (activeTeacherCount !== teacherIds.size) {
      return jsonError("Müəllim tapılmadı.", 404);
    }
    return updates;
  }

  let teacherId = user._id;
  if (user.role === "admin") {
    const requestedTeacherId =
      typeof body.videoTeacherId === "string" && body.videoTeacherId
        ? body.videoTeacherId
        : user._id.toString();
    if (!mongoose.Types.ObjectId.isValid(requestedTeacherId)) {
      return jsonError("Video üçün müəllim seçimi yanlışdır.", 400);
    }
    const teacher = await User.findOne({
      _id: requestedTeacherId,
      role: { $in: ["admin", "teacher"] },
      isActive: true,
    }).select("_id");
    if (!teacher) return jsonError("Müəllim tapılmadı.", 404);
    teacherId = teacher._id;
  }

  const rawVideoId = body.videoExplanationId;
  if (rawVideoId !== undefined && typeof rawVideoId !== "string") {
    return jsonError("Video ID-si yanlışdır.", 400);
  }
  const videoId =
    typeof rawVideoId === "string" ? rawVideoId.trim().toLowerCase() : "";
  if (videoId && !VIDEO_ID_PATTERN.test(videoId)) {
    return jsonError("Video ID-si yanlışdır.", 400);
  }
  return [{ teacherId, videoId }];
}

export async function syncTeacherTaskVideos(
  taskId: Types.ObjectId,
  updates: TeacherVideoUpdate[],
) {
  if (updates.length === 0) return;
  await TeacherTaskVideo.bulkWrite(
    updates.map(({ teacherId, videoId }) =>
      videoId
        ? {
            updateOne: {
              filter: { teacherId, taskId },
              update: { $set: { videoId } },
              upsert: true,
            },
          }
        : { deleteOne: { filter: { teacherId, taskId } } },
    ),
    { ordered: true },
  );
}
