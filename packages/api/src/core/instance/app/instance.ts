import type { Orm, Tx } from "../../db";
import { instanceRepository } from "../db";
import type { Instance } from "../domain";

/** The instance as stored, through the pool or joining `tx`; callers take the fields they need. */
export function readInstance(db: Orm | Tx): Promise<Instance> {
  return instanceRepository(db).read();
}
