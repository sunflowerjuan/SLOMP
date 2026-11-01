import { useEffect, useRef, useState } from "react";
import "./Toast.css";

interface ToastProps {
  message: string | null;
  // How long it stays; a long sentence needs more.
  durationMs?: number;
  // Its time is up: the owner clears the message.
  onExpire: () => void;
}

// Always mounted so screen readers pick up the text when it changes. It stays
// while the pointer rests on it.
export function Toast({ message, durationMs = 2400, onExpire }: ToastProps) {
  const [hovered, setHovered] = useState(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (!message || hovered) return;
    const timer = setTimeout(() => onExpireRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [message, hovered, durationMs]);

  return (
    <div
      className="ui-toast"
      data-visible={Boolean(message)}
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {message}
    </div>
  );
}
