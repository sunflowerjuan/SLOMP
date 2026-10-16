import { describe, expect, it } from "vitest";
import { isLocalEnvironment } from "./environment.js";
import {
  LOCAL_SEED_ADMIN_EMAIL,
  LOCAL_SEED_ADMIN_PASSWORD,
  resolveSeedAdminCredentials,
} from "./seed-admin-credentials.js";

const LOCAL_URL = "postgresql://postgres:postgres@localhost:5433/predial_dev";
const COMPOSE_URL = "postgresql://postgres:postgres@db:5432/predial_dev";
const REMOTE_URL =
  "postgresql://slomp:secret@psql-predial-dev.postgres.database.azure.com:5432/predial?sslmode=require";

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

describe("resolveSeedAdminCredentials", () => {
  it("falls back to the development default on a local machine", () => {
    expect(resolveSeedAdminCredentials({ DATABASE_URL: LOCAL_URL })).toEqual({
      email: LOCAL_SEED_ADMIN_EMAIL,
      password: LOCAL_SEED_ADMIN_PASSWORD,
    });
  });

  it("uses SEED_ADMIN_* on a local machine", () => {
    expect(
      resolveSeedAdminCredentials({
        DATABASE_URL: COMPOSE_URL,
        ALLOW_DEV_CREDENTIALS: "true",
        SEED_ADMIN_EMAIL: " dev@example.com ",
        SEED_ADMIN_PASSWORD: "dev",
      }),
    ).toEqual({ email: "dev@example.com", password: "dev" });
  });

  it("seeds no administrator outside a local machine, whatever SEED_ADMIN_* say", () => {
    expect(
      resolveSeedAdminCredentials({ DATABASE_URL: REMOTE_URL }),
    ).toBeNull();
    expect(
      resolveSeedAdminCredentials({
        DATABASE_URL: REMOTE_URL,
        SEED_ADMIN_EMAIL: "admin@example.com",
        SEED_ADMIN_PASSWORD: "una frase larga que nadie conoce",
      }),
    ).toBeNull();
    expect(
      resolveSeedAdminCredentials({
        DATABASE_URL: COMPOSE_URL,
        SEED_ADMIN_PASSWORD: LOCAL_SEED_ADMIN_PASSWORD,
      }),
    ).toBeNull();
  });

  it("treats a missing DATABASE_URL as non-local", () => {
    expect(
      resolveSeedAdminCredentials({
        SEED_ADMIN_PASSWORD: LOCAL_SEED_ADMIN_PASSWORD,
      }),
    ).toBeNull();
  });
});
