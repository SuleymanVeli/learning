import { Suspense } from "react";
import { JoinRegistration } from "@/src/components/auth/JoinRegistration";

export default function JoinGroupPage({
  params,
}: {
  params: Promise<{ accessCode: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-sm text-muted">
          Dəvət linki açılır...
        </main>
      }
    >
      {params.then(({ accessCode }) => (
        <JoinRegistration accessCode={accessCode} />
      ))}
    </Suspense>
  );
}
