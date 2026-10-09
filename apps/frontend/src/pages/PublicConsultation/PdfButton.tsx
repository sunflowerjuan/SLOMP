import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";

export interface PdfDownloadState {
  loading: boolean;
  error: string | null;
}

export function PdfButton({
  settlementId,
  state,
  onDownload,
  fullWidth,
}: {
  settlementId: number;
  state: PdfDownloadState | undefined;
  onDownload: (settlementId: number) => void;
  fullWidth?: boolean;
}) {
  return (
    <div className="public-consultation__pdf-cell">
      <Button
        variant="secondary"
        fullWidth={fullWidth}
        loading={state?.loading}
        onClick={() => onDownload(settlementId)}
      >
        Descargar PDF
      </Button>
      {state?.error && <Notice>{state.error}</Notice>}
    </div>
  );
}
