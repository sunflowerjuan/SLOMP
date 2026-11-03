import { useContext } from "react";
import { SlompsimContext } from "./SlompsimContext";
import type { SlompsimContextValue } from "./SlompsimContext";

export function useSlompsim(): SlompsimContextValue {
  const value = useContext(SlompsimContext);
  if (!value) {
    throw new Error("useSlompsim must be used within SlompsimProvider");
  }
  return value;
}
