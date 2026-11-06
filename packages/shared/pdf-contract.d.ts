// Messages and requests exchanged by the backend and the PDF service
// (Confluence page "Servicio de PDF: contrato entre backend y worker
// (SL-118)", sections 7, 9 and 10). Types only: both apps import them with
// `import type`, so nothing here exists at runtime.

export type DocumentType = "LIQUIDACION" | "MANDAMIENTO";

export interface TemplateRef {
  /** "<container>/<path>", e.g. "templates/paez/liquidacion/1.docx". */
  blob: string;
  sha256: string;
}

export interface RenderBatchMessage {
  schemaVersion: 1;
  type: "render-batch";
  jobId: string;
  municipalityId: number;
  documentType: DocumentType;
  batchIndex: number;
  inputBlob: string;
  template: TemplateRef;
  outputPrefix: string;
}

export interface AssembleZipMessage {
  schemaVersion: 1;
  type: "assemble-zip";
  jobId: string;
  sourcePrefix: string;
  zipBlob: string;
  expectedFiles: number;
}

export type WorkMessage = RenderBatchMessage | AssembleZipMessage;

export interface BatchInput {
  documents: { fileName: string; data: Record<string, unknown> }[];
}

export interface RenderRequest {
  schemaVersion: 1;
  documentType: DocumentType;
  template: TemplateRef;
  data: Record<string, unknown>;
}

// Codes the PDF service publishes in pdf-results.
export type JobErrorCode =
  | "INVALID_MESSAGE"
  | "PDF_TEMPLATE_UNAVAILABLE"
  | "PDF_TEMPLATE_INVALID"
  | "TEMPLATE_RENDER_FAILED"
  | "PDF_CONVERSION_TIMEOUT"
  | "PDF_CONVERSION_FAILED"
  | "PDF_STORAGE_UNAVAILABLE"
  | "BULK_ZIP_INCOMPLETE";

export type BatchResult =
  | {
      schemaVersion: 1;
      type: "batch-result";
      jobId: string;
      batchIndex: number;
      status: "DONE";
      documentCount: number;
      attempt: number;
    }
  | {
      schemaVersion: 1;
      type: "batch-result";
      jobId: string;
      batchIndex: number;
      status: "FAILED";
      attempt: number;
      errorCode: JobErrorCode;
      errorDetails?: Record<string, unknown>;
    };

export type ZipResult =
  | {
      schemaVersion: 1;
      type: "zip-result";
      jobId: string;
      status: "DONE";
      sizeBytes: number;
    }
  | {
      schemaVersion: 1;
      type: "zip-result";
      jobId: string;
      status: "FAILED";
      errorCode: JobErrorCode;
      errorDetails?: Record<string, unknown>;
    };

export type PdfResult = BatchResult | ZipResult;
