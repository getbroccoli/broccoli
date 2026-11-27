import { Button } from "@/components/ui/button";

import type { TaskRow } from "./taskText";

type Props = {
  options: NonNullable<TaskRow["resultForm"]>["options"];
  chosenCode: string | null;
  isPending: boolean;
  onChoose: (option: Props["options"][number]) => void;
};

/** A result form shown as buttons: in the task panel's header in place of Mark done, or on the record it decides. */
export function TaskResultButtons({ options, chosenCode, isPending, onChoose }: Props) {
  // The first option leads until another is chosen.
  const leading = chosenCode ?? options[0]!.code;
  return (
    // On a phone the options take their own row under the title, keeping Close in reach.
    <div className="order-last flex basis-full flex-wrap gap-2 sm:order-none sm:basis-auto">
      {options.map((option) => (
        <Button
          key={option.code}
          size="sm"
          variant={option.code === leading ? "default" : "outline"}
          aria-pressed={option.code === chosenCode}
          // A long label wraps inside its button rather than running out of the panel.
          className="h-auto min-h-7 max-w-full py-1 text-left break-words whitespace-normal"
          disabled={isPending}
          onClick={() => onChoose(option)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
