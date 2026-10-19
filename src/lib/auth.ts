import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { User, type UserDocument, type UserRole } from "@/src/models/User";
import { connectToDatabase } from "@/src/lib/mongodb";
import { jsonError } from "@/src/lib/api";

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "bebras_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

interface SessionPayload {
  sub: string;
  exp: number;
  version: number;
}

export function publicUser(user: UserDocument) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? "/avatars/avatar-1.png",
    role: user.role,
    approvalStatus: user.approvalStatus ?? "approved",
    groupIds: user.groupIds.map((id) => id.toString()),
  };
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET ən azı 32 simvol olmalıdır.");
  }
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, storedKey] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !storedKey) return false;

  const expected = Buffer.from(storedKey, "hex");
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

export async function setSessionCookie(userId: string, version = 0) {
  const payload: SessionPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    version,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${sign(encoded)}`;

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

function readSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;

  const expected = Buffer.from(sign(encoded), "base64url");
  const actual = Buffer.from(signature, "base64url");
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }

  if (
    payload === null ||
    typeof payload !== "object" ||
    !("sub" in payload) ||
    typeof payload.sub !== "string" ||
    !("exp" in payload) ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000) ||
    ("version" in payload &&
      typeof payload.version !== "number")
  ) {
    return null;
  }

  return {
    sub: payload.sub,
    exp: payload.exp,
    version:
      "version" in payload && typeof payload.version === "number"
        ? payload.version
        : 0,
  };
}

export async function requireUser(
  role?: UserRole,
): Promise<UserDocument | Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = readSession(token);
  if (!session) return jsonError("Giriş tələb olunur.", 401);

  await connectToDatabase();
  const user = await User.findById(session.sub);
  if (!user) return jsonError("İstifadəçi tapılmadı.", 401);
  if (user.isActive === false) return jsonError("Hesab deaktiv edilib.", 403);
  if ((user.authVersion ?? 0) !== session.version) {
    return jsonError("Sessiya etibarsızdır. Yenidən daxil olun.", 401);
  }
  if (role && user.role !== role) {
    return jsonError("Bu əməliyyat üçün icazəniz yoxdur.", 403);
  }
  if (
    role === "student" &&
    (user.approvalStatus ?? "approved") !== "approved"
  ) {
    return jsonError("Hesabınız administrator tərəfindən təsdiqlənməyib.", 403);
  }
  return user;
}
