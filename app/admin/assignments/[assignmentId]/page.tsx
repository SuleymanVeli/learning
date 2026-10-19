import { Suspense } from "react";
import { AdminHomeworkResults } from "@/src/components/admin/AdminHomeworkResults";

export default function AdminAssignmentResultsPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  return (
    <Suspense fallback={<main className="p-12 text-center">Nəticələr yüklənir...</main>}>
      {params.then(({ assignmentId }) => (
        <AdminHomeworkResults assignmentId={assignmentId} />
      ))}
    </Suspense>
  );
}
