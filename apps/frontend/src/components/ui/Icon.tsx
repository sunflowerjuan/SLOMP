import type { ReactNode } from "react";

interface IconProps {
  // Side of the square viewBox the glyph is drawn in.
  box?: 16 | 24;
  children: ReactNode;
}

// One stroke style for every glyph; size and color come from the parent CSS.
export function Icon({ box = 16, children }: IconProps) {
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
