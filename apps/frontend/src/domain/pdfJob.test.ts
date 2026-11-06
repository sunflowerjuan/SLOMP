import { describe, expect, it } from "vitest";
import type { PdfJob } from "../api/pdfJobs";
import {
  estimateRemainingSeconds,
  incompleteDocuments,
  isPdfJobActive,
  msUntilExpiry,
  pdfJobProgress,
} from "./pdfJob";

const NOW = Date.parse("2026-10-16T15:00:00.000Z");

function job(overrides: Partial<PdfJob> = {}): PdfJob {
  return {
    jobId: "7f3c2a10-5b1e-4c7d-9a2f-0e8b1d6c4a55",
    documentType: "LIQUIDACION",
    kind: "NORMAL",
    status: "RUNNING",
    totalDocuments: 200,
    completedDocuments: 50,
    createdAt: "2026-10-16T14:59:00.000Z",
    startedAt: "2026-10-16T14:59:00.000Z",
    finishedAt: null,
    expiresAt: null,
    errorCode: null,
    errorDetails: null,
    ...overrides,
  };
}

describe("isPdfJobActive", () => {
  it("is active while preparing, running or assembling", () => {
    for (const status of ["PREPARING", "RUNNING", "ASSEMBLING"] as const) {
      expect(isPdfJobActive(job({ status }))).toBe(true);
    }
    for (const status of ["DONE", "FAILED", "EXPIRED"] as const) {
      expect(isPdfJobActive(job({ status }))).toBe(false);
    }
  });
});

describe("pdfJobProgress", () => {
  it("follows the finished PDFs while running, rounded down", () => {
    expect(pdfJobProgress(job())).toBe(25);
    expect(pdfJobProgress(job({ completedDocuments: 199 }))).toBe(99);
  });

  it("counts batches that finish while the job is still preparing", () => {
    expect(
      pdfJobProgress(job({ status: "PREPARING", completedDocuments: 20 })),
    ).toBe(10);
  });

  it("is full once every PDF is done and the ZIP is being assembled", () => {
    expect(pdfJobProgress(job({ status: "ASSEMBLING" }))).toBe(100);
    expect(pdfJobProgress(job({ status: "DONE" }))).toBe(100);
  });

  it("is empty for a failed job or one without documents yet", () => {
    expect(pdfJobProgress(job({ status: "FAILED" }))).toBe(0);
    expect(
      pdfJobProgress(job({ totalDocuments: 0, completedDocuments: 0 })),
    ).toBe(0);
  });
});

describe("msUntilExpiry", () => {
  it("counts down the hour of a finished ZIP", () => {
    const done = job({ status: "DONE", expiresAt: "2026-10-16T15:45:00.000Z" });
    expect(msUntilExpiry(done, NOW)).toBe(45 * 60_000);
  });

  it("is zero once expiresAt has passed, even before the backend's sweep", () => {
    const done = job({ status: "DONE", expiresAt: "2026-10-16T14:00:00.000Z" });
    expect(msUntilExpiry(done, NOW)).toBe(0);
  });

  it("is null when there is no ZIP to count down", () => {
    expect(msUntilExpiry(job(), NOW)).toBeNull();
    expect(
      msUntilExpiry(
        job({ status: "EXPIRED", expiresAt: "2026-10-16T14:00:00.000Z" }),
        NOW,
      ),
    ).toBeNull();
  });
});

describe("estimateRemainingSeconds", () => {
  it("projects the pace so far onto the PDFs left", () => {
    // 50 PDF in 60 s: the other 150 take 180 s.
    expect(estimateRemainingSeconds(job(), NOW)).toBe(180);
  });

  it("falls back to createdAt when the job has no startedAt yet", () => {
    expect(estimateRemainingSeconds(job({ startedAt: null }), NOW)).toBe(180);
  });

  it("waits until there is something to measure", () => {
    expect(
      estimateRemainingSeconds(job({ completedDocuments: 0 }), NOW),
    ).toBeNull();
    expect(
      estimateRemainingSeconds(
        job({ startedAt: "2026-10-16T14:59:59.000Z" }),
        NOW,
      ),
    ).toBeNull();
    expect(
      estimateRemainingSeconds(job({ status: "ASSEMBLING" }), NOW),
    ).toBeNull();
  });
});

describe("incompleteDocuments", () => {
  it("reads every incomplete liquidation of the 400, periods in order", () => {
    expect(
      incompleteDocuments({
        documents: [
          {
            cadastralCode: "155140001000000010001",
            periods: [2021, 2019, 2020],
            missing: ["PROPERTY_ADDRESS"],
          },
          { cadastralCode: "", periods: [2024], missing: ["CADASTRAL_CODE"] },
        ],
      }),
    ).toEqual([
      {
        cadastralCode: "155140001000000010001",
        periods: [2019, 2020, 2021],
        missing: ["PROPERTY_ADDRESS"],
      },
      { cadastralCode: "", periods: [2024], missing: ["CADASTRAL_CODE"] },
    ]);
  });

  it("ignores malformed entries and errors without a list", () => {
    expect(incompleteDocuments({})).toEqual([]);
    expect(incompleteDocuments({ missing: ["PROPERTY_ADDRESS"] })).toEqual([]);
    expect(
      incompleteDocuments({
        documents: [
          null,
          "x",
          { cadastralCode: 7, periods: ["2020"], missing: [1] },
        ],
      }),
    ).toEqual([{ cadastralCode: "", periods: [], missing: [] }]);
  });
});
