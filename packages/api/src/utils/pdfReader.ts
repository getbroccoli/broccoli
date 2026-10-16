// The worker `pdfProcess` runs, loaded by URL.
import { parentPort, workerData } from "node:worker_threads";

import { installFetchGuard } from "./fetchGuard";
import type { PdfPage } from "./pdf";

// The reader passes pdf.js no URL, so nothing should be fetched; a future default must not either.
installFetchGuard();

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

/** Every page's text; throws when the PDF cannot be read or passes a limit. */
async function readPages(bytes: Uint8Array): Promise<string> {
  const document = await getDocument({
    data: bytes,
    enableXfa: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    useWasm: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    stopAtErrors: true,
    verbosity: 0,
  }).promise;
  if (document.numPages === 0 || document.numPages > MAX_PAGES) {
    throw new Error("Unsupported page count");
  }
  const pages: PdfPage[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    // pdf.js always gives the four edges of the page box.
    const [left = 0, bottom = 0, right = 0, top = 0] = page.view;
    const { items } = await page.getTextContent();
    pages.push({
      width: right - left,
      height: top - bottom,
      items: items.flatMap((item) =>
        "str" in item && item.str.trim() !== ""
          ? [
              {
                text: item.str,
                x: item.transform[4] - left,
                y: item.transform[5] - bottom,
                width: item.width,
                height: item.height,
              },
            ]
          : [],
      ),
    });
  }
  const json = JSON.stringify(pages);
  if (Buffer.byteLength(json) > MAX_TEXT_BYTES) {
    throw new Error("Too much text");
  }
  return json;
}

const MAX_PAGES = 1000;
/** What the API receives back, so a small file cannot hand it a huge result. */
const MAX_TEXT_BYTES = 4 * 1024 * 1024;

// Last, so the constants above are set when the worker starts reading.
parentPort?.postMessage(await readPages(workerData as Uint8Array));
