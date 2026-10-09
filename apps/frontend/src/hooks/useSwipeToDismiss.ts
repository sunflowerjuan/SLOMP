import { useRef } from "react";
import type { PointerEvent } from "react";

const DISTANCE = 0.35; // fraction of the size that commits the swipe
const FLICK_SPEED = 0.5; // px/ms: a quick flick commits too
const FLICK_MIN = 40; // ...but not a twitch
const SNAP_BACK_MS = 320;

interface Options {
  // "x": either side (a card). "y": downward only (a bottom sheet).
  axis?: "x" | "y";
  // Touch swipes only count while this media query matches.
  media?: string;
}

// Touch swipe to dismiss: the element follows the finger. Past the threshold
// it calls onDismiss; otherwise it springs back. Mouse is ignored -- desktop
// has a close button. The gesture surface needs `touch-action: pan-y` (x) or
// `pan-x` (y) so the browser leaves this axis to us.
//
// Exit: for "x" the inline transform stays, so the caller's exit animation
// starts from where the finger left it. For "y" the inline styles are
// released, so the sheet's own closed-state transition takes over from there.
export function useSwipeToDismiss<T extends HTMLElement>(
  onDismiss: (direction: 1 | -1) => void,
  { axis = "x", media }: Options = {},
) {
  const ref = useRef<T>(null);
  const drag = useRef<{
    x: number;
    y: number;
    t: number;
    active: boolean;
  } | null>(null);
  const horizontal = axis === "x";

  const along = (event: PointerEvent, start: { x: number; y: number }) =>
    horizontal ? event.clientX - start.x : Math.max(event.clientY - start.y, 0);
  const across = (event: PointerEvent, start: { x: number; y: number }) =>
    horizontal ? event.clientY - start.y : event.clientX - start.x;

  function finish(event: PointerEvent<T>, cancelled: boolean) {
    const start = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!start?.active || !el) return;

    const distance = along(event, start);
    const size = horizontal ? el.offsetWidth : el.offsetHeight;
    const speed = Math.abs(distance) / Math.max(event.timeStamp - start.t, 1);
    const committed =
      !cancelled &&
      (Math.abs(distance) > size * DISTANCE ||
        (speed > FLICK_SPEED && Math.abs(distance) > FLICK_MIN));

    if (committed) {
      onDismiss(distance > 0 ? 1 : -1);
      if (!horizontal) {
        el.style.transition = "";
        el.style.transform = "";
      }
      return;
    }
    el.style.transition = `transform ${SNAP_BACK_MS}ms var(--ease-out), opacity ${SNAP_BACK_MS}ms var(--ease-out)`;
    el.style.transform = "";
    el.style.opacity = "";
    // The inline transition must not outlive the spring-back: it would
    // override the stylesheet's own transitions.
    setTimeout(() => {
      if (!drag.current) el.style.transition = "";
    }, SNAP_BACK_MS);
  }

  const bind = {
    onPointerDown(event: PointerEvent<T>) {
      if (event.pointerType !== "touch") return;
      if (media && !window.matchMedia(media).matches) return;
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
      const distance = along(event, start);
      if (!start.active) {
        if (
          Math.abs(distance) < 8 ||
          Math.abs(distance) < Math.abs(across(event, start))
        )
          return;
        start.active = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        el.style.transition = "none";
      }
      if (horizontal) {
        el.style.transform = `translateX(${distance}px)`;
        el.style.opacity = String(
          1 - Math.min(Math.abs(distance) / el.offsetWidth, 1) * 0.6,
        );
      } else {
        el.style.transform = `translateY(${distance}px)`;
      }
    },
    onPointerUp: (event: PointerEvent<T>) => finish(event, false),
    onPointerCancel: (event: PointerEvent<T>) => finish(event, true),
  };

  return { ref, bind };
}
