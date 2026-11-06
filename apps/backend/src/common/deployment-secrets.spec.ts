import { describe, expect, it } from 'vitest';
import {
  assertDeploymentSecrets,
  isLocalEnvironment,
} from './deployment-secrets.js';

const LOCAL_URL = 'postgresql://postgres:postgres@localhost:5432/predial_dev';
const COMPOSE_URL = 'postgresql://postgres:postgres@db:5432/predial_dev';
const REMOTE_URL =
  'postgresql://slomp:secret@psql-predial-dev.postgres.database.azure.com:5432/predial';
const OWN_SECRET = 'q7Jm2xV9tKc4Rw8Zp1Ls6Nd3Hf5Gb0Ya-Ue_XoTi';

describe('isLocalEnvironment', () => {
  it.each([
    LOCAL_URL,
    'postgresql://postgres:postgres@127.0.0.1:5433/predial_dev',
    'postgresql://postgres:postgres@[::1]:5432/predial_dev',
  ])('treats a loopback database as local: %s', (url) => {
    expect(isLocalEnvironment({ DATABASE_URL: url })).toBe(true);
  });

  it('treats the compose stack as local only when it says so', () => {
    expect(isLocalEnvironment({ DATABASE_URL: COMPOSE_URL })).toBe(false);
    expect(
      isLocalEnvironment({
        DATABASE_URL: COMPOSE_URL,
        ALLOW_DEV_CREDENTIALS: 'true',
      }),
    ).toBe(true);
  });

  it('treats a remote, missing or unparseable DATABASE_URL as non-local', () => {
    expect(isLocalEnvironment({ DATABASE_URL: REMOTE_URL })).toBe(false);
    expect(isLocalEnvironment({})).toBe(false);
    expect(isLocalEnvironment({ DATABASE_URL: 'not a url' })).toBe(false);
  });

  it('ignores NODE_ENV', () => {
    expect(
      isLocalEnvironment({ DATABASE_URL: REMOTE_URL, NODE_ENV: 'development' }),
    ).toBe(false);
  });
});

describe('assertDeploymentSecrets', () => {
  it('accepts the development placeholders on a local machine', () => {
    expect(() =>
      assertDeploymentSecrets({
        DATABASE_URL: LOCAL_URL,
        JWT_SECRET: 'reemplazar-en-local',
        PDF_SERVICE_KEY: 'local-compose-only-change-me',
      }),
    ).not.toThrow();
  });

  it.each([
    'reemplazar-en-local',
    'ci-placeholder-secret',
    'test-secret',
    'local-compose-only-change-me',
  ])(
    'rejects the published JWT_SECRET "%s" outside a local machine',
    (secret) => {
      expect(() =>
        assertDeploymentSecrets({
          DATABASE_URL: REMOTE_URL,
          JWT_SECRET: secret,
        }),
      ).toThrow(/JWT_SECRET is a placeholder published in the repository/);
    },
  );

  it('rejects a JWT_SECRET shorter than 32 bytes outside a local machine', () => {
    expect(() =>
      assertDeploymentSecrets({
        DATABASE_URL: REMOTE_URL,
        JWT_SECRET: 'a'.repeat(31),
      }),
    ).toThrow(/JWT_SECRET must have at least 32 bytes/);
  });

  it('rejects the compose PDF_SERVICE_KEY outside a local machine', () => {
    expect(() =>
      assertDeploymentSecrets({
        DATABASE_URL: REMOTE_URL,
        JWT_SECRET: OWN_SECRET,
        PDF_SERVICE_KEY: 'local-compose-only-change-me',
      }),
    ).toThrow(/PDF_SERVICE_KEY is a placeholder/);
  });

  it('reports every bad secret at once', () => {
    expect(() =>
      assertDeploymentSecrets({
        DATABASE_URL: REMOTE_URL,
        JWT_SECRET: 'test-secret',
        PDF_SERVICE_KEY: 'short',
      }),
    ).toThrow(
      /JWT_SECRET is a placeholder.*; PDF_SERVICE_KEY must have at least 32 bytes/,
    );
  });

  it('accepts own secrets outside a local machine, with or without a PDF service', () => {
    expect(() =>
      assertDeploymentSecrets({
        DATABASE_URL: REMOTE_URL,
        JWT_SECRET: OWN_SECRET,
      }),
    ).not.toThrow();
    expect(() =>
      assertDeploymentSecrets({
        DATABASE_URL: REMOTE_URL,
        JWT_SECRET: OWN_SECRET,
        PDF_SERVICE_KEY: `${OWN_SECRET}-pdf`,
      }),
    ).not.toThrow();
  });

  it('treats a missing DATABASE_URL as non-local', () => {
    expect(() =>
      assertDeploymentSecrets({ JWT_SECRET: 'reemplazar-en-local' }),
    ).toThrow(/JWT_SECRET is a placeholder/);
  });
});
