import type { ReactNode } from "react";
import "./Reveal.css";

// A block that fades in when it appears instead of popping.
export function Reveal({ children }: { children: ReactNode }) {
  return <div className="ui-reveal">{children}</div>;
}
