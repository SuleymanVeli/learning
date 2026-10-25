"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  size?: "default" | "full";
  onClose: () => void;
  children: ReactNode;
}

export function Modal({
  open,
  title,
  description,
  size = "default",
  onClose,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`m-auto border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-slate-950/40 ${
        size === "full"
          ? "flex h-[calc(100%-1rem)] max-h-none w-[calc(100%-1rem)] max-w-none flex-col overflow-hidden rounded-2xl"
          : "max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl"
      }`}
    >
      <div className="border-b border-border px-6 py-5">
        <h2 id={titleId} className="text-xl font-bold">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted">
            {description}
          </p>
        )}
      </div>
      <div className={size === "full" ? "min-h-0 flex-1 overflow-y-auto p-6" : "p-6"}>
        {children}
      </div>
    </dialog>
  );
}
