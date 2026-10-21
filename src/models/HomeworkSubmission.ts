import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface HomeworkSubmissionDocument extends Document {
  assignmentId: Types.ObjectId;
  taskId: Types.ObjectId;
  studentId: Types.ObjectId;
  answer: unknown;
  isCorrect: boolean;
  retryAllowed: boolean;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const homeworkSubmissionSchema = new Schema<HomeworkSubmissionDocument>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    answer: { type: Schema.Types.Mixed, required: true },
    isCorrect: { type: Boolean, required: true },
    retryAllowed: { type: Boolean, required: true, default: false },
    submittedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

homeworkSubmissionSchema.index(
  { assignmentId: 1, taskId: 1, studentId: 1 },
  { unique: true },
);

export const HomeworkSubmission =
  mongoose.models.HomeworkSubmission ||
  mongoose.model<HomeworkSubmissionDocument>(
    "HomeworkSubmission",
    homeworkSubmissionSchema,
  );
