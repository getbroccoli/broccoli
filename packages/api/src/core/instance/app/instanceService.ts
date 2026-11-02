import type { Orm, Tx } from "../../db";
import { instanceRepository } from "../db";
import type { Instance } from "../domain";

/** The instance's stored state, which auth, setup and the modules read. */
export interface InstanceService {
  /** The instance as stored, through the pool or joining `tx`; callers take the fields they need. Trusted read: no `ctx`. */
  readInstance(db: Orm | Tx): Promise<Instance>;
}

export function createInstanceService(): InstanceService {
  return {
    readInstance: (db) => instanceRepository(db).readInstance(),
  };
}
