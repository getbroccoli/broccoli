import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { account, user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";
import { userPermissionProfiles } from "../../src/core/security";

export async function seedUser(
  orm: Orm,
  {
    email,
    password,
    name = "User",
    permissionProfiles = [],
  }: {
    email: string;
    password?: string;
    name?: string;
    permissionProfiles?: "ADMIN"[];
  },
): Promise<{ id: string; email: string }> {
  const saved = { id: randomUUID(), email: email.toLowerCase() };
  await orm.insert(user).values({ ...saved, name });
  if (permissionProfiles.length > 0) {
    await orm
      .insert(userPermissionProfiles)
      .values(permissionProfiles.map((profile) => ({ userId: saved.id, profile })));
  }
  if (password !== undefined) {
    await orm.insert(account).values({
      id: randomUUID(),
      accountId: saved.id,
      providerId: "credential",
      userId: saved.id,
      password: await hashPassword(password),
    });
  }
  return saved;
}
