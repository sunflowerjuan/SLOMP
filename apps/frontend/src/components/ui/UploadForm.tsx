import { Button } from "./Button";
import { Dropzone } from "./Dropzone";
import "./UploadForm.css";

interface UploadFormProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  // Says what the button does with the file: "Procesar archivo" saves it,
  // "Revisar archivo" only reads it.
  actionLabel: string;
  busy: boolean;
  onSubmit: () => void;
}

// An Excel to upload and the button that sends it (tax roll and payment
// orders).
export function UploadForm({
  file,
  onFileSelect,
  onClear,
  actionLabel,
  busy,
  onSubmit,
}: UploadFormProps) {
  return (
    <div className="ui-upload-form">
      <Dropzone file={file} onFileSelect={onFileSelect} onClear={onClear} />
      <div className="ui-upload-form__actions">
        <Button
          type="button"
          disabled={!file}
          loading={busy}
          onClick={onSubmit}
        >
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
