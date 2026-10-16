import { describe, expect, it } from "vitest";
import { isCommonPassword } from "./common-passwords.js";
import { isLocalEnvironment } from "./environment.js";
import { checkPasswordPolicy } from "./password-policy.js";
import {
  LOCAL_SEED_ADMIN_EMAIL,
  LOCAL_SEED_ADMIN_PASSWORD,
  resolveSeedAdminCredentials,
} from "./seed-admin-credentials.js";

const LOCAL_URL = "postgresql://postgres:postgres@localhost:5433/predial_dev";
const COMPOSE_URL = "postgresql://postgres:postgres@db:5432/predial_dev";
const REMOTE_URL =
  "postgresql://slomp:secret@psql-predial-dev.postgres.database.azure.com:5432/predial?sslmode=require";
const STRONG_PASSWORD = "Tr4zabilidad del predial 2026";

describe("isLocalEnvironment", () => {
  it.each([
    LOCAL_URL,
    "postgresql://postgres:postgres@127.0.0.1:5432/predial_dev",
    "postgresql://postgres:postgres@[::1]:5432/predial_dev",
  ])("treats a loopback database as local: %s", (url) => {
    expect(isLocalEnvironment({ DATABASE_URL: url })).toBe(true);
  });

  it.each([
    REMOTE_URL,
    COMPOSE_URL,
    "postgresql://u:p@localhost.example.com/db",
  ])("treats any other host as non-local: %s", (url) => {
    expect(isLocalEnvironment({ DATABASE_URL: url })).toBe(false);
  });

  it("treats the compose stack as local when it sets ALLOW_DEV_CREDENTIALS", () => {
    expect(
      isLocalEnvironment({
        DATABASE_URL: COMPOSE_URL,
        ALLOW_DEV_CREDENTIALS: "true",
      }),
    ).toBe(true);
  });

  it("treats a missing or unparseable URL as non-local", () => {
    expect(isLocalEnvironment({})).toBe(false);
    expect(isLocalEnvironment({ DATABASE_URL: "not a url" })).toBe(false);
  });
});

describe("isCommonPassword", () => {
  it.each([
    "passwordpassword",
    "1q2w3e4r5t6y",
    "trabajodecampo",
    "TrabajoDeCampo",
  ])("rejects a listed common password: %s", (password) => {
    expect(isCommonPassword(password)).toBe(true);
  });

  it.each([
    "Password2026!",
    "admin1234567",
    "Contraseña2026",
    "2026paez2026",
    "!!Colombia123",
    "P4ssw0rd2026",
  ])("rejects a common word padded with digits or symbols: %s", (password) => {
    expect(isCommonPassword(password)).toBe(true);
  });

  it.each([
    "aaaaaaaaaaaa",
    "111111111111",
    "123456789012",
    "987654321098",
    "qwertyuiopas",
    "abcdefghijkl",
  ])("rejects repeated characters and sequences: %s", (password) => {
    expect(isCommonPassword(password)).toBe(true);
  });

  it.each([STRONG_PASSWORD, "cafe-mesa-rio-2026", "Paez2026Boyaca!"])(
    "accepts a password that is not common: %s",
    (password) => {
      expect(isCommonPassword(password)).toBe(false);
    },
  );
});

describe("checkPasswordPolicy", () => {
  it("accepts a long password that is not common, with no composition rules", () => {
    expect(checkPasswordPolicy(STRONG_PASSWORD)).toEqual([]);
    expect(checkPasswordPolicy("cafe mesa rio")).toEqual([]);
  });

  it("rejects a password shorter than 12 characters", () => {
    expect(checkPasswordPolicy("Kx9!mQ2#vL4")).toEqual(["TOO_SHORT"]);
  });

  it("counts characters, not bytes, for the minimum", () => {
    expect(checkPasswordPolicy("ñandú y ñame")).toEqual([]);
  });

  it("rejects a password bcrypt would truncate", () => {
    expect(checkPasswordPolicy("kx9mq2vl4".repeat(9))).toEqual(["TOO_LONG"]);
  });

  it("rejects the seed's development password on every count", () => {
    expect(checkPasswordPolicy(LOCAL_SEED_ADMIN_PASSWORD)).toEqual([
      "TOO_SHORT",
      "COMMON",
    ]);
  });
});

describe("resolveSeedAdminCredentials", () => {
  it("falls back to the development default on a local machine", () => {
    expect(resolveSeedAdminCredentials({ DATABASE_URL: LOCAL_URL })).toEqual({
      email: LOCAL_SEED_ADMIN_EMAIL,
      password: LOCAL_SEED_ADMIN_PASSWORD,
      isLocal: true,
    });
    expect(
      resolveSeedAdminCredentials({
        DATABASE_URL: COMPOSE_URL,
        ALLOW_DEV_CREDENTIALS: "true",
        SEED_ADMIN_PASSWORD: LOCAL_SEED_ADMIN_PASSWORD,
      }).isLocal,
    ).toBe(true);
  });

  it("uses explicit credentials on a local machine without applying the policy", () => {
    expect(
      resolveSeedAdminCredentials({
        DATABASE_URL: LOCAL_URL,
        SEED_ADMIN_EMAIL: "dev@example.com",
        SEED_ADMIN_PASSWORD: "dev",
      }),
    ).toEqual({ email: "dev@example.com", password: "dev", isLocal: true });
  });

  it("refuses to seed a non-local database without explicit credentials", () => {
    expect(() =>
      resolveSeedAdminCredentials({ DATABASE_URL: REMOTE_URL }),
    ).toThrow(/must be set explicitly/);
    expect(() =>
      resolveSeedAdminCredentials({
        DATABASE_URL: REMOTE_URL,
        SEED_ADMIN_EMAIL: "admin@example.com",
      }),
    ).toThrow(/must be set explicitly/);
  });

  it("refuses the development password on a non-local database", () => {
    expect(() =>
      resolveSeedAdminCredentials({
        DATABASE_URL: REMOTE_URL,
        SEED_ADMIN_EMAIL: LOCAL_SEED_ADMIN_EMAIL,
        SEED_ADMIN_PASSWORD: LOCAL_SEED_ADMIN_PASSWORD,
      }),
    ).toThrow(/not acceptable outside a local machine/);
  });

  it("refuses a common password on a non-local database", () => {
    expect(() =>
      resolveSeedAdminCredentials({
        DATABASE_URL: REMOTE_URL,
        SEED_ADMIN_EMAIL: "admin@example.com",
        SEED_ADMIN_PASSWORD: "Administrador2026",
      }),
    ).toThrow(/common password/);
  });

  it("refuses the compose defaults when the compose flag is missing", () => {
    expect(() =>
      resolveSeedAdminCredentials({
        DATABASE_URL: COMPOSE_URL,
        SEED_ADMIN_EMAIL: LOCAL_SEED_ADMIN_EMAIL,
        SEED_ADMIN_PASSWORD: LOCAL_SEED_ADMIN_PASSWORD,
      }),
    ).toThrow(/not acceptable outside a local machine/);
  });

  it("accepts explicit credentials that pass the policy on a non-local database", () => {
    expect(
      resolveSeedAdminCredentials({
        DATABASE_URL: REMOTE_URL,
        SEED_ADMIN_EMAIL: " admin@example.com ",
        SEED_ADMIN_PASSWORD: STRONG_PASSWORD,
      }),
    ).toEqual({
      email: "admin@example.com",
      password: STRONG_PASSWORD,
      isLocal: false,
    });
  });
});
