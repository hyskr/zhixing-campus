import { useEffect, type ReactNode } from "react";
import { PullToRefresh } from "@/components/motion/pull-to-refresh";

type RefreshRequest = CustomEvent<{ refresh?: () => Promise<void> }>;
export function usePageRefresh(refresh: () => Promise<void>) {
  useEffect(() => {
    const listener = (event: Event) => {
      (event as RefreshRequest).detail.refresh = refresh;
    };
    window.addEventListener("campus:refresh-page", listener);
    return () => window.removeEventListener("campus:refresh-page", listener);
  }, [refresh]);
}
export function pageRefreshHandler() {
  const event: RefreshRequest = new CustomEvent("campus:refresh-page", {
    detail: {},
  });
  window.dispatchEvent(event);
  return event.detail.refresh;
}
export default function MobileRefreshSurface({
  refresh,
  refreshing,
  disabled,
  className,
  children,
  main = false,
}: {
  refresh?: () => Promise<void>;
  refreshing?: boolean;
  disabled?: boolean;
  className: string;
  children: ReactNode;
  main?: boolean;
}) {
  if (refresh)
    return (
      <PullToRefresh
        as={main ? "main" : "section"}
        onRefresh={refresh}
        refreshing={refreshing}
        disabled={disabled}
        className={main ? `${className} mobile-refresh-main` : className}
        pullingLabel="下拉刷新"
        releaseLabel="松开刷新"
        refreshingLabel="正在更新…"
        ariaLabel="下拉刷新当前页面"
      >
        {children}
      </PullToRefresh>
    );
  const Root = main ? "main" : "div";
  return <Root className={className}>{children}</Root>;
}
