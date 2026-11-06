import { useContext } from "react";
import { Button } from "../components/ui/Button";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { SLOMPSIM_PANEL_ID, SlompsimContext } from "./SlompsimContext";
import { SlompsimIcon } from "./SlompsimIcon";
import "./SlompsimOpenButtons.css";

// Phone: the bottom bar has no room, so every screen carries it in its title
// row. A screen outside the panel has no provider and shows nothing.
export function SlompsimHeadButton() {
  const slompsim = useContext(SlompsimContext);
  const isCompact = useMediaQuery("(max-width: 900px)");
  if (!slompsim || !isCompact) return null;
  return (
    <Button
      variant="secondary"
      className="slompsim-head-button"
      aria-label="Abrir Slompsim"
      aria-expanded={slompsim.isOpen}
      aria-controls={SLOMPSIM_PANEL_ID}
      onClick={slompsim.open}
    >
      <SlompsimIcon />
    </Button>
  );
}
