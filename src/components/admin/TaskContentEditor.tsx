"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import Image from "next/image";
import { Button } from "@/src/components/ui/Button";
import type { TaskContentBlock } from "@/src/models/Task";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function TaskContentEditor({
  initialBlocks,
  prompt,
  disabled,
  onChange,
}: {
  initialBlocks?: TaskContentBlock[];
  prompt: string;
  disabled: boolean;
  onChange: (blocks: TaskContentBlock[]) => void;
}) {
  const [blocks, setBlocks] = useState<TaskContentBlock[]>(() => {
    if (initialBlocks?.length) return initialBlocks;
    return prompt
      ? [{ type: "text", text: prompt }]
      : [{ type: "text", text: "" }];
  });
  const [activeTextIndex, setActiveTextIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateBlocks(next: TaskContentBlock[]) {
    setBlocks(next);
    onChange(next);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    updateBlocks(next);
    if (activeTextIndex === index) setActiveTextIndex(targetIndex);
    else if (activeTextIndex === targetIndex) setActiveTextIndex(index);
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
    replaceIndex?: number,
  ) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void uploadImage(file, replaceIndex);
  }

  async function uploadImage(file: File, replaceIndex?: number) {
    setError("");
    if (blocks.length >= 100 && replaceIndex === undefined) {
      setError("Kontent maksimum 100 blokdan ibarət ola bilər.");
      return;
    }
    if (
      replaceIndex === undefined &&
      blocks.filter((block) => block.type === "image").length >= 20
    ) {
      setError("Bir tapşırığa maksimum 20 şəkil əlavə etmək olar.");
      return;
    }
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

      const next = [...blocks];
      if (replaceIndex !== undefined) {
        const currentBlock = next[replaceIndex];
        if (!currentBlock || currentBlock.type !== "image") {
          throw new Error("Dəyişdiriləcək şəkil artıq mövcud deyil.");
        }
        next[replaceIndex] = { ...currentBlock, url: result.url };
      } else {
        const insertionIndex = Math.min(
          Math.max(activeTextIndex + 1, 0),
          next.length,
        );
        next.splice(insertionIndex, 0, {
          type: "image",
          url: result.url,
          width: 100,
          maxWidthPx: 800,
          alt: "",
        });
        setActiveTextIndex(insertionIndex + 1);
      }
      updateBlocks(next);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Şəkli yükləmək olmadı.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function pasteFromClipboard() {
    setError("");
    if (!navigator.clipboard?.read) {
      setError("Şəkli mətn sahəsində seçib Ctrl+V ilə yapışdırın.");
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) =>
          SUPPORTED_IMAGE_TYPES.has(type),
        );
        if (imageType) {
          const image = await item.getType(imageType);
          const extension = imageType.split("/")[1].replace("jpeg", "jpg");
          await uploadImage(
            new File([image], `screenshot.${extension}`, { type: imageType }),
          );
          return;
        }
      }
      setError(
        "Mübadilə buferində şəkil tapılmadı. Əvvəlcə ekran görüntüsünü köçürün.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Şəkli mübadilə buferindən oxumaq olmadı: ${cause.message}`
          : "Şəkli mətn sahəsində seçib Ctrl+V ilə yapışdırın.",
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
    <div className="space-y-3" onPaste={handlePaste}>
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Sualın kontenti</h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          Mətn və şəkilləri istədiyiniz ardıcıllıqla əlavə edin. Şəkli mətn
          sahəsində Ctrl+V ilə, düymə ilə yapışdırın və ya fayldan seçin.
          Blokların yanındakı düymələrlə sıralamanı dəyişin. Yüklənən şəkillər
          açıq Blob URL ilə saxlanılır.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || uploading || blocks.length >= 100}
          onClick={() => fileInputRef.current?.click()}
        >
          Şəkli fayldan əlavə et
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          disabled={disabled || uploading}
          onChange={handleFileChange}
        />
      </div>

      {blocks.map((block, index) =>
        block.type === "text" ? (
          <div
            key={`text-${index}`}
            className="space-y-2 rounded-xl border border-border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">
                Mətn · {index + 1}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Mətn hissəsini yuxarı qaldır, ${index + 1}`}
                  disabled={disabled || uploading || index === 0}
                  onClick={() => moveBlock(index, -1)}
                >
                  Yuxarı
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Mətn hissəsini aşağı sal, ${index + 1}`}
                  disabled={
                    disabled || uploading || index === blocks.length - 1
                  }
                  onClick={() => moveBlock(index, 1)}
                >
                  Aşağı
                </Button>
              </div>
            </div>
            <label
              htmlFor={`task-content-text-${index}`}
              className="text-xs font-medium text-muted"
            >
              Mətn hissəsi (HTML)
            </label>
            <textarea
              id={`task-content-text-${index}`}
              value={block.text}
              rows={3}
              maxLength={10000}
              disabled={disabled}
              onFocus={() => setActiveTextIndex(index)}
              onChange={(event) => {
                const next = [...blocks];
                next[index] = { type: "text", text: event.currentTarget.value };
                updateBlocks(next);
              }}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="<p>Sualın mətni...</p>&#10;<p><strong>Vacib hissə</strong></p>"
            />
            <p className="text-xs leading-5 text-muted">
              HTML teqləri istifadə edə bilərsiniz: &lt;p&gt;, &lt;strong&gt;,
              &lt;em&gt;, &lt;ul&gt;, &lt;ol&gt;, &lt;li&gt;, &lt;a
              href=&quot;...&quot;&gt;, &lt;table&gt; və başlıqlar. Təhlükəli
              teqlər yadda saxlanarkən silinir.
            </p>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || uploading || blocks.length === 1}
                onClick={() => {
                  updateBlocks(
                    blocks.filter((_, blockIndex) => blockIndex !== index),
                  );
                  setActiveTextIndex(Math.max(index - 1, 0));
                }}
              >
                Mətni sil
              </Button>
            </div>
          </div>
        ) : (
          <div
            key={`${block.url}-${index}`}
            className="space-y-3 rounded-xl border border-border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">
                Şəkil · {index + 1}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Şəkil blokunu yuxarı qaldır, ${index + 1}`}
                  disabled={disabled || uploading || index === 0}
                  onClick={() => moveBlock(index, -1)}
                >
                  Yuxarı
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Şəkil blokunu aşağı sal, ${index + 1}`}
                  disabled={
                    disabled || uploading || index === blocks.length - 1
                  }
                  onClick={() => moveBlock(index, 1)}
                >
                  Aşağı
                </Button>
              </div>
            </div>
            <Image
              src={block.url}
              alt={block.alt}
              width={1200}
              height={800}
              unoptimized
              className="h-auto max-h-64 max-w-full rounded-lg object-contain"
              style={{
                width: `${block.width}%`,
                maxWidth: `${block.maxWidthPx ?? 800}px`,
              }}
            />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Şəklin ölçüsü ({block.width}%)
              </span>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={block.width}
                disabled={disabled}
                onChange={(event) => {
                  const next = [...blocks];
                  next[index] = {
                    ...block,
                    width: Number(event.currentTarget.value),
                  };
                  updateBlocks(next);
                }}
                className="w-full accent-brand-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Maksimum en (piksel)
              </span>
              <input
                type="number"
                min={1}
                max={4096}
                step={1}
                value={block.maxWidthPx ?? 800}
                disabled={disabled}
                onChange={(event) => {
                  const maxWidthPx = Number(event.currentTarget.value);
                  if (
                    !Number.isInteger(maxWidthPx) ||
                    maxWidthPx < 1 ||
                    maxWidthPx > 4096
                  ) {
                    return;
                  }
                  const next = [...blocks];
                  next[index] = { ...block, maxWidthPx };
                  updateBlocks(next);
                }}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Şəkil üçün qısa təsvir (istəyə görə)
              </span>
              <input
                value={block.alt}
                maxLength={300}
                disabled={disabled}
                onChange={(event) => {
                  const next = [...blocks];
                  next[index] = { ...block, alt: event.currentTarget.value };
                  updateBlocks(next);
                }}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <div className="flex flex-wrap justify-between gap-2">
              <label
                className={`inline-flex cursor-pointer items-center justify-center rounded-xl border-2 border-border bg-transparent px-3 py-1.5 text-sm font-semibold text-foreground hover:border-brand-200 hover:bg-brand-50 ${
                  disabled || uploading ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                {uploading ? "Yüklənir..." : "Şəkli dəyiş"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="sr-only"
                  disabled={disabled || uploading}
                  onChange={(event) => handleFileChange(event, index)}
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={disabled || uploading}
                onClick={() =>
                  updateBlocks(
                    blocks.filter((_, blockIndex) => blockIndex !== index),
                  )
                }
              >
                Şəkli sil
              </Button>
            </div>
          </div>
        ),
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || uploading || blocks.length >= 100}
          onClick={() => {
            updateBlocks([...blocks, { type: "text", text: "" }]);
            setActiveTextIndex(blocks.length);
          }}
        >
          Mətn əlavə et
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || uploading || blocks.length >= 100}
          onClick={() => void pasteFromClipboard()}
        >
          {uploading ? "Şəkil yüklənir..." : "Şəkil yapışdır"}
        </Button>
      </div>
    </div>
  );
}
