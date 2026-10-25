"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/Button";
import { Modal } from "@/src/components/ui/Modal";

export interface ScoreLeaderboardEntry {
  studentId: string;
  name: string;
  rank: number;
  answered: number;
  correct: number;
  incorrect: number;
  isCurrentStudent: boolean;
}

export function ScoreLeaderboard({
  title,
  description = "Düzgün cavab çox, səhv cavab az olduqca sıralamada yüksəlirsən.",
  entries = [],
  loadEntries,
  buttonLabel = "🏆 Sıralama",
}: {
  title: string;
  description?: string;
  entries?: ScoreLeaderboardEntry[];
  loadEntries?: () => Promise<ScoreLeaderboardEntry[]>;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loadedLeaderboard, setLoadedLeaderboard] =
    useState<ScoreLeaderboardEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const leaderboard = loadedLeaderboard ?? entries;

  async function openLeaderboard() {
    setOpen(true);
    if (!loadEntries) return;
    setLoading(true);
    setError("");
    try {
      setLoadedLeaderboard(await loadEntries());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Skor cədvəlini yükləmək olmadı.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="shrink-0"
        onClick={() => void openLeaderboard()}
      >
        {buttonLabel}
      </Button>
      <Modal
        open={open}
        title={title}
        description={description}
        onClose={() => setOpen(false)}
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-muted">
            Skor cədvəli yüklənir...
          </p>
        ) : error ? (
          <p role="alert" className="text-sm text-danger-600">{error}</p>
        ) : leaderboard.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Yer</th>
                  <th scope="col" className="px-4 py-3">Şagird</th>
                  <th scope="col" className="px-4 py-3 text-center">İşlənib</th>
                  <th scope="col" className="px-4 py-3 text-center">Düz</th>
                  <th scope="col" className="px-4 py-3 text-center">Səhv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaderboard.map((student) => (
                  <tr
                    key={student.studentId}
                    className={
                      student.isCurrentStudent
                        ? "bg-brand-50 font-bold text-brand-900"
                        : "text-foreground"
                    }
                  >
                    <td className="px-4 py-3 tabular-nums">
                      {student.rank <= 3
                        ? ["🥇", "🥈", "🥉"][student.rank - 1]
                        : student.rank}
                    </td>
                    <th scope="row" className="px-4 py-3 text-left font-semibold">
                      {student.name}
                      {student.isCurrentStudent && (
                        <span className="ml-2 text-xs font-medium text-brand-700">
                          (Sən)
                        </span>
                      )}
                    </th>
                    <td className="px-4 py-3 text-center tabular-nums">
                      {student.answered}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-success-600 tabular-nums">
                      {student.correct}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-danger-600 tabular-nums">
                      {student.incorrect}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Bu qrupda sıralama üçün şagird yoxdur.
          </p>
        )}
      </Modal>
    </>
  );
}
