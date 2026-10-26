import { isTauri } from "@tauri-apps/api/core";
import { isAndroid } from "./platform";
export function haptic(kind: "selection" | "success" | "error" = "selection") {
  if (!isAndroid || !isTauri()) return;
  void import("@tauri-apps/plugin-haptics")
    .then((api) =>
      kind === "selection"
        ? api.selectionFeedback()
        : api.notificationFeedback(kind),
    )
    .catch(() => {});
}
