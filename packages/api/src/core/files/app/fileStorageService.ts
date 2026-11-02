import type { Orm, Tx } from "../../db";
import { fileRepository, type StoredFile } from "../db";

/**
 * Stored file bytes, joining the caller's `db` or `tx`. Repositories call it in the write that
 * references or drops a file, so it checks no `ctx` and owns no workflow.
 */
export interface FileStorageService {
  /** Stores a file the caller has already parsed and capped; returns its id. */
  storeFile: (db: Orm | Tx, file: StoredFile) => Promise<string>;
  /** Deletes the files with these ids; a file still referenced fails the write. */
  deleteFiles: (db: Orm | Tx, ids: readonly string[]) => Promise<void>;
  /** The file with this id, or null; the caller has checked that the id is one of its own. */
  readFile: (db: Orm | Tx, id: string) => Promise<StoredFile | null>;
}

export function createFileStorageService(): FileStorageService {
  return {
    storeFile: (db, file) => fileRepository(db).insert(file),
    deleteFiles: (db, ids) => fileRepository(db).deleteMany(ids),
    readFile: (db, id) => fileRepository(db).read(id),
  };
}
