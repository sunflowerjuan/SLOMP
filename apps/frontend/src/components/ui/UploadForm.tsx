import { Button } from "./Button";
import { Dropzone } from "./Dropzone";
import "./UploadForm.css";

interface UploadFormProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  // Why the file could not be used; the upload area turns into that state.
  error?: string | null;
  // Says what the button does with the file: "Procesar archivo" saves it,
  // "Revisar archivo" only reads it.
  actionLabel: string;
  // Sending this file again would change nothing.
  actionDisabled?: boolean;
  busy: boolean;
  onSubmit: () => void;
}

// An Excel to upload and the button that sends it (tax roll and payment
// orders).
export function UploadForm({
  file,
  onFileSelect,
  onClear,
  error,
  actionLabel,
  actionDisabled = false,
  busy,
  onSubmit,
}: UploadFormProps) {
  return (
    <div className="ui-upload-form">
      <Dropzone
        file={file}
        error={error}
        onFileSelect={onFileSelect}
        onClear={onClear}
      />
      <div className="ui-upload-form__actions">
        <Button
          type="button"
          disabled={!file || actionDisabled}
          loading={busy}
          onClick={onSubmit}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
