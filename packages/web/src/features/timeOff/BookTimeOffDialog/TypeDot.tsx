import { tileStyle } from "@/features/termsDisplay";

type Props = { colour: Parameters<typeof tileStyle>[0] };

/** A type's colour as a dot, beside its name in the type menu. */
export function TypeDot({ colour }: Props) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: tileStyle(colour).color }}
    />
  );
}
