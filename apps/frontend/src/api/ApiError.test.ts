import { describe, expect, it } from "vitest";
import { ApiError, NETWORK_ERROR_STATUS, isRetryable } from "./ApiError";

describe("isRetryable", () => {
  it("is worth trying again without an answer, on a server error or past the rate limit", () => {
    for (const status of [NETWORK_ERROR_STATUS, 429, 500, 503]) {
      expect(isRetryable(new ApiError(status, "failed"))).toBe(true);
    }
  });

  it("needs a change first when the request itself was refused", () => {
    for (const status of [400, 403, 404, 409, 413]) {
      expect(isRetryable(new ApiError(status, "refused"))).toBe(false);
    }
  });

  it("gives an unexpected failure another chance", () => {
    expect(isRetryable(new Error("unexpected"))).toBe(true);
  });
});
