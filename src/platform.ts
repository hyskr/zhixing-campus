import { useSyncExternalStore } from "react";
export const isAndroid =
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
const query = "(max-width: 760px)";
export function useCompactLayout() {
  return useSyncExternalStore(
    (callback) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
