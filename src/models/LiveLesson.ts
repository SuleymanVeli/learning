import mongoose, { Schema, type Document, type Types } from "mongoose";

export type LiveLessonStatus = "draft" | "live" | "ended";

export interface LiveLessonDocument extends Document {
  title: string;
  groupId: Types.ObjectId;
  quizIds: Types.ObjectId[];
  taskIds: Types.ObjectId[];
  activeTaskIndex: number;
  durationSeconds: number;
  status: LiveLessonStatus;
  startedAt?: Date;
  endsAt?: Date;
  reopenedStudentIds: Types.ObjectId[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const liveLessonSchema = new Schema<LiveLessonDocument>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
    quizIds: [{ type: Schema.Types.ObjectId, ref: "Quiz" }],
    taskIds: [{ type: Schema.Types.ObjectId, ref: "Task", required: true }],
    activeTaskIndex: { type: Number, min: 0, default: 0 },
    durationSeconds: { type: Number, min: 15, max: 3600, default: 120 },
    status: {
      type: String,
      enum: ["draft", "live", "ended"],
      default: "draft",
      index: true,
    },
    startedAt: { type: Date },
    endsAt: { type: Date },
    reopenedStudentIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

liveLessonSchema.index({ groupId: 1, status: 1 });

export const LiveLesson =
  mongoose.models.LiveLesson ||
  mongoose.model<LiveLessonDocument>("LiveLesson", liveLessonSchema);
