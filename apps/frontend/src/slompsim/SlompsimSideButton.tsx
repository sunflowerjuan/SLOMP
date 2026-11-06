import { SLOMPSIM_PANEL_ID } from "./SlompsimContext";
import { SlompsimIcon } from "./SlompsimIcon";
import { useSlompsim } from "./useSlompsim";
import "./SlompsimOpenButtons.css";

// Desktop: below the sections. It opens a panel, it isn't a section, so it
// never gets the sliding pill.
export function SlompsimSideButton() {
  const { isOpen, open, close } = useSlompsim();
  return (
    <>
      <hr className="slompsim-side-separator" />
      <button
        type="button"
        className="admin-layout__menu-item slompsim-side-button"
        aria-expanded={isOpen}
        aria-controls={SLOMPSIM_PANEL_ID}
        onClick={() => (isOpen ? close({ returnFocus: false }) : open())}
      >
        <SlompsimIcon />
        Slompsim
      </button>
    </>
  );
}
