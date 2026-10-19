import mongoose, { Schema, type Document, type Types } from "mongoose";

export type UserRole = "admin" | "student";
export type ApprovalStatus = "pending" | "approved";

export interface UserDocument extends Document {
  name: string;
  email: string;
  avatar?: string;
  passwordHash: string;
  role: UserRole;
  groupIds: Types.ObjectId[];
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  authVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    avatar: { type: String, default: "/avatars/avatar-1.png" },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["admin", "student"],
      required: true,
      default: "student",
    },
    groupIds: [{ type: Schema.Types.ObjectId, ref: "Group" }],
    isActive: { type: Boolean, required: true, default: true, index: true },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved"],
      required: true,
      default: "approved",
      index: true,
    },
    authVersion: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: "admin" } },
);

export const User =
  mongoose.models.User || mongoose.model<UserDocument>("User", userSchema);
