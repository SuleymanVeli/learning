import "server-only";
import sanitizeHtml from "sanitize-html";
import type { TaskContentBlock } from "@/src/models/Task";

const TASK_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "a",
    "b",
    "blockquote",
    "br",
    "caption",
    "code",
    "del",
    "div",
    "em",
    "h2",
    "h3",
    "h4",
    "hr",
    "i",
    "ins",
    "li",
    "mark",
    "ol",
    "p",
    "pre",
    "s",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
};

export function sanitizeTaskHtml(html: string) {
  return sanitizeHtml(html, TASK_HTML_OPTIONS);
}

export function sanitizeTaskContentBlocks(
  blocks: TaskContentBlock[] | undefined,
): TaskContentBlock[] {
  return (
    blocks?.map((block) =>
      block.type === "text"
        ? { ...block, text: sanitizeTaskHtml(block.text) }
        : block,
    ) ?? []
  );
}
