import type { PdfPage, PdfTextItem, PdfWord, PdfWordPage } from "../../../../utils";

/**
 * The native words shown on each page: at least 80 % of the box inside the page, and drawn where
 * PDF.js shows the same text, so text PDF.js leaves out as invisible stays out. Null when the
 * two readers count different pages.
 */
export function visibleNativeWords(
  pdfJsPages: PdfPage[],
  wordPages: PdfWordPage[],
): PdfWordPage[] | null {
  if (pdfJsPages.length !== wordPages.length) return null;
  return wordPages.map((wordPage, index) => {
    const pdfJsPage = pdfJsPages[index]!;
    return {
      ...wordPage,
      words: wordPage.words.filter(
        (word) => isInsidePage(word, wordPage) && isShown(word, pdfJsPage),
      ),
    };
  });
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

/**
 * Whether PDF.js shows the word: on one line of the items its box overlaps, each grown by its own
 * height above and below since the two readers place some fonts up to a line apart, the items
 * read from the left hold its text. PyMuPDF may join text running into the next column into one
 * word.
 */
function isShown(word: PdfWord, page: PdfPage): boolean {
  const lines = new Map<number, PdfTextItem[]>();
  for (const item of page.items) {
    const baseline = page.height - item.y;
    const overlaps =
      item.x < word.right &&
      item.x + item.width > word.left &&
      baseline - 2 * item.height < word.bottom &&
      baseline + item.height > word.top;
    if (overlaps)
      lines.set(Math.round(baseline), [...(lines.get(Math.round(baseline)) ?? []), item]);
  }
  return [...lines.values()].some((items) =>
    items
      .toSorted((a, b) => a.x - b.x)
      .map(({ text }) => compact(text))
      .join("")
      .includes(compact(word.text)),
  );
}

function compact(text: string): string {
  return text.replace(/\s+/gu, "");
}
