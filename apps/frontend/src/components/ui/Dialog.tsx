import { useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import "./Dialog.css";

interface DialogProps {
  open: boolean;
  title: string;
  // Called on Escape and on a click outside the box.
  onClose: () => void;
  children: ReactNode;
}

// Native <dialog>: the browser traps focus, makes the rest of the page inert,
// restores focus on close and handles Escape.
export function Dialog({ open, title, onClose, children }: DialogProps) {
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
      className="ui-dialog"
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
