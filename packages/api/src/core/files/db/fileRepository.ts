import { eq, inArray } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../db";
import { files } from "./filesTable";

/** The files stored in Postgres, through the pool or inside a transaction. */
export interface FileRepository {
  /** Stores the file and returns its id. */
  insert(file: StoredFile): Promise<string>;
  deleteMany(ids: readonly string[]): Promise<void>;
  read(id: string): Promise<StoredFile | null>;
}

/** A stored file's bytes and their MIME type. */
export interface StoredFile {
  content: Buffer;
  mimeType: string;
}

export function fileRepository(db: Orm | Tx): FileRepository {
  const orm = () => ormOf(db);
  return {
    insert: async (file: StoredFile): Promise<string> => {
      const [row] = await orm().insert(files).values(file).returning({ id: files.id });
      return row!.id;
    },

    deleteMany: async (ids: readonly string[]): Promise<void> => {
      if (ids.length > 0) {
        await orm()
          .delete(files)
          .where(inArray(files.id, [...ids]));
      }
    },

    read: async (id: string): Promise<StoredFile | null> => {
      const [row] = await orm()
        .select({ content: files.content, mimeType: files.mimeType })
        .from(files)
        .where(eq(files.id, id));
      return row ?? null;
    },
  };
}
