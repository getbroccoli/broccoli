import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names, skipping falsy ones, and lets later Tailwind classes override
 * conflicting earlier ones: `cn("px-2", isWide && "px-4")` gives `"px-4"`. Named `cn`
 * because every shadcn component imports it by that name.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
