import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/motion/button";

// Mobile content destinations occupy the screen; short decisions remain dialogs.
export default function MobileDetailPage({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null),
    backRef = useRef(onBack),
    titleId = useId();
  useLayoutEffect(() => {
    backRef.current = onBack;
  }, [onBack]);
  useLayoutEffect(() => {
    const page = ref.current!;
    const pages = [
      ...document.querySelectorAll<HTMLElement>("[data-mobile-page]"),
    ];
    page.style.zIndex = String(110 + pages.indexOf(page) * 5);
    const previous = pages.at(-2) ?? document.getElementById("root");
    const wasInert = previous?.inert ?? false;
    if (previous) previous.inert = true;
    document.documentElement.dataset.mobileView = "open";
    const focused = document.activeElement as HTMLElement | null;
    page
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    const back = (event: Event) => {
      if (
        event.defaultPrevented ||
        [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some(
          (el) => !el.closest("[inert]") && el.getClientRects().length > 0,
        )
      )
        return;
      if ([...document.querySelectorAll("[data-mobile-page]")].at(-1) !== page)
        return;
      event.preventDefault();
      backRef.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") back(event);
    };
    window.addEventListener("campus:before-back", back);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("campus:before-back", back);
      window.removeEventListener("keydown", key);
      if (previous) previous.inert = wasInert;
      if (
        ![...document.querySelectorAll("[data-mobile-page]")].some(
          (el) => el !== page,
        )
      )
        delete document.documentElement.dataset.mobileView;
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <section
      ref={ref}
      data-mobile-page
      className="mobile-detail-page"
      role="region"
      aria-labelledby={titleId}
    >
      <header className="mobile-detail-header">
        <Button variant="ghost" aria-label="返回上一页" onClick={onBack}>
          <ChevronLeft size={24} />
        </Button>
        <div>
          <h1 id={titleId}>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      <div className="mobile-detail-body">{children}</div>
    </section>,
    document.body,
  );
}
