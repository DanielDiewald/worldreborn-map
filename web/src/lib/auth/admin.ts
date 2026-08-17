import "server-only";

import argon2 from "argon2";

let derivedDevelopmentHash: Promise<string> | null = null;

async function getAdminHash() {
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;
  if (configuredHash) return configuredHash;

  const developmentPassword = process.env.ADMIN_PASSWORD;
  if (!developmentPassword) {
    throw new Error("ADMIN_PASSWORD_HASH or ADMIN_PASSWORD is required");
  }

  derivedDevelopmentHash ??= argon2.hash(developmentPassword, {
    type: argon2.argon2id,
  });

  return derivedDevelopmentHash;
}

export async function verifyAdminCredentials(username: string, password: string) {
  const configuredUsername = process.env.ADMIN_USERNAME;
  if (!configuredUsername || username !== configuredUsername) return false;

  const hash = await getAdminHash();
  return argon2.verify(hash, password);
}
