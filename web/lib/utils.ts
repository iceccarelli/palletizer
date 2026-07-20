import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional + Tailwind classes safely (later class wins on conflicts). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
