import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RenderRequest, TemplateRef } from 'shared/pdf-contract';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { connectPdfStorage, type PdfStorage } from './pdf-storage.js';

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// Configuration of the PDF service integration (Confluence SL-118, section 13).
export function pdfConfig() {
  return {
    storageConnectionString:
      process.env.AZURE_STORAGE_CONNECTION_STRING || undefined,
    serviceUrl: process.env.PDF_SERVICE_URL?.replace(/\/+$/, '') || undefined,
    serviceKey: process.env.PDF_SERVICE_KEY || undefined,
    workQueue: process.env.PDF_WORK_QUEUE || 'pdf-work',
    resultsQueue: process.env.PDF_RESULTS_QUEUE || 'pdf-results',
    jobsContainer: process.env.PDF_JOBS_CONTAINER || 'pdf-jobs',
    templatesContainer: process.env.TEMPLATES_CONTAINER || 'templates',
    batchSize: positiveInt('BATCH_SIZE', 10),
    zipTtlMinutes: positiveInt('ZIP_TTL_MINUTES', 60),
    watchdogMinutes: positiveInt('JOB_WATCHDOG_MINUTES', 15),
    maxBulkDocuments: positiveInt('MAX_BULK_DOCUMENTS', 10_000),
    templatePath: resolve(
      process.cwd(),
      process.env.LIQUIDATION_TEMPLATE_PATH ||
        'templates/liquidacion-paez.docx',
    ),
  };
}

export type PdfConfig = ReturnType<typeof pdfConfig>;

const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ponytail: the only template is Páez's official .docx, uploaded from disk on
// first use. SL-91 replaces this with a template per municipality and version.
const TEMPLATE_MUNICIPALITY_SLUG = 'paez';

// A little longer than the service's own conversion timeout, so its 504 wins.
const RENDER_TIMEOUT_MS = 35_000;
const MAX_BUSY_WAIT_SECONDS = 5;

// Public codes of POST /render (contract section 9) to the API's codes.
const RENDER_ERROR_CODES: Record<string, ErrorCode> = {
  TEMPLATE_UNAVAILABLE: ErrorCode.PDF_TEMPLATE_UNAVAILABLE,
  TEMPLATE_INVALID: ErrorCode.PDF_TEMPLATE_INVALID,
  TEMPLATE_RENDER_FAILED: ErrorCode.TEMPLATE_RENDER_FAILED,
  CONVERSION_TIMEOUT: ErrorCode.PDF_CONVERSION_TIMEOUT,
};

function unavailable(code: ErrorCode, message: string, cause?: unknown) {
  return new ServiceUnavailableException(errorBody(code, message), { cause });
}

// The backend's side of the PDF service: Storage (bulk jobs), the template
// reference every message carries, and POST /render for the individual PDF.
// The backend never runs docxtemplater or LibreOffice itself.
@Injectable()
export class PdfServiceClient {
  private readonly logger = new Logger(PdfServiceClient.name);
  readonly config: PdfConfig = pdfConfig();
  private readonly connected: PdfStorage | null = this.config
    .storageConnectionString
    ? connectPdfStorage(this.config.storageConnectionString, this.config)
    : null;
  private template: Promise<TemplateRef> | undefined;

  constructor(private readonly prisma: PrismaService) {
    if (!this.connected) {
      this.logger.warn(
        'AZURE_STORAGE_CONNECTION_STRING is not set: PDF generation answers 503.',
      );
    }
  }

  get storageConfigured(): boolean {
    return this.connected !== null;
  }

  storage(): PdfStorage {
    if (!this.connected) {
      throw unavailable(
        ErrorCode.PDF_SERVICE_NOT_CONFIGURED,
        'PDF generation is not configured: set AZURE_STORAGE_CONNECTION_STRING.',
      );
    }
    return this.connected;
  }

  async liquidationTemplate(municipalityId: number): Promise<TemplateRef> {
    const municipality = await this.prisma.municipality.findUnique({
      where: { id: municipalityId },
      select: { slug: true },
    });
    if (municipality?.slug !== TEMPLATE_MUNICIPALITY_SLUG) {
      throw unavailable(
        ErrorCode.PDF_TEMPLATE_UNAVAILABLE,
        'This municipality has no liquidation template yet.',
      );
    }
    const storage = this.storage();
    // Retried on the next request when it fails (Storage down, file missing).
    this.template ??= this.uploadTemplate(storage).catch((error: unknown) => {
      this.template = undefined;
      throw error;
    });
    return this.template;
  }

  private async uploadTemplate(storage: PdfStorage): Promise<TemplateRef> {
    let docx: Buffer;
    try {
      docx = await readFile(this.config.templatePath);
    } catch (error) {
      throw unavailable(
        ErrorCode.PDF_TEMPLATE_UNAVAILABLE,
        `The liquidation template is missing at ${this.config.templatePath}.`,
        error,
      );
    }
    const blob = `${this.config.templatesContainer}/${TEMPLATE_MUNICIPALITY_SLUG}/liquidacion/1.docx`;
    try {
      await storage.ensureCreated();
      await storage.upload(blob, docx, DOCX_TYPE);
    } catch (error) {
      throw unavailable(
        ErrorCode.PDF_STORAGE_UNAVAILABLE,
        'Could not upload the liquidation template to Storage.',
        error,
      );
    }
    return { blob, sha256: createHash('sha256').update(docx).digest('hex') };
  }

  async render(request: RenderRequest): Promise<Buffer> {
    const { serviceUrl, serviceKey } = this.config;
    if (!serviceUrl || !serviceKey) {
      throw unavailable(
        ErrorCode.PDF_SERVICE_NOT_CONFIGURED,
        'PDF generation is not configured: set PDF_SERVICE_URL and PDF_SERVICE_KEY.',
      );
    }
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(`${serviceUrl}/render`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': serviceKey,
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
        });
      } catch (error) {
        const timedOut = (error as Error).name === 'TimeoutError';
        throw unavailable(
          timedOut
            ? ErrorCode.PDF_CONVERSION_TIMEOUT
            : ErrorCode.PDF_CONVERSION_FAILED,
          timedOut
            ? 'The PDF service did not answer in time.'
            : 'The PDF service is unreachable.',
          error,
        );
      }
      if (response.ok) return Buffer.from(await response.arrayBuffer());

      const { code } = (await response.json().catch(() => ({}))) as {
        code?: string;
      };
      if (code === 'BUSY' && attempt === 1) {
        const wait = Number(response.headers.get('Retry-After')) || 1;
        await sleep(Math.min(wait, MAX_BUSY_WAIT_SECONDS) * 1000);
        continue;
      }
      const mapped = code ? RENDER_ERROR_CODES[code] : undefined;
      if (!mapped) {
        // UNAUTHORIZED / INVALID_REQUEST mean a wrong key or a contract bug.
        this.logger.error(`POST /render answered ${response.status} ${code}`);
      }
      throw unavailable(
        mapped ?? ErrorCode.PDF_CONVERSION_FAILED,
        `The PDF service could not generate the document (${code ?? response.status}).`,
      );
    }
  }
}
