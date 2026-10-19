import { timingSafeEqual } from "node:crypto";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError, isNonEmptyString, readJsonObject } from "@/src/lib/api";
import {
  hashPassword,
  publicUser,
  setSessionCookie,
} from "@/src/lib/auth";
import { User } from "@/src/models/User";

function tokensMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!bootstrapToken || bootstrapToken.length < 24) {
    return jsonError(
      "Admin hesabı yaratmaq üçün ADMIN_BOOTSTRAP_TOKEN (ən azı 24 simvol) təyin edin.",
      503,
    );
  }

  const body = await readJsonObject(request);
  if (
    !body ||
    !isNonEmptyString(body.token) ||
    !isNonEmptyString(body.name) ||
    !isNonEmptyString(body.email) ||
    !isNonEmptyString(body.password)
  ) {
    return jsonError("Bütün sahələri doldurun.", 400);
  }
  if (!tokensMatch(body.token, bootstrapToken)) {
    return jsonError("Bootstrap token yanlışdır.", 401);
  }
  if (body.password.length < 8 || body.password.length > 128) {
    return jsonError("Şifrə 8-128 simvol aralığında olmalıdır.", 400);
  }

  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Düzgün e-poçt ünvanı daxil edin.", 400);
  }

  await connectToDatabase();
  if (await User.exists({ role: "admin" })) {
    return jsonError("Admin hesabı artıq yaradılıb.", 409);
  }

  let user;
  try {
    user = await User.create({
      name: body.name.trim(),
      email,
      passwordHash: await hashPassword(body.password),
      role: "admin",
    });
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      return jsonError("Admin hesabı artıq yaradılıb.", 409);
    }
    throw error;
  }

  await setSessionCookie(user._id.toString(), user.authVersion ?? 0);
  return Response.json({ user: publicUser(user) }, { status: 201 });
}
