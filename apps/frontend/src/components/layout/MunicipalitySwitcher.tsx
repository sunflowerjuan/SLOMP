import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { moveMenuFocus } from "./menuFocus";
import { MunicipalityOptions } from "./MunicipalityOptions";
import type { MunicipalitySwitch } from "./MunicipalityOptions";

// Desktop: the active municipality under SLOMP, as a control that opens the
// list (SL-122, section 7). On a phone the same options live in the logo menu.
export function MunicipalitySwitcher({
  switcher,
}: {
  switcher: MunicipalitySwitch;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape (back to the button) or a click elsewhere closes it.
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === "keydown") {
        if ((event as KeyboardEvent).key !== "Escape") return;
        buttonRef.current?.focus();
      } else if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="admin-layout__switcher">
      <button
        ref={buttonRef}
        type="button"
        className="admin-layout__switcher-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          switcher.activeLabel
            ? `Municipio: ${switcher.activeLabel}`
            : "Elegir municipio"
        }
        onClick={() => setOpen((value) => !value)}
      >
        <span className="admin-layout__switcher-label">
          {switcher.activeLabel ?? "Elige un municipio"}
        </span>
        <Icon>
          <path d="M4 6l4 4 4-4" />
        </Icon>
      </button>
      {open && (
        <div
          className="admin-layout__menu admin-layout__menu--switcher"
          role="menu"
          aria-label="Municipios"
          onKeyDown={moveMenuFocus}
        >
          <MunicipalityOptions
            switcher={switcher}
            onDone={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
