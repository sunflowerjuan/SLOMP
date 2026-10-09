import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, PointerEvent } from "react";

// An indicator that slides under the active item of a list (sidebar nav,
// segmented control) and can also be dragged: the items inside the container
// carry `data-slide-item`, and the container must be `position: relative`.
// Clicks, links and keyboard keep working natively; the drag only adds a way
// to throw the indicator towards another item.

const DRAG_THRESHOLD_PX = 5;
const SUPPRESS_CLICK_MS = 120;
// Same projection iOS uses to decide where a flick would come to rest.
const DECELERATION_RATE = 0.998;

type Axis = "x" | "y";
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function measureItems(container: HTMLElement): Box[] {
  return [...container.querySelectorAll<HTMLElement>("[data-slide-item]")].map(
    (el) => ({
      x: el.offsetLeft,
      y: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    }),
  );
}

function axisOf(boxes: Box[]): Axis {
  if (boxes.length < 2) return "x";
  return Math.abs(boxes[1].y - boxes[0].y) > Math.abs(boxes[1].x - boxes[0].x)
    ? "y"
    : "x";
}

export function useSlidingIndicator<T extends HTMLElement>(
  activeIndex: number,
  onSelect: (index: number) => void,
) {
  const containerRef = useRef<T>(null);
  const onSelectRef = useRef(onSelect);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const gesture = useRef<{
    startX: number;
    startY: number;
    dragging: boolean;
    samples: { pos: number; time: number }[];
  } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  const measure = useCallback(() => {
    if (containerRef.current) setBoxes(measureItems(containerRef.current));
  }, []);

  useLayoutEffect(measure, [measure, activeIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [measure]);

  const axis = axisOf(boxes);
  const active = boxes[activeIndex];

  function pointerPos(event: PointerEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    return axis === "x" ? event.clientX - rect.left : event.clientY - rect.top;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !active) return;
    gesture.current = {
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      samples: [],
    };
  }

  function onPointerMove(event: PointerEvent) {
    const current = gesture.current;
    if (!current || !active) return;
    const moved =
      axis === "x"
        ? event.clientX - current.startX
        : event.clientY - current.startY;
    if (!current.dragging) {
      if (Math.abs(moved) < DRAG_THRESHOLD_PX) return;
      current.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const size = axis === "x" ? active.width : active.height;
    const first = boxes[0];
    const last = boxes[boxes.length - 1];
    const min = axis === "x" ? first.x : first.y;
    const max = axis === "x" ? last.x : last.y;
    const pos = Math.min(max, Math.max(min, pointerPos(event) - size / 2));
    current.samples = [
      ...current.samples.slice(-3),
      { pos, time: event.timeStamp },
    ];
    setDragPos(pos);
  }

  function endGesture() {
    const current = gesture.current;
    gesture.current = null;
    if (!current?.dragging) return;

    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), SUPPRESS_CLICK_MS);

    const { samples } = current;
    const last = samples[samples.length - 1];
    const first = samples[0];
    const elapsed = Math.max(1, last.time - first.time);
    const velocity = ((last.pos - first.pos) / elapsed) * 1000;
    const rest =
      last.pos +
      (velocity / 1000) * (DECELERATION_RATE / (1 - DECELERATION_RATE));
    const size = axis === "x" ? active.width : active.height;
    const centers = boxes.map(
      (box) => (axis === "x" ? box.x : box.y) + size / 2,
    );
    const target = centers.reduce(
      (best, center, index) =>
        Math.abs(center - (rest + size / 2)) <
        Math.abs(centers[best] - (rest + size / 2))
          ? index
          : best,
      0,
    );
    setDragPos(null);
    if (target !== activeIndex) onSelectRef.current(target);
  }

  const dragging = dragPos !== null;
  const indicatorStyle: CSSProperties | undefined = active
    ? {
        width: active.width,
        height: active.height,
        transform: `translate(${
          axis === "x" ? (dragPos ?? active.x) : active.x
        }px, ${axis === "y" ? (dragPos ?? active.y) : active.y}px)`,
      }
    : undefined;

  return {
    containerRef,
    indicatorStyle,
    dragging,
    axis,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endGesture,
      onPointerCancel: endGesture,
      onClickCapture: (event: React.MouseEvent) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
    },
  };
}
