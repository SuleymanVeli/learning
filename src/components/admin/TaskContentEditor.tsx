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

type ImageTarget =
  | { type: "block"; blockIndex: number }
  | { type: "html"; blockIndex: number; imageIndex: number };

interface HtmlImage {
  blockIndex: number;
  imageIndex: number;
  source: string;
  alt: string;
}

function getHtmlImages(blocks: TaskContentBlock[]): HtmlImage[] {
  const images: HtmlImage[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.type !== "text") return;
    const tags = block.text.match(/<img\b[^>]*>/gi) ?? [];
    tags.forEach((tag, imageIndex) => {
      const sourceMatch = tag.match(
        /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
      );
      const altMatch = tag.match(
        /\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
      );
      images.push({
        blockIndex,
        imageIndex,
        source: (sourceMatch?.[1] ?? sourceMatch?.[2] ?? sourceMatch?.[3] ?? "")
          .replace(/&amp;/gi, "&"),
        alt: (altMatch?.[1] ?? altMatch?.[2] ?? altMatch?.[3] ?? "")
          .replace(/&amp;/gi, "&"),
      });
    });
  });
  return images;
}

function replaceHtmlImageSource(
  html: string,
  imageIndex: number,
  source: string,
): string {
  let currentIndex = -1;
  const escapedSource = source
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    currentIndex += 1;
    if (currentIndex !== imageIndex) return tag;
    const sourceAttribute =
      /\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
    if (sourceAttribute.test(tag)) {
      return tag.replace(sourceAttribute, `src="${escapedSource}"`);
    }
    return tag.replace(
      /\s*\/?>$/,
      (closing) => ` src="${escapedSource}"${closing}`,
    );
  });
}

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
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const htmlImages = getHtmlImages(blocks);

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
    target?: ImageTarget,
  ) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void uploadImage(file, target);
  }

  async function uploadImage(file: File, target?: ImageTarget) {
    setError("");
    if (blocks.length >= 100 && target === undefined) {
      setError("Kontent maksimum 100 blokdan ibarət ola bilər.");
      return;
    }
    if (
      target === undefined &&
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
      if (target?.type === "block") {
        const currentBlock = next[target.blockIndex];
        if (!currentBlock || currentBlock.type !== "image") {
          throw new Error("Dəyişdiriləcək şəkil artıq mövcud deyil.");
        }
        next[target.blockIndex] = { ...currentBlock, url: result.url };
      } else if (target?.type === "html") {
        const currentBlock = next[target.blockIndex];
        if (!currentBlock || currentBlock.type !== "text") {
          throw new Error("Dəyişdiriləcək şəkil artıq mövcud deyil.");
        }
        const imageCount = currentBlock.text.match(/<img\b[^>]*>/gi)?.length ?? 0;
        if (target.imageIndex >= imageCount) {
          throw new Error("Dəyişdiriləcək şəkil artıq mövcud deyil.");
        }
        next[target.blockIndex] = {
          ...currentBlock,
          text: replaceHtmlImageSource(
            currentBlock.text,
            target.imageIndex,
            result.url,
          ),
        };
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

  async function pasteFromClipboard(target?: ImageTarget) {
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
            target,
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

  function handlePaste(
    event: ClipboardEvent<HTMLDivElement>,
    target?: ImageTarget,
  ) {
    const image = Array.from(event.clipboardData.items)
      .find((item) => SUPPORTED_IMAGE_TYPES.has(item.type))
      ?.getAsFile();
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    void uploadImage(image, target);
  }

  const previewContent = blocks
    .map((block) =>
      block.type === "text"
        ? `<div class="task-content-html">${block.text}</div>`
        : `<div><img src="${block.url.replaceAll('"', "&quot;")}" alt="${block.alt.replaceAll('"', "&quot;")}" style="width:${block.width}%;max-width:${block.maxWidthPx ?? 800}px;height:auto"></div>`,
    )
    .join("");
  const previewDocument = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data: blob:; style-src 'unsafe-inline'"><style>body{font:14px/1.6 system-ui,sans-serif;color:#1e293b;padding:12px;margin:0}.task-content-html img{height:auto;max-width:100%}.task-content-html p{margin:.75rem 0}.task-content-html table{border-collapse:collapse;width:100%}.task-content-html th,.task-content-html td{border:1px solid #cbd5e1;padding:6px}.task-content-html th{background:#f1f5f9;text-align:left}</style></head><body>${previewContent}</body></html>`;

  return (
    <div className="space-y-3" onPaste={handlePaste}>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Sualın kontenti</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={showPreview}
            onClick={() => setShowPreview((current) => !current)}
          >
            {showPreview ? "Redaktora qayıt" : "Önizləməni göstər"}
          </Button>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted">
          Mətn və şəkilləri istədiyiniz ardıcıllıqla əlavə edin. Şəkli mətn
          sahəsində Ctrl+V ilə, düymə ilə yapışdırın və ya fayldan seçin.
          Blokların yanındakı düymələrlə sıralamanı dəyişin. Yüklənən şəkillər
          açıq Blob URL ilə saxlanılır.
        </p>
      </div>

      {showPreview && (
        <section className="space-y-3 rounded-xl border border-border p-3">
          <h4 className="text-sm font-semibold">Tapşırığın önizləməsi</h4>
          <iframe
            title="Tapşırıq kontentinin önizləməsi"
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={previewDocument}
            className="h-80 w-full rounded-lg border border-border bg-white"
          />
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">
              HTML-dəki şəkillər ({htmlImages.length})
            </h4>
            {htmlImages.length ? (
              htmlImages.map((image, index) => (
                <div
                  key={`${image.blockIndex}-${image.imageIndex}`}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
                  onPaste={(event) =>
                    handlePaste(event, {
                      type: "html",
                      blockIndex: image.blockIndex,
                      imageIndex: image.imageIndex,
                    })
                  }
                >
                  {image.source ? (
                    <Image
                      src={image.source}
                      alt={image.alt}
                      width={80}
                      height={64}
                      unoptimized
                      className="h-16 w-20 rounded border border-border object-contain"
                    />
                  ) : (
                    <div className="grid h-16 w-20 place-items-center rounded border border-dashed border-border text-xs text-muted">
                      Şəkil yoxdur
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted">
                      HTML şəkli · {index + 1}
                    </p>
                    <p className="break-all text-xs text-foreground">
                      {image.source || "src atributu yoxdur"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label
                      className={`inline-flex cursor-pointer items-center justify-center rounded-xl border-2 border-border bg-transparent px-3 py-1.5 text-sm font-semibold text-foreground hover:border-brand-200 hover:bg-brand-50 ${
                        disabled || uploading
                          ? "cursor-not-allowed opacity-50"
                          : ""
                      }`}
                    >
                      {uploading ? "Yüklənir..." : "Şəkli yüklə"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="sr-only"
                        disabled={disabled || uploading}
                        onChange={(event) =>
                          handleFileChange(event, {
                            type: "html",
                            blockIndex: image.blockIndex,
                            imageIndex: image.imageIndex,
                          })
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled || uploading}
                      onClick={() =>
                        void pasteFromClipboard({
                          type: "html",
                          blockIndex: image.blockIndex,
                          imageIndex: image.imageIndex,
                        })
                      }
                    >
                      Yapışdır
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted">
                Mətn hissələrində dəyişdirilə bilən HTML şəkli tapılmadı.
              </p>
            )}
          </div>
        </section>
      )}

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
              disabled={disabled || uploading}
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
                disabled={disabled || uploading}
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
                disabled={disabled || uploading}
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
                disabled={disabled || uploading}
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
                  onChange={(event) =>
                    handleFileChange(event, { type: "block", blockIndex: index })
                  }
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
