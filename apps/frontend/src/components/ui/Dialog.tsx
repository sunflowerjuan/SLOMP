import { useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import "./Dialog.css";

interface DialogProps {
  open: boolean;
  title: string;
  // Called on Escape and on a click outside the box.
  onClose: () => void;
  // "wide": room for a document, e.g. a PDF preview.
  size?: "default" | "wide";
  children: ReactNode;
}

// Native <dialog>: the browser traps focus, makes the rest of the page inert,
// restores focus on close and handles Escape.
export function Dialog({
  open,
  title,
  onClose,
  size = "default",
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={ref}
      className={size === "wide" ? "ui-dialog ui-dialog--wide" : "ui-dialog"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
    >
      {open && (
        <div className="ui-dialog__box">
          <h2 className="ui-dialog__title" id={titleId}>
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
