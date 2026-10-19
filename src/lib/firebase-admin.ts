import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

function getFirebaseAdminApp() {
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseURL) return null;

  const existing = getApps().find((app) => app.name === "bebras-server");
  if (existing) return existing;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!serviceAccountJson) return null;

  return initializeApp(
    {
      credential: cert(JSON.parse(serviceAccountJson) as ServiceAccount),
      databaseURL,
      projectId,
    },
    "bebras-server",
  );
}

export async function publishLessonSignal(lessonId: string) {
  try {
    const app = getFirebaseAdminApp();
    if (!app) return { synced: false, reason: "missing-database-url" as const };

    await getDatabase(app)
      .ref(`lessonSignals/${lessonId}`)
      .set({ updatedAt: Date.now() });
    return { synced: true as const };
  } catch (error) {
    console.error("Firebase live lesson signal could not be published.", error);
    return { synced: false, reason: "firebase-error" as const };
  }
}

export function isFirebaseRealtimeConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON &&
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
}
