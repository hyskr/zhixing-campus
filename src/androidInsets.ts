import { isAndroid } from "./platform";
type Insets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  keyboard: boolean;
};
// The native activity supplies physical pixels; CSS uses WebView pixels.
export function syncAndroidInsets() {
  if (!isAndroid) return;
  const native = (
    window as Window & { CampusWindow?: { systemInsets: () => string } }
  ).CampusWindow;
  if (!native) return;
  const update = () => {
    const value: Insets = JSON.parse(native.systemInsets()),
      root = document.documentElement,
      ratio = window.devicePixelRatio || 1;
    for (const side of ["top", "bottom", "left", "right"] as const)
      root.style.setProperty(`--safe-${side}`, `${value[side] / ratio}px`);
    root.dataset.keyboard = value.keyboard ? "open" : "closed";
  };
  update();
  window.addEventListener("campus:window-insets", update);
  window.addEventListener("resize", update);
}
