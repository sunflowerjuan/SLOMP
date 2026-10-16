import "dotenv/config";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  checkPasswordPolicy,
  describePasswordViolations,
} from "../src/security/password-policy.js";

// Administrator account management for deployed environments, where there is
// no default password to fall back on:
//
//   admin.ts create --email <email> [--name <name>]
//   admin.ts rotate-password --email <email>
//
// The password is read from ADMIN_PASSWORD (never from an argument, which
// would end up in the shell history) and must pass the password policy. If
// it is not set, a random one is generated and printed once. Either way the
// administrator must replace it on the next login, since someone else chose
// it. Rotating a password also closes every open session of that
// administrator.

const BCRYPT_SALT_ROUNDS = 10;
const USAGE = `Usage:
  admin.ts create --email <email> [--name <name>]
  admin.ts rotate-password --email <email>

Password: ADMIN_PASSWORD environment variable, or generated if unset.`;

function resolvePassword(): {
  password: string;
  generated: boolean;
} {
  const provided = process.env.ADMIN_PASSWORD;
  if (!provided) {
    return { password: randomBytes(18).toString("base64url"), generated: true };
  }
  const violations = checkPasswordPolicy(provided);
  if (violations.length > 0) {
    throw new Error(
      `ADMIN_PASSWORD is not acceptable: ${describePasswordViolations(violations)}.`,
    );
  }
  return { password: provided, generated: false };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { email: { type: "string" }, name: { type: "string" } },
  });
  const command = positionals[0];
  const email = values.email?.trim();

  if (
    (command !== "create" && command !== "rotate-password") ||
    !email ||
    positionals.length !== 1
  ) {
    throw new Error(USAGE);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  // Before touching the database, so a rejected password changes nothing.
  const { password, generated } = resolvePassword();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const existing = await prisma.administrator.findUnique({
      where: { email },
    });
    if (command === "create" && existing) {
      throw new Error(
        `An administrator with email ${email} already exists. Use rotate-password to change its password.`,
      );
    }
    if (command === "rotate-password" && !existing) {
      throw new Error(`No administrator found with email ${email}.`);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    if (command === "create") {
      await prisma.administrator.create({
        data: {
          email,
          passwordHash,
          name: values.name?.trim() || null,
          mustChangePassword: true,
        },
      });
      console.log(
        `Administrator created: ${email} (must change the password on first login)`,
      );
    } else {
      // Same as a logout everywhere: the refresh tokens stop working, and the
      // access tokens already issued expire within minutes (SL-134).
      const [, closed] = await prisma.$transaction([
        prisma.administrator.update({
          where: { email },
          data: { passwordHash, mustChangePassword: true },
        }),
        prisma.refreshToken.updateMany({
          where: { administrator: { email }, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      console.log(
        `Password rotated for administrator: ${email} (${closed.count} open session tokens revoked; must change the password on next login)`,
      );
    }

    if (generated) {
      console.log(
        `Generated password (shown only once, store it in a password manager): ${password}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
