/** Python's `str.casefold` for the scripts staff lists use: lower case, with ß as ss. */
export function casefold(value: string): string {
  return value.toLowerCase().replaceAll("ß", "ss");
}
