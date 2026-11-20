import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  type CSSProperties,
  type RefObject,
} from "react";
import { ArrowUpRight, X } from "lucide-react";
import { Card } from "@/components/motion/card";
import { Button } from "@/components/motion/button";
import ActivityFeed from "./ActivityFeed";
import type { Change } from "./types";

export default function UpdatesPopover({
  changes,
  trigger,
  onClose,
  onSelect,
  onViewAll,
}: {
  changes: Change[];
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSelect: (change: Change) => void;
  onViewAll: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState({ top: 64, right: 16 });
  useLayoutEffect(() => {
    const position = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect)
        setAnchor({
          top: rect.bottom + 8,
          right: Math.max(16, window.innerWidth - rect.right),
        });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [trigger]);
  useEffect(() => {
    window.dispatchEvent(new Event("campus:close-page-menus"));
    close.current?.focus();
    return () => trigger.current?.focus({ preventScroll: true });
  }, [trigger]);
  return createPortal(
    <div
      className="campus-activity-anchor"
      style={{ ...anchor, "--activity-anchor-top": `${anchor.top}px` } as CSSProperties}
    >
      <button
        className="campus-activity-dismiss"
        tabIndex={-1}
        aria-label="关闭通知面板"
        type="button"
        onClick={onClose}
      />
      <Card
        role="dialog"
        aria-label="最近更新"
        className="campus-activity-panel"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="campus-activity-heading">
          <h2>最近更新</h2>
          <Button
            ref={close}
            size="icon"
            variant="ghost"
            aria-label="关闭通知"
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </header>
        <div className="campus-activity-content">
          <ActivityFeed changes={changes} limit={6} onSelect={onSelect} />
        </div>
        {changes.length > 0 && (
          <footer className="campus-activity-footer">
            <Button variant="ghost" size="sm" onClick={onViewAll}>
              查看全部动态
              <ArrowUpRight size={14} aria-hidden="true" />
            </Button>
          </footer>
        )}
      </Card>
    </div>,
    document.body,
  );
}
