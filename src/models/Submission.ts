import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface SubmissionDocument extends Document {
  lessonId: Types.ObjectId;
  taskId: Types.ObjectId;
  studentId: Types.ObjectId;
  answer: unknown;
  isCorrect: boolean;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const submissionSchema = new Schema<SubmissionDocument>(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: "LiveLesson", required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    answer: { type: Schema.Types.Mixed, required: true },
    isCorrect: { type: Boolean, required: true, select: false },
    submittedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

submissionSchema.index(
  { lessonId: 1, taskId: 1, studentId: 1 },
  { unique: true },
);

export const Submission =
  mongoose.models.Submission ||
  mongoose.model<SubmissionDocument>("Submission", submissionSchema);
