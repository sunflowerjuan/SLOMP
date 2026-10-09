import { useRef } from "react";
import type { PointerEvent } from "react";

const DISTANCE = 0.35; // fraction of the width that commits the swipe
const FLICK_SPEED = 0.5; // px/ms: a quick flick commits too
const FLICK_MIN = 40; // ...but not a twitch

// Horizontal touch swipe: the element follows the finger. Past the threshold
// it calls onDismiss (the caller plays the exit from the current transform);
// otherwise it springs back. Mouse is ignored -- desktop has a close button.
// The element needs `touch-action: pan-y` so the browser leaves the
// horizontal gesture to us and keeps vertical scrolling.
export function useSwipeToDismiss<T extends HTMLElement>(
  onDismiss: (direction: 1 | -1) => void,
) {
  const ref = useRef<T>(null);
  const drag = useRef<{
    x: number;
    y: number;
    t: number;
    active: boolean;
  } | null>(null);

  function finish(event: PointerEvent<T>, cancelled: boolean) {
    const start = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!start?.active || !el) return;

    const dx = event.clientX - start.x;
    const speed = Math.abs(dx) / Math.max(event.timeStamp - start.t, 1);
    const committed =
      !cancelled &&
      (Math.abs(dx) > el.offsetWidth * DISTANCE ||
        (speed > FLICK_SPEED && Math.abs(dx) > FLICK_MIN));

    if (committed) {
      onDismiss(dx > 0 ? 1 : -1);
      return;
    }
    el.style.transition =
      "transform 320ms var(--ease-out), opacity 320ms var(--ease-out)";
    el.style.transform = "";
    el.style.opacity = "";
  }

  const bind = {
    onPointerDown(event: PointerEvent<T>) {
      if (event.pointerType !== "touch") return;
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        t: event.timeStamp,
        active: false,
      };
    },
    onPointerMove(event: PointerEvent<T>) {
      const start = drag.current;
      const el = ref.current;
      if (!start || !el) return;
      const dx = event.clientX - start.x;
      if (!start.active) {
        if (
          Math.abs(dx) < 8 ||
          Math.abs(dx) < Math.abs(event.clientY - start.y)
        )
          return;
        start.active = true;
        el.setPointerCapture(event.pointerId);
        el.style.transition = "none";
      }
      el.style.transform = `translateX(${dx}px)`;
      el.style.opacity = String(
        1 - Math.min(Math.abs(dx) / el.offsetWidth, 1) * 0.6,
      );
    },
    onPointerUp: (event: PointerEvent<T>) => finish(event, false),
    onPointerCancel: (event: PointerEvent<T>) => finish(event, true),
  };

  return { ref, bind };
}
