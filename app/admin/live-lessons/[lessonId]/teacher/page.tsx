import { Suspense } from "react";
import { LiveLessonTeacherWindow } from "@/src/components/live-lessons/LiveLessonTeacherWindow";

export default function LiveLessonTeacherPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  return (
    <Suspense fallback={<main className="p-8 text-center">İzah pəncərəsi yüklənir...</main>}>
      {params.then(({ lessonId }) => (
        <LiveLessonTeacherWindow lessonId={lessonId} />
      ))}
    </Suspense>
  );
}
