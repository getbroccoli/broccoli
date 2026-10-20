import type { PdfPage, PdfWord, PdfWordPage } from "../../../../utils";

/**
 * The native words on each page with at least 80 % of their box inside it; the reader already
 * leaves out text drawn invisibly. Null when the two readers count different pages.
 */
export function visibleNativeWords(
  pdfJsPages: PdfPage[],
  wordPages: PdfWordPage[],
): PdfWordPage[] | null {
  if (pdfJsPages.length !== wordPages.length) return null;
  return wordPages.map((wordPage) => ({
    ...wordPage,
    words: wordPage.words.filter((word) => isInsidePage(word, wordPage)),
  }));
}

/**
 * The native words as PDF.js items, so the layout builders read them: the baseline at 0.78 and the
 * height 0.73 of the box, as the research measured, with y from the page's bottom.
 */
export function nativeLayoutPages(pdfJsPages: PdfPage[], wordPages: PdfWordPage[]): PdfPage[] {
  return pdfJsPages.map((page, index) => ({
    ...page,
    items: (wordPages[index]?.words ?? []).map(({ text, left, top, right, bottom }) => ({
      text,
      x: left,
      y: page.height - (top + (bottom - top) * 0.78),
      width: right - left,
      height: (bottom - top) * 0.73,
    })),
  }));
}

/** A box is visible when at least this share of it lies on the page. */
const MIN_VISIBLE_SHARE = 0.8;

function isInsidePage(
  { left, top, right, bottom }: PdfWord,
  { width, height }: PdfWordPage,
): boolean {
  const area = (right - left) * (bottom - top);
  const inside =
    Math.max(0, Math.min(right, width) - Math.max(left, 0)) *
    Math.max(0, Math.min(bottom, height) - Math.max(top, 0));
  return area > 0 && inside / area >= MIN_VISIBLE_SHARE;
}
