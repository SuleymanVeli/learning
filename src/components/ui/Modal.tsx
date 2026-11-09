"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  size?: "default" | "wide" | "full";
  fullBleed?: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({
  open,
  title,
  description,
  size = "default",
  fullBleed = false,
  onClose,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return <></>;

  return (
    <dialog
      ref={dialogRef}
      aria-label={fullBleed ? title || "Ön baxış pəncərəsi" : undefined}
      aria-labelledby={fullBleed ? undefined : titleId}
      aria-describedby={!fullBleed && description ? descriptionId : undefined}
      onCancel={(event) => event.preventDefault()}
      className={`text-foreground backdrop:bg-slate-950/40 ${
        fullBleed
          ? "fixed inset-0 m-0 flex h-dvh max-h-none w-screen max-w-none flex-col overflow-hidden border-0 bg-surface p-0 shadow-none"
          : `m-auto border border-border bg-surface p-0 shadow-2xl ${
              size === "full"
                ? "flex h-[calc(100%-1rem)] max-h-none w-[calc(100%-1rem)] max-w-none flex-col overflow-hidden rounded-2xl"
                : size === "wide"
                  ? "max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl"
                  : "max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl"
            }`
      }`}
    >
      {!fullBleed && (
        <div className="relative border-b border-border px-6 py-5 pr-14">
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted">
              {description}
            </p>
          )}
        </div>
      )}      
        <button
          type="button"
          aria-label="Bağla"
          title="Bağla"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-surface/90 text-muted shadow-sm transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-5 w-5"
          >
            <path d="m18 6-12 12M6 6l12 12" />
          </svg>
        </button>
      
      <div
        className={
          fullBleed
            ? "min-h-0 flex-1 overflow-y-auto"
            : size === "full"
              ? "min-h-0 flex-1 overflow-y-auto p-6"
              : "p-6"
        }
      >
        {children}
      </div>
    </dialog>
  );
}
