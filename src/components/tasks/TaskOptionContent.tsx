import Image from "next/image";
import type { TaskOption } from "@/src/models/Task";

export function TaskOptionContent({
  option,
}: {
  option: TaskOption;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-3">
      {option.imageUrl && (
        <Image
          src={option.imageUrl}
          alt={option.text}
          width={option.imageWidthPx ?? 240}
          height={option.imageHeightPx ?? 160}
          unoptimized
          className="rounded-lg object-contain"
          style={{
            width: `${option.imageWidthPx ?? 240}px`,
            height: `${option.imageHeightPx ?? 160}px`,
            maxWidth: "100%",
          }}
        />
      )}
      {option.text && <span>{option.text}</span>}
    </span>
  );
}
