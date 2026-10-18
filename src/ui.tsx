import { createPortal } from "react-dom";
import {
  Alert,
  AlertClose,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from "@/components/motion/alert";
import { StatefulButton } from "@/components/motion/button";
import {
  CenterMorphModal,
  CenterMorphModalContent,
} from "@/components/motion/center-morph-modal";
import { Drawer } from "@/components/motion/drawer";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  FolderClosed,
  GraduationCap,
  Download,
  Wallet,
  House,
  Mail,
  MapPin,
  NotebookPen,
  RefreshCw,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/motion/button";
import { timeRemaining } from "./homework";

export const icons = {
  download: Download,
  services: Wallet,
  house: House,
  calendar: CalendarDays,
  graduation: GraduationCap,
  notebook: NotebookPen,
  folder: FolderClosed,
  mail: Mail,
  settings: Settings2,
  user: UserRound,
  help: CircleHelp,
};
export const periodTimes = [
  "08:00–09:50",
  "10:10–12:00",
  "12:10–14:00",
  "14:10–16:00",
  "16:20–18:10",
  "19:00–20:50",
  "21:00–21:50",
];
export const shortDate = (date: string) =>
  Number.isFinite(new Date(date).getTime())
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
      }).format(new Date(date))
    : "未提供";
export const fullDate = (date: string) =>
  Number.isFinite(new Date(date).getTime())
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(date))
    : "未提供时间";
export const remaining = timeRemaining;
export function SectionTitle({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button className="text-link" onClick={onAction}>
          {action}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  title = "这里还没有内容",
  detail = "同步校园数据后，内容会显示在这里。",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="empty">
      <BookOpen size={34} strokeWidth={1.4} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  side = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  side?: boolean;
}) {
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) closeRef.current();
  }, []);
  const content = (
    <div className="modal-inner">
      <div className="modal-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <Button size="icon" variant="ghost" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>
      {children}
    </div>
  );
  if (side)
    return (
      <Drawer
        open
        onOpenChange={handleOpenChange}
        ariaLabel={title}
        className="course-drawer"
      >
        {content}
      </Drawer>
    );
  return (
    <CenterMorphModal open onOpenChange={handleOpenChange}>
      <CenterMorphModalContent
        ariaLabel={title}
        showCloseButton={false}
        className={`campus-modal ${wide ? "wide" : ""}`}
      >
        {content}
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}

export function ErrorAlert({
  message,
  title = "操作未完成",
}: {
  message: string;
  title?: string;
}) {
  return (
    <Alert variant="destructive" className="campus-alert">
      <AlertIcon />
      <AlertContent>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </AlertContent>
    </Alert>
  );
}

type FeedbackVariant = "success" | "info";
export function useFeedback(variant: FeedbackVariant = "success") {
  return useCallback((message: string, kind: FeedbackVariant = variant) => {
    if (message) window.dispatchEvent(new CustomEvent("campus:feedback", { detail: { message, variant: kind } }));
  }, [variant]);
}
export function FeedbackAlerts() {
  const [feedback, setFeedback] = useState<{ id: number; message: string; variant: FeedbackVariant } | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; variant: FeedbackVariant }>).detail;
      setFeedback({ ...detail, id: ++sequence.current });
    };
    window.addEventListener("campus:feedback", receive);
    return () => window.removeEventListener("campus:feedback", receive);
  }, []);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4500);
    return () => clearTimeout(timer);
  }, [feedback]);
  return feedback ? createPortal(
    <div className="floating-feedback-alert">
      <Alert key={feedback.id} variant={feedback.variant} open onOpenChange={(open) => { if (!open) setFeedback(null); }} contentClassName="items-center">
        <AlertIcon />
        <AlertContent><AlertDescription>{feedback.message}</AlertDescription></AlertContent>
        <AlertClose aria-label="关闭提示" />
      </Alert>
    </div>, document.body
  ) : null;
}

export function SyncButton({
  syncing,
  label,
  onPress,
  idleLabel = "同步数据",
}: {
  syncing: boolean;
  idleLabel?: string;
  label?: string;
  onPress: () => void;
}) {
  return (
    <StatefulButton
      className="sync-button"
      state={syncing ? "loading" : "idle"}
      loadingText={label || "同步中"}
      icon={<RefreshCw size={15} />}
      onClick={onPress}
    >
      {idleLabel}
    </StatefulButton>
  );
}
export function Location({ place }: { place: string }) {
  return (
    <span className="location">
      <MapPin size={13} />
      {place}
    </span>
  );
}
export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}
export { ArrowUpRight, Clock3, FileText };
