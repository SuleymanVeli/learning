import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface AssignmentDocument extends Document {
  title: string;
  groupId: Types.ObjectId;
  taskIds: Types.ObjectId[];
  dueAt?: Date;
  createdBy: Types.ObjectId;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<AssignmentDocument>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", required: true },
    taskIds: [{ type: Schema.Types.ObjectId, ref: "Task", required: true }],
    dueAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date },
  },
  { timestamps: true },
);

assignmentSchema.index({ groupId: 1, publishedAt: 1 });

export const Assignment =
  mongoose.models.Assignment ||
  mongoose.model<AssignmentDocument>("Assignment", assignmentSchema);
