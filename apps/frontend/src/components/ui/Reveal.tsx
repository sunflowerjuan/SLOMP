import type { ReactNode } from "react";
import "./Reveal.css";

// A block that grows into place when it appears instead of shoving what is
// below it. Meant for notices inside a flex column: the container sets
// --reveal-gap to its own gap, which the animation cancels at the start.
export function Reveal({ children }: { children: ReactNode }) {
  return (
    <div className="ui-reveal">
      <div>{children}</div>
    </div>
  );
}
