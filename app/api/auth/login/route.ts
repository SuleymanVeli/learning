import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, readJsonObject } from "@/src/lib/api";
import {
  publicUser,
  setSessionCookie,
  verifyPassword,
} from "@/src/lib/auth";
import { User } from "@/src/models/User";

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (
    !body ||
    typeof body.email !== "string" ||
    typeof body.password !== "string"
  ) {
    return jsonError("E-poçt və şifrə tələb olunur.", 400);
  }

  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Düzgün e-poçt ünvanı daxil edin.", 400);
  }

  await connectToDatabase();
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return jsonError("E-poçt və ya şifrə yanlışdır.", 401);
  }
  if (user.isActive === false) {
    return jsonError("Bu hesab deaktiv edilib. Administratorla əlaqə saxlayın.", 403);
  }

  await setSessionCookie(user._id.toString(), user.authVersion ?? 0);
  return Response.json({
    user: {
      ...publicUser(user),
      approvalStatus: user.approvalStatus ?? "approved",
    },
  });
}
