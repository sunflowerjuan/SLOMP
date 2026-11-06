import type { MarkingProblem, TextRange } from "../../domain/templateMarking";

// Turns what the lawyer selected with the mouse (or a finger) into offsets of
// one paragraph's text. Every piece of document text is rendered in a span
// with `data-start` (its offset in the block); labels and buttons inside a
// highlight have none, so they never count.

const BLOCK_SELECTOR = "[data-block-id]";
const TEXT_SELECTOR = "[data-start]";

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function blockOf(node: Node, root: HTMLElement): HTMLElement | null {
  const block = elementOf(node)?.closest<HTMLElement>(BLOCK_SELECTOR);
  return block && root.contains(block) ? block : null;
}

function textLength(block: HTMLElement): number {
  return Number(block.dataset.length ?? 0);
}

// Offset in the block's text of a DOM point (node, offset) inside it: the
// text spans before the point count whole, the one that holds it in part.
function offsetIn(block: HTMLElement, node: Node, offset: number): number {
  const point = document.createRange();
  point.setStart(node, offset);
  let result = 0;
  for (const span of block.querySelectorAll<HTMLElement>(TEXT_SELECTOR)) {
    const text = span.firstChild;
    if (!text) continue;
    const start = Number(span.dataset.start);
    const length = text.textContent?.length ?? 0;
    if (point.comparePoint(text, length) <= 0) {
      result = start + length;
    } else if (point.comparePoint(text, 0) >= 0) {
      break;
    } else {
      return start + offset;
    }
  }
  return result;
}

export type SelectionResult =
  | { kind: "none" }
  | { kind: "problem"; problem: MarkingProblem }
  | { kind: "range"; range: TextRange };

// The current selection inside `root`, as a range of one block. A triple
// click selects a paragraph up to the start of the next one: that counts as
// the first paragraph only.
export function readSelection(root: HTMLElement): SelectionResult {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { kind: "none" };
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return { kind: "none" };

  const startBlock = blockOf(range.startContainer, root);
  let endBlock = blockOf(range.endContainer, root);
  if (!startBlock || !endBlock)
    return { kind: "problem", problem: "CROSSES_BLOCKS" };

  const start = offsetIn(startBlock, range.startContainer, range.startOffset);
  let end = offsetIn(endBlock, range.endContainer, range.endOffset);
  if (endBlock !== startBlock && end === 0) {
    endBlock = startBlock;
    end = textLength(startBlock);
  }
  if (endBlock !== startBlock) {
    return { kind: "problem", problem: "CROSSES_BLOCKS" };
  }
  return {
    kind: "range",
    range: { blockId: startBlock.dataset.blockId!, start, end },
  };
}

export function clearSelection(): void {
  window.getSelection()?.removeAllRanges();
}
