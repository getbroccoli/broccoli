import { t, type MessageKey } from "@/i18n";

type Props = { steps: MessageKey[] };

/** Numbered steps to follow in another app. */
export function StepList({ steps }: Props) {
  return (
    <ol className="flex flex-col gap-2.5 text-sm">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-deep"
          >
            {index + 1}
          </span>
          <span className="pt-0.5">{t(step)}</span>
        </li>
      ))}
    </ol>
  );
}
