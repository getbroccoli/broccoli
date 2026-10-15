import type { SecurityContext } from "../../../../core/security";
import { importRepository } from "../../db";
import type { ImportContext } from "./importContext";

/** Maps a failed file again, in a new run; any other source is left as it is. */
export async function retryFile(
  { transact, jobs }: ImportContext,
  ctx: SecurityContext,
  sourceId: string,
): Promise<void> {
  ctx.requireOwnerOrSystem();
  await transact(async (tx) => {
    const imports = importRepository(tx);
    await imports.lockSources();
    const attempt = await imports.restartMapping(sourceId);
    if (attempt !== null) {
      await jobs.send(tx, "imports.mapFile", { sourceId, attempt });
    }
  });
}
