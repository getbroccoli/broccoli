import type { Orm, Tx } from "../../db";
import { fileRepository, type StoredFile } from "../db";

/** Stores a file the caller has already parsed and capped, joining `tx`; returns its id. */
export function storeFile(tx: Tx, file: StoredFile): Promise<string> {
  return fileRepository(tx).insert(file);
}

/** Deletes the files with these ids, joining `tx`; a file still referenced fails the transaction. */
export function deleteFiles(tx: Tx, ids: readonly string[]): Promise<void> {
  return fileRepository(tx).deleteMany(ids);
}

/** The file with this id, or null. */
export function readFile(orm: Orm, id: string): Promise<StoredFile | null> {
  return fileRepository(orm).read(id);
}
