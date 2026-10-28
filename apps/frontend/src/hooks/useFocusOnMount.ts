import { useEffect, useRef } from "react";

// The field a screen starts on: focused once, when the screen appears.
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
