import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface TeacherTaskVideoDocument extends Document {
  teacherId: Types.ObjectId;
  taskId: Types.ObjectId;
  videoId: string;
  createdAt: Date;
  updatedAt: Date;
}

const teacherTaskVideoSchema = new Schema<TeacherTaskVideoDocument>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    videoId: { type: String, required: true, trim: true, maxlength: 36 },
  },
  { timestamps: true },
);

teacherTaskVideoSchema.index({ teacherId: 1, taskId: 1 }, { unique: true });

export const TeacherTaskVideo =
  mongoose.models.TeacherTaskVideo ||
  mongoose.model<TeacherTaskVideoDocument>(
    "TeacherTaskVideo",
    teacherTaskVideoSchema,
  );
