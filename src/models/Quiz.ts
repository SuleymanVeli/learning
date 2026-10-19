import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface QuizDocument extends Document {
  title: string;
  taskIds: Types.ObjectId[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const quizSchema = new Schema<QuizDocument>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    taskIds: [
      { type: Schema.Types.ObjectId, ref: "Task", required: true },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true },
);

quizSchema.index({ createdBy: 1, createdAt: -1 });

export const Quiz =
  mongoose.models.Quiz || mongoose.model<QuizDocument>("Quiz", quizSchema);
