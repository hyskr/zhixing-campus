import { isAndroid } from "./platform";
import { haptic } from "./haptics";

// 横向内容控件拥有自己的手势；页面标签只处理剩余区域。
export function bindTabSwipe(
  surface: HTMLElement,
  change: (direction: number) => boolean,
) {
  if (!isAndroid) return () => {};
  let start: { x: number; y: number } | null = null;

  const begin = (event: TouchEvent) => {
    start = null;
    const target = event.target instanceof Element ? event.target : null;
    if (event.touches.length !== 1 || !target) return;
    if (target.closest("[data-tab-swipe-surface]") !== surface) return;
    if (
      target.closest(
        'input,textarea,select,[contenteditable="true"],video,audio,canvas,iframe,[role="slider"],.mobile-week-grid,.mobile-mail-swipe,[data-no-tab-swipe]',
      )
    )
      return;
    let node: Element | null = target;
    while (node && node !== surface) {
      const style = getComputedStyle(node);
      if (
        node.scrollWidth > node.clientWidth + 1 &&
        /auto|scroll/.test(style.overflowX)
      )
        return;
      node = node.parentElement;
    }
    const touch = event.touches[0];
    // 留出 Android 系统返回手势的边缘区域。
    if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
    start = { x: touch.clientX, y: touch.clientY };
  };
  const move = (event: TouchEvent) => {
    if (!start) return;
    if (event.touches.length !== 1) {
      start = null;
      return;
    }
    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - start.x),
      dy = Math.abs(touch.clientY - start.y);
    if (dy > 12 && dy >= dx) start = null;
  };
  const end = (event: TouchEvent) => {
    const origin = start;
    start = null;
    if (!origin || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - origin.x,
      dy = touch.clientY - origin.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (change(dx < 0 ? 1 : -1)) {
      const stopClick = (click: MouseEvent) => {
        if (click.detail !== 0) {
          click.preventDefault();
          click.stopPropagation();
        }
        document.removeEventListener("click", stopClick, true);
      };
      document.addEventListener("click", stopClick, true);
      window.setTimeout(
        () => document.removeEventListener("click", stopClick, true),
        400,
      );
      if (event.cancelable) event.preventDefault();
      haptic();
    }
  };
  const cancel = () => {
    start = null;
  };
  surface.addEventListener("touchstart", begin, { passive: true });
  surface.addEventListener("touchmove", move, { passive: true });
  surface.addEventListener("touchend", end, { passive: false });
  surface.addEventListener("touchcancel", cancel);
  return () => {
    surface.removeEventListener("touchstart", begin);
    surface.removeEventListener("touchmove", move);
    surface.removeEventListener("touchend", end);
    surface.removeEventListener("touchcancel", cancel);
  };
}
