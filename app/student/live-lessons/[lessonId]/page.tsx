import { Suspense } from "react";
import { LiveLessonDetail } from "@/src/components/live-lessons/LiveLessonDetail";

export default function StudentLiveLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  return (
    <Suspense fallback={<main className="p-12 text-center">Dərs yüklənir...</main>}>
      {params.then(({ lessonId }) => (
        <LiveLessonDetail lessonId={lessonId} role="student" />
      ))}
    </Suspense>
  );
}
