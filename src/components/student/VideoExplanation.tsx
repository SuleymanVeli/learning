"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Modal } from "@/src/components/ui/Modal";

export function VideoExplanation({
  title,
  videoUrl,
}: {
  title: string;
  videoUrl: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-100 px-4 py-2.5 font-bold text-violet-800 transition hover:bg-violet-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
      >
        <Play aria-hidden="true" className="h-4 w-4 fill-current" />
        Video izaha bax
      </button>
      <Modal
        open={open}
        title={`Video izah: ${title}`}
        size="wide"
        onClose={() => setOpen(false)}
      >
        <iframe
          src={videoUrl}
          title={`Video izah: ${title}`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="aspect-video w-full rounded-xl border-0"
        />
      </Modal>
    </>
  );
}
