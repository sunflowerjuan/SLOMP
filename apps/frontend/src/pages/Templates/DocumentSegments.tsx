import type { Segment } from "../../domain/templateMarking";

// Part of a paragraph, keeping its bold and italic. `data-start` is what
// reading a selection back to offsets in the block's text relies on.
export function DocumentSegments({ segments }: { segments: Segment[] }) {
  return segments.map((segment) => (
    <span
      key={segment.start}
      data-start={segment.start}
      className={
        [
          segment.bold && "marking-doc__bold",
          segment.italic && "marking-doc__italic",
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      {segment.text}
    </span>
  ));
}
