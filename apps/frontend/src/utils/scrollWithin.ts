// Brings an element into view by scrolling only the nearest area that
// scrolls (the document of the marking screen, a screen's body), never the
// page around it. scrollIntoView() and a plain focus() also scroll every
// ancestor they can, the page included, when that area alone can't center
// the element (near its end): the whole panel then slides up and leaves a
// blank strip.

function scrollArea(element: Element): HTMLElement | null {
  for (
    let current = element.parentElement;
    current && current !== document.body;
    current = current.parentElement
  ) {
    const { overflowY } = getComputedStyle(current);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
  }
  return null;
}

// "center": the element in the middle, e.g. to show where a marker is.
// "nearest": only as much as it takes, e.g. moving the keyboard focus.
export function scrollWithin(
  element: Element,
  block: "center" | "nearest" = "nearest",
): void {
  const area = scrollArea(element);
  if (!area) return;
  const box = element.getBoundingClientRect();
  const view = area.getBoundingClientRect();
  let delta = 0;
  if (block === "center") {
    delta = box.top + box.height / 2 - (view.top + view.height / 2);
  } else if (box.top < view.top) {
    delta = box.top - view.top;
  } else if (box.bottom > view.bottom) {
    delta = box.bottom - view.bottom;
  }
  if (delta === 0) return;
  // Only showing a place glides there; following the keyboard focus jumps,
  // so nothing is still moving once the next thing opens.
  const smooth =
    block === "center" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  area.scrollBy({ top: delta, behavior: smooth ? "smooth" : "auto" });
}

// Focus without letting the browser scroll the page, then show the element
// within its own area.
export function focusWithin(element: HTMLElement | null | undefined): void {
  if (!element) return;
  element.focus({ preventScroll: true });
  scrollWithin(element);
}
