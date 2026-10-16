// The worker `pdfProcess` runs, loaded by URL.
import { parentPort, workerData } from "node:worker_threads";

import { installFetchGuard } from "./fetchGuard";
import type { PdfPage } from "./pdf";

// The reader passes pdf.js no URL, so nothing should be fetched; a future default must not either.
installFetchGuard();

const { AnnotationMode, getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");

type Matrix = [number, number, number, number, number, number];
type PdfDocument = Awaited<ReturnType<typeof getDocument>["promise"]>;
type PdfPageProxy = Awaited<ReturnType<PdfDocument["getPage"]>>;
type TextItem = Extract<
  Awaited<ReturnType<PdfPageProxy["getTextContent"]>>["items"][number],
  { str: string }
>;

/** Every page's text and images, or "encrypted"; throws when the PDF cannot be read or passes a limit. */
async function readPages(bytes: Uint8Array): Promise<string> {
  const document = await openDocument(bytes);
  if (document === "encrypted") {
    return JSON.stringify(document);
  }
  if (document.numPages === 0 || document.numPages > MAX_PAGES) {
    throw new Error("Unsupported page count");
  }
  const pages: PdfPage[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    pages.push(await readPage(await document.getPage(number)));
  }
  const json = JSON.stringify(pages);
  if (Buffer.byteLength(json) > MAX_TEXT_BYTES) {
    throw new Error("Too much text");
  }
  return json;
}

/** The parsed document, or "encrypted" when it needs a password to open. */
async function openDocument(bytes: Uint8Array): Promise<PdfDocument | "encrypted"> {
  try {
    return await getDocument({
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
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      return "encrypted";
    }
    throw error;
  }
}

async function readPage(page: PdfPageProxy): Promise<PdfPage> {
  // pdf.js always gives the four edges of the page box.
  const [left = 0, bottom = 0, right = 0, top = 0] = page.view;
  const width = right - left;
  const height = top - bottom;
  const { fnArray, argsArray } = await page.getOperatorList({
    annotationMode: AnnotationMode.DISABLE,
  });
  const drawing = drawingOf(fnArray, argsArray as unknown[][], page.view);
  const { items } = await page.getTextContent({ disableNormalization: true });
  const texts = items.filter((item): item is TextItem => "str" in item);
  return {
    width,
    height,
    items: visibleItems(texts, drawing.glyphs).flatMap((item) =>
      item.str.trim() === ""
        ? []
        : [
            {
              text: item.str,
              x: item.transform[4] - left,
              y: item.transform[5] - bottom,
              width: item.width,
              height: item.height,
            },
          ],
    ),
    imageCoverage: Math.min(1, drawing.imageArea / (width * height)),
  };
}

/** Each shown glyph's text and whether it is visible. */
interface Glyph {
  text: string;
  visible: boolean;
}

/**
 * What a page's operators draw: the area images cover, each clipped to the page box, and the
 * glyphs shown, in order. pdf.js does not optimise an operator list it is asked for, so images
 * are only these single draws.
 */
function drawingOf(
  fnArray: number[],
  argsArray: unknown[][],
  view: number[],
): { imageArea: number; glyphs: Glyph[] } {
  let state = { matrix: IDENTITY, renderMode: 0 };
  const saved: (typeof state)[] = [];
  let imageArea = 0;
  const glyphs: Glyph[] = [];
  fnArray.forEach((fn, index) => {
    const args = argsArray[index] ?? [];
    switch (fn) {
      case OPS.save:
        saved.push(state);
        break;
      case OPS.restore:
        state = saved.pop() ?? state;
        break;
      case OPS.transform:
        state = { ...state, matrix: multiply(args as Matrix, state.matrix) };
        break;
      case OPS.paintFormXObjectBegin:
        saved.push(state);
        // A form without its own matrix draws in the page's.
        state = {
          ...state,
          matrix: multiply((args[0] as Matrix | null) ?? IDENTITY, state.matrix),
        };
        break;
      case OPS.paintFormXObjectEnd:
        state = saved.pop() ?? state;
        break;
      case OPS.setTextRenderingMode:
        state = { ...state, renderMode: args[0] as number };
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
      case OPS.paintSolidColorImageMask:
        imageArea += clippedArea(state.matrix, view);
        break;
      case OPS.showText:
        for (const glyph of args[0] as unknown[]) {
          if (typeof glyph === "object" && glyph !== null && "unicode" in glyph) {
            glyphs.push({
              text: String(glyph.unicode),
              visible: !INVISIBLE_MODES.has(state.renderMode),
            });
          }
        }
        break;
    }
  });
  return { imageArea, glyphs };
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Render modes that draw nothing: 3 (invisible, as OCR layers are) and 7 (clip only). */
const INVISIBLE_MODES = new Set([3, 7]);

/**
 * The text items with a visible character. Items come in the order their glyphs were shown, so
 * the glyphs are matched to them character by character, spaces aside. When they do not line
 * up, every item counts as invisible, so a page is never read as text it may not show.
 */
function visibleItems(items: TextItem[], glyphs: Glyph[]): TextItem[] {
  if (glyphs.every(({ visible }) => visible)) {
    return items;
  }
  const characters = glyphs.flatMap(({ text, visible }) =>
    [...text.replace(/\s/g, "")].map(() => visible),
  );
  let next = 0;
  const visible = items.filter((item) => {
    const length = [...item.str.replace(/\s/g, "")].length;
    const shown = characters.slice(next, next + length).some(Boolean);
    next += length;
    return shown;
  });
  return next === characters.length ? visible : [];
}

/** The area of the unit square, where an image is drawn, mapped by `matrix` and clipped to the page. */
function clippedArea(
  [a, b, c, d, e, f]: Matrix,
  [left = 0, bottom = 0, right = 0, top = 0]: number[],
) {
  const xs = [e, a + e, c + e, a + c + e];
  const ys = [f, b + f, d + f, b + d + f];
  const width = Math.min(right, Math.max(...xs)) - Math.max(left, Math.min(...xs));
  const height = Math.min(top, Math.max(...ys)) - Math.max(bottom, Math.min(...ys));
  return Math.max(0, width) * Math.max(0, height);
}

/** `m` applied first, then `n`, as PDF concatenates transforms. */
function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

const MAX_PAGES = 1000;
/** What the API receives back, so a small file cannot hand it a huge result. */
const MAX_TEXT_BYTES = 4 * 1024 * 1024;

// Last, so the constants above are set when the worker starts reading.
parentPort?.postMessage(await readPages(workerData as Uint8Array));
