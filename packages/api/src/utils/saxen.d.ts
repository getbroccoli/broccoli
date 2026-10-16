/** The part of saxen's untyped API the Excel reader uses. */
declare module "saxen" {
  export class Parser {
    on(
      event: "openTag",
      callback: (
        name: string,
        attributes: () => Record<string, string>,
        decodeEntities: (value: string) => string,
      ) => void,
    ): void;
    on(event: "error", callback: (error: Error) => void): void;
    parse(xml: string): void;
  }
}
