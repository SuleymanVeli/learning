import mongoose, { Schema, type Document, type Types } from "mongoose";

export const TASK_TYPES = [
  "single_choice",
  "multiple_choice",
  "drag_drop",
  "short_answer",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export interface TaskOption {
  id: string;
  text: string;
}

export type TaskContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      url: string;
      width: number;
      maxWidthPx?: number;
      alt: string;
    };

export interface TaskDocument extends Document {
  title: string;
  prompt: string;
  contentBlocks: TaskContentBlock[];
  type: TaskType;
  options: TaskOption[];
  correctAnswer: unknown;
  explanation?: string;
  difficulty: "easy" | "medium" | "hard";
  archivedAt?: Date | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<TaskDocument>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    prompt: { type: String, trim: true, maxlength: 10000, default: "" },
    contentBlocks: {
      type: [
        new Schema(
          {
            type: { type: String, enum: ["text", "image"], required: true },
            text: { type: String, maxlength: 10000 },
            url: { type: String, maxlength: 2048 },
            width: { type: Number, min: 10, max: 100 },
            maxWidthPx: { type: Number, min: 1, max: 4096 },
            alt: { type: String, maxlength: 300 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    type: { type: String, enum: TASK_TYPES, required: true },
    options: {
      type: [
        new Schema(
          {
            id: { type: String, required: true, trim: true },
            text: { type: String, required: true, trim: true, maxlength: 1000 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    correctAnswer: { type: Schema.Types.Mixed, required: true, select: false },
    explanation: { type: String, trim: true, maxlength: 5000, select: false },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    archivedAt: { type: Date, default: null, index: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

export const Task =
  mongoose.models.Task || mongoose.model<TaskDocument>("Task", taskSchema);
