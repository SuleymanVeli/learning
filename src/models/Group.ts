import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface GroupDocument extends Document {
  name: string;
  accessCode: string;
  inviteEnabled: boolean;
  adminId: Types.ObjectId;
  studentIds: Types.ObjectId[];
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const groupSchema = new Schema<GroupDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    accessCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    inviteEnabled: { type: Boolean, required: true, default: false, index: true },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    archivedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

groupSchema.index({ adminId: 1, archivedAt: 1, createdAt: -1 });

export const Group =
  mongoose.models.Group || mongoose.model<GroupDocument>("Group", groupSchema);
