import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase, onValue, ref } from "firebase/database";

function getRealtimeDatabase() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const requiredValues = [
    firebaseConfig.apiKey,
    firebaseConfig.authDomain,
    firebaseConfig.databaseURL,
    firebaseConfig.projectId,
    firebaseConfig.appId,
  ];
  if (requiredValues.some((value) => !value)) {
    throw new Error("Firebase Realtime Database mühiti tam konfiqurasiya edilməyib.");
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getDatabase(app);
}

export function isRealtimeConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
}

export function subscribeToLessonSignal(
  lessonId: string,
  onSignal: () => void,
  onError: (error: Error) => void,
): (() => void) | null {
  if (!isRealtimeConfigured()) return null;
  try {
    const database = getRealtimeDatabase();
    return onValue(
      ref(database, `lessonSignals/${lessonId}`),
      (snapshot) => {
        if (snapshot.exists()) onSignal();
      },
      onError,
    );
  } catch (error) {
    onError(
      error instanceof Error
        ? error
        : new Error("Firebase Realtime Database-ə qoşulmaq mümkün olmadı."),
    );
    return () => {};
  }
}
