import type { GraphQLCodegenDataMasking } from "@apollo/client/masking";

declare module "@apollo/client" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the augmentation must merge into the interface
  export interface TypeOverrides extends GraphQLCodegenDataMasking.TypeOverrides {}
}
