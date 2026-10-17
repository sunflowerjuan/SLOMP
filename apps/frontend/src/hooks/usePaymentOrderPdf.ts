import { useCallback, useState } from "react";
import { getErrorMessage } from "../api/ApiError";
import { downloadPaymentOrderPdf } from "../api/paymentOrders";
import { triggerBrowserDownload } from "../utils/downloadBlob";

// Where the download was asked for, so the failure shows next to that button.
export type PaymentOrderPdfSource = "candidates" | "issued";

export interface PaymentOrderPdfError {
  paymentOrderId: number;
  source: PaymentOrderPdfSource;
  text: string;
}

// Downloads the PDF of an issued payment order. It is rendered again on each
// download and never stored (ADR-5); it never takes a new number.
export function usePaymentOrderPdf() {
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [error, setError] = useState<PaymentOrderPdfError | null>(null);

  const download = useCallback(
    async (
      paymentOrderId: number,
      number: string,
      source: PaymentOrderPdfSource,
    ) => {
      setError(null);
      setDownloadingId(paymentOrderId);
      try {
        const { blob, fileName } =
          await downloadPaymentOrderPdf(paymentOrderId);
        triggerBrowserDownload(blob, fileName ?? `MP-${number}.pdf`);
      } catch (caught) {
        setError({
          paymentOrderId,
          source,
          text: getErrorMessage(caught, { document: "MANDAMIENTO" }),
        });
      } finally {
        setDownloadingId(null);
      }
    },
    [],
  );

  return { downloadingId, error, download };
}
