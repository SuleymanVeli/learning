import Image from "next/image";
import type { TaskContentBlock } from "@/src/models/Task";

export function TaskContent({
  contentBlocks,
  prompt,
  className = "",
}: {
  contentBlocks?: TaskContentBlock[];
  prompt: string;
  className?: string;
}) {
  const blocks: TaskContentBlock[] = contentBlocks ?? [];

  return (
    <div className={`space-y-4 ${className}`}>
      {blocks.length
        ? blocks.map((block, index) =>
            block.type === "text" ? (
              <div
                key={`text-${index}`}
                className="task-content-html text-sm leading-6 text-foreground"
                dangerouslySetInnerHTML={{ __html: block.text }}
              />
            ) : (
              <div key={`${block.url}-${index}`}>
                <Image
                  src={block.url}
                  alt={block.alt}
                  width={1200}
                  height={800}
                  unoptimized
                  className="h-auto max-w-full rounded-xl"
                  style={{
                    width: `${block.width}%`,
                    maxWidth: `${block.maxWidthPx ?? 800}px`,
                  }}
                />
              </div>
            ),
          )
        : prompt && (
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {prompt}
          </p>
        )}
    </div>
  );
}
