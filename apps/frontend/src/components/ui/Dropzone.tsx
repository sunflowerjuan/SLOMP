import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
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

// Estado visual del Dropzone. Nombres tomados directo del componente en Figma.
// "idle" esta verificado contra el nodo 10:12 del archivo "Tributaria Predial".
// "dragover" / "uploaded" / "error" NO se pudieron verificar en esta tarea (el
// MCP de Figma llego a su limite de llamadas del plan Starter): el layout y
// el copy de esos tres estados son un criterio razonable, consistente con el
// tono de "idle", pero alguien del equipo debe revisarlos contra el diseño
// real en Figma cuando el limite del plan se libere.
type DropzoneState = "idle" | "dragover" | "uploaded" | "error";

export function Dropzone({
  file,
  error,
  accept = ".xlsx,.csv",
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

  function handleZoneClick() {
    if (state !== "uploaded") {
      openFileDialog();
    }
  }

  function handleZoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (state !== "uploaded" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openFileDialog();
    }
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

  return (
    <div
      className={`ui-dropzone ui-dropzone--${state}`}
      role="button"
      tabIndex={0}
      onClick={handleZoneClick}
      onKeyDown={handleZoneKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="ui-dropzone__input"
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
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
          >
            Quitar
          </button>
        </div>
      ) : (
        <>
          <span className="ui-dropzone__icon" aria-hidden="true">
            +
          </span>
          {state === "error" ? (
            <p className="ui-dropzone__error">{error}</p>
          ) : (
            <>
              <p className="ui-dropzone__text">
                Arrastra tu archivo aquí o haz clic para seleccionar
              </p>
              <p className="ui-dropzone__hint">.xlsx o .csv — máximo 10 MB</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
