/** A stored value as its GraphQL enum value, which is the same words in capitals. */
export function toEnum<Value extends string>(value: Value): Uppercase<Value> {
  return value.toUpperCase() as Uppercase<Value>;
}
