import { clearSessionCookie } from "@/src/lib/auth";

export async function POST() {
  await clearSessionCookie();
  return Response.json({ success: true });
}
