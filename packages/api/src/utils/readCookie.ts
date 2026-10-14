/** The value of cookie `name` in a `Cookie` header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
