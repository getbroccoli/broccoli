import type { GenericEndpointContext } from "@better-auth/core";
import { runWithAdapter } from "@better-auth/core/context";

import { authDatabase } from "../../auth";
import { ormOf, type Transact, type Tx } from "../../db";

/** Runs `work` in one transaction that Better Auth's writes join, so they hold the instance lock. */
export function inAuthTransaction<T>(
  transact: Transact,
  ctx: GenericEndpointContext,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  return transact(
    async (tx) =>
      await runWithAdapter(authDatabase(ormOf(tx))(ctx.context.options), () => work(tx)),
  );
}
