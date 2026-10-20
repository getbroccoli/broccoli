import type { MaskedWord } from "../../../../integrations/ai";

/** Words on one visual line in reading order, and the centre the line was started at. */
export interface VisualLine {
  y: number;
  words: MaskedWord[];
}

/**
 * The words by visual line: in reading order, by 3-point band and then from the left, a word joins
 * the line whose first centre lies within 3 points of its own. `centreOf` may round the centre.
 */
export function visualLines(
  words: MaskedWord[],
  centreOf: (word: MaskedWord) => number = centre,
): VisualLine[] {
  const lines: VisualLine[] = [];
  const ordered = words.toSorted(
    (a, b) => roundHalfEven(a.box[1] / 3) - roundHalfEven(b.box[1] / 3) || a.box[0] - b.box[0],
  );
  for (const word of ordered) {
    const y = centreOf(word);
    const last = lines.at(-1);
    if (last && Math.abs(last.y - y) <= LINE_GAP) last.words.push(word);
    else lines.push({ y, words: [word] });
  }
  return lines;
}

/** Python's `round`: halves go to the even neighbour, so lines group as the research grouped them. */
export function roundHalfEven(value: number, digits = 0): number {
  const scaled = value * 10 ** digits;
  const nearest = Math.round(scaled);
  const isHalf = Math.abs(scaled % 1) === 0.5;
  return (isHalf && nearest % 2 !== 0 ? nearest - 1 : nearest) / 10 ** digits;
}

export function centre({ box }: MaskedWord): number {
  return (box[1] + box[3]) / 2;
}

/** Words whose centres lie this close, in points, are on one visual line. */
const LINE_GAP = 3;
