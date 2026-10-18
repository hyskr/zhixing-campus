// Source: BeUI (MIT), https://github.com/starc007/ui-components; see licenses/beui.txt.
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
