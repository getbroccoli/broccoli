type Props = {
  oldValue: string | null;
  newValue: string | null;
};

/** A field's old value struck through, then its new one; either may be missing. */
export function ChangeValues({ oldValue, newValue }: Props) {
  return (
    <>
      {oldValue !== null && <del className="text-muted-foreground">{oldValue}</del>}
      {oldValue !== null && newValue !== null && (
        <span aria-hidden className="text-muted-foreground">
          {" → "}
        </span>
      )}
      {newValue !== null && <ins className="font-medium no-underline">{newValue}</ins>}
    </>
  );
}
