import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import "./Dropzone.css";

interface DropzoneProps {
  file: File | null;
  error?: string;
  accept?: string;
  onFileSelect: (file: File) => void;
  onClear: () => void;
}

function formatFileSize(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(0)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

type DropzoneState = "idle" | "dragover" | "uploaded" | "error";

export function Dropzone({
  file,
  error,
  accept = ".xlsx",
  onFileSelect,
  onClear,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const state: DropzoneState = error
    ? "error"
    : file
      ? "uploaded"
      : isDraggingOver
        ? "dragover"
        : "idle";

  function openFileDialog() {
    inputRef.current?.click();
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(true);
  }

  function handleDragLeave() {
    setIsDraggingOver(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) {
      onFileSelect(droppedFile);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
    event.target.value = "";
  }

  const hint = `${accept.split(",").join(" o ")} — máximo 10 MB`;

  return (
    <div
      className={`ui-dropzone ui-dropzone--${state}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="ui-dropzone__input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleInputChange}
      />

      {state === "uploaded" && file ? (
        <div className="ui-dropzone__file">
          <span className="ui-dropzone__file-name">{file.name}</span>
          <span className="ui-dropzone__file-size">
            {formatFileSize(file.size)}
          </span>
          <button
            type="button"
            className="ui-dropzone__remove"
            onClick={onClear}
          >
            Quitar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="ui-dropzone__pick"
          onClick={openFileDialog}
        >
          <span className="ui-dropzone__icon" aria-hidden="true">
            +
          </span>
          {state === "error" ? (
            <span className="ui-dropzone__error" role="alert">
              {error}
            </span>
          ) : (
            <>
              <span className="ui-dropzone__text">
                Arrastra tu archivo aquí o haz clic para seleccionar
              </span>
              <span className="ui-dropzone__hint">{hint}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
