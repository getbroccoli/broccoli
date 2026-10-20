import type { Orm, Tx } from "../../db";
import { fileRepository, type StoredFile } from "../db";

/**
 * Stores a file the caller has already parsed and capped, joining `db`'s transaction; returns
 * its id. The repository that keeps the id calls it, in the write that references the file.
 */
export function storeFile(db: Orm | Tx, file: StoredFile): Promise<string> {
  return fileRepository(db).insert(file);
}

/**
 * Deletes the files with these ids, joining `db`'s transaction; a file still referenced fails
 * it. The repository that dropped their references calls it, in the same write.
 */
export function deleteFiles(db: Orm | Tx, ids: readonly string[]): Promise<void> {
  return fileRepository(db).deleteMany(ids);
}

/**
 * The file with this id, or null, joining `db`'s transaction; the caller has checked that the id
 * is one of its own.
 */
export function readFile(db: Orm | Tx, id: string): Promise<StoredFile | null> {
  return fileRepository(db).read(id);
}
