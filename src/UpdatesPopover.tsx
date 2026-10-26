import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  type RefObject,
} from "react";
import { Bell, ArrowRight, X } from "lucide-react";
import { Card } from "@/components/motion/card";
import { Button } from "@/components/motion/button";
import { AnimatedBadge } from "@/components/motion/animated-badge";
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
  const recent = [...changes]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 6);
  useEffect(() => {
    close.current?.focus();
    return () => trigger.current?.focus({ preventScroll: true });
  }, [trigger]);
  return createPortal(
    <div className="updates-popover-wrap" style={anchor}>
      <button
        className="updates-backdrop"
        tabIndex={-1}
        aria-label="关闭通知面板"
        onClick={onClose}
      />
      <Card
        role="dialog"
        aria-label="最近更新"
        className="updates-popover"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="updates-heading">
          <div>
            <Bell size={16} />
            <h2>最近更新</h2>
            <span>{changes.length}</span>
          </div>
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
        <div className="updates-list">
          {recent.length ? (
            recent.map((change) => (
              <button
                className="update-item"
                key={change.id}
                onClick={() => onSelect(change)}
              >
                <span
                  className={`update-kind-dot ${change.kind === "删除" ? "removed" : ""}`}
                />
                <span className="update-item-content">
                  <strong>{change.title}</strong>
                  <span className="update-item-meta">
                    <AnimatedBadge size="sm" status="neutral" showIcon={false}>
                      {change.category}
                    </AnimatedBadge>
                    <span>{change.kind}</span>
                    <time
                      dateTime={change.time}
                      title={new Date(change.time).toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    >
                      {new Intl.DateTimeFormat("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(new Date(change.time))}
                    </time>
                  </span>
                </span>
                <ArrowRight size={14} className="update-open-icon" />
              </button>
            ))
          ) : (
            <div className="updates-empty">
              <Bell size={22} />
              <strong>暂无更新</strong>
              <p>同步后，数据变化会显示在这里。</p>
            </div>
          )}
        </div>
        {changes.length > 0 && (
          <footer>
            <Button variant="ghost" size="sm" onClick={onViewAll}>
              查看全部 {changes.length} 条变更
              <ArrowRight size={14} />
            </Button>
          </footer>
        )}
      </Card>
    </div>,
    document.body,
  );
}
