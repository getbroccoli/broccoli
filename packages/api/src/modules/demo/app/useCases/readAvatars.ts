import { readFile } from "node:fs/promises";

import { parseRasterImage, type RasterImage } from "../../../../utils";

/** The shipped avatars are 256 px WebP files of about 10 KB. */
const AVATAR_MAX_BYTES = 64 * 1024;

/** The avatar of each person, by key, read from the files shipped next to the code. */
export async function readAvatars(keys: readonly string[]): Promise<RasterImage[]> {
  return Promise.all(
    keys.map(async (key) => {
      const bytes = await readFile(new URL(`../../avatars/${key}.webp`, import.meta.url));
      const avatar = parseRasterImage(bytes, { maxBytes: AVATAR_MAX_BYTES });
      if (!avatar) {
        throw new Error(`The demo avatar ${key}.webp is not a valid image`);
      }
      return avatar;
    }),
  );
}
