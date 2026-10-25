"use client";

import Image from "next/image";
import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/ui/Input";
import type { TaskOption } from "@/src/models/Task";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function TaskOptionEditor({
  option,
  label,
  correct,
  correctInputType,
  showCorrectControl = true,
  disabled,
  onChange,
  onCorrectChange,
  onRemove,
}: {
  option: TaskOption;
  label: string;
  correct: boolean;
  correctInputType: "checkbox" | "radio";
  showCorrectControl?: boolean;
  disabled: boolean;
  onChange: (option: TaskOption) => void;
  onCorrectChange: () => void;
  onRemove?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void uploadImage(file);
  }

  async function uploadImage(file: File) {
    setError("");
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setError("PNG, JPEG, GIF və ya WebP şəkli seçin.");
      return;
    }
    if (file.size === 0 || file.size > MAX_IMAGE_SIZE) {
      setError("Şəklin ölçüsü 4 MB-dan çox olmamalıdır.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/task-images", {
        method: "POST",
        body: formData,
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result !== null &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Şəkli yükləmək olmadı.";
        throw new Error(message);
      }
      if (
        result === null ||
        typeof result !== "object" ||
        !("url" in result) ||
        typeof result.url !== "string"
      ) {
        throw new Error("Şəkil yükləndi, amma onun ünvanı alınmadı.");
      }
      onChange({
        ...option,
        imageUrl: result.url,
        imageWidthPx: option.imageWidthPx ?? 240,
        imageHeightPx: option.imageHeightPx ?? 160,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Şəkli yükləmək olmadı.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function pasteImage() {
    setError("");
    if (!navigator.clipboard?.read) {
      setError("Şəkli variant sahəsində Ctrl+V ilə yapışdırın.");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((candidate) =>
          SUPPORTED_IMAGE_TYPES.has(candidate),
        );
        if (!type) continue;
        const image = await item.getType(type);
        const extension = type.split("/")[1].replace("jpeg", "jpg");
        await uploadImage(
          new File([image], `variant.${extension}`, { type }),
        );
        return;
      }
      setError("Mübadilə buferində şəkil tapılmadı.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Şəkli mübadilə buferindən oxumaq olmadı: ${cause.message}`
          : "Şəkli variant sahəsində Ctrl+V ilə yapışdırın.",
      );
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const image = Array.from(event.clipboardData.items)
      .find((item) => SUPPORTED_IMAGE_TYPES.has(item.type))
      ?.getAsFile();
    if (!image) return;
    event.preventDefault();
    void uploadImage(image);
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-border p-3"
      onPaste={handlePaste}
    >
      <div className="flex flex-wrap items-center gap-3">
        {showCorrectControl && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type={correctInputType}
              name="correctOption"
              value={option.id}
              checked={correct}
              disabled={disabled}
              onChange={onCorrectChange}
              className="h-5 w-5 accent-brand-600"
            />
            Düzgün variant
          </label>
        )}
        <span className="text-sm font-semibold text-muted">{label}</span>
        {onRemove && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={onRemove}
            className="ml-auto"
          >
            Sil
          </Button>
        )}
      </div>
      <Input
        label="Variant mətni (istəyə görə)"
        value={option.text}
        disabled={disabled}
        maxLength={1000}
        onChange={(event) => onChange({ ...option, text: event.currentTarget.value })}
      />
      {option.imageUrl ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Image
            src={option.imageUrl}
            alt={option.text}
            width={option.imageWidthPx ?? 240}
            height={option.imageHeightPx ?? 160}
            unoptimized
            className="max-w-full rounded-lg border border-border object-contain"
            style={{
              width: `${option.imageWidthPx ?? 240}px`,
              height: `${option.imageHeightPx ?? 160}px`,
            }}
          />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Input
              label="Eni (px)"
              type="number"
              min={1}
              max={4096}
              value={option.imageWidthPx ?? 240}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...option,
                  imageWidthPx: Number(event.currentTarget.value),
                })
              }
            />
            <Input
              label="Hündürlüyü (px)"
              type="number"
              min={1}
              max={4096}
              value={option.imageHeightPx ?? 160}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...option,
                  imageHeightPx: Number(event.currentTarget.value),
                })
              }
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() =>
              onChange({
                id: option.id,
                text: option.text,
              })
            }
          >
            Şəkli sil
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "Yüklənir..." : "Şəkli fayldan seç"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          disabled={disabled || uploading}
          onChange={handleFileChange}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => void pasteImage()}
        >
          Şəkli yapışdır
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
    </div>
  );
}
