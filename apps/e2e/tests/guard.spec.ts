import { expect, test } from "@playwright/test";
import { assertSafeTarget } from "../src/guard";

const local = {
  baseUrl: "http://localhost:5173",
  apiUrl: "http://127.0.0.1:3000",
};

test.describe("assertSafeTarget", () => {
  test("accepts local addresses", () => {
    expect(() => assertSafeTarget(local, false)).not.toThrow();
    expect(() =>
      assertSafeTarget({ ...local, baseUrl: "http://[::1]:5173" }, false),
    ).not.toThrow();
  });

  for (const host of [
    "https://slomp.example.com",
    "http://localhost.evil.com",
    "http://127.0.0.1.nip.io",
    "https://evil.com/localhost",
  ]) {
    test(`rejects ${host} as the frontend`, () => {
      expect(() =>
        assertSafeTarget({ ...local, baseUrl: host }, false),
      ).toThrow(/E2E_ALLOW_REMOTE=1/);
    });
  }

  test("rejects a remote API even if the frontend is local", () => {
    expect(() =>
      assertSafeTarget({ ...local, apiUrl: "https://api.example.com" }, false),
    ).toThrow(/api\.example\.com/);
  });

  test("allows remote addresses with E2E_ALLOW_REMOTE=1", () => {
    expect(() =>
      assertSafeTarget(
        {
          baseUrl: "https://slomp.example.com",
          apiUrl: "https://api.example.com",
        },
        true,
      ),
    ).not.toThrow();
  });

  test("rejects a malformed URL with a clear message", () => {
    expect(() =>
      assertSafeTarget({ ...local, baseUrl: "not a url" }, false),
    ).toThrow(/not a url/);
  });
});
