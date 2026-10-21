/** A, B, …, Z, AA, AB, … like a spreadsheet, from a 0-based column index. */
export function columnLetter(index: number): string {
  let letter = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letter = String.fromCharCode(65 + ((rest - 1) % 26)) + letter;
  }
  return letter;
}

/** The 0-based column index of a spreadsheet letter (`columnLetter`'s inverse). */
export function columnIndex(letter: string): number {
  return [...letter].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
}
