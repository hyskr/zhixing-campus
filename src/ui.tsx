import { createPortal } from "react-dom";
import { schoolTime } from "./schoolTime";
import MobileDetailPage from "./MobileDetailPage";
import { useCompactLayout } from "./platform";
import { usePreferences } from "./preferences";
import {
  AnimatedToastStack,
  useAnimatedToastStack,
  type ToastStatus,
  type AnimatedToastAction,
} from "@/components/motion/animated-toast-stack";
import { StatefulButton } from "@/components/motion/button";
import {
  CenterMorphModal,
  CenterMorphModalContent,
} from "@/components/motion/center-morph-modal";
import { Drawer } from "@/components/motion/drawer";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
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
  classrooms: MapPin,
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
  Number.isFinite(schoolTime(date))
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
      }).format(new Date(schoolTime(date)))
    : "未提供";
export const fullDate = (date: string) =>
  Number.isFinite(schoolTime(date))
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(schoolTime(date)))
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
  icon,
}: {
  title?: string;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ?? <BookOpen size={34} strokeWidth={1.4} />}
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
const desktopDetailStack: symbol[] = [];

function useNarrowDesktop() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1179px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1179px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

function DesktopDetailPage({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const idRef = useRef<symbol | null>(null);
  if (!idRef.current) idRef.current = Symbol();
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useLayoutEffect(() => {
    const id = idRef.current!;
    desktopDetailStack.push(id);
    const page = ref.current;
    const focused = document.activeElement as HTMLElement | null;
    page
      ?.querySelector<HTMLButtonElement>(".desktop-detail-back")
      ?.focus({ preventScroll: true });
    const onNavigate = () => {
      closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (desktopDetailStack.at(-1) !== id) return;
      if (document.fullscreenElement) return;
      const openOverlay = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"], [role="listbox"], [role="menu"]',
        ),
      ].some((el) => el.getClientRects().length > 0);
      if (openOverlay) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener("campus:navigate", onNavigate);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("campus:navigate", onNavigate);
      window.removeEventListener("keydown", onKeyDown);
      const idx = desktopDetailStack.indexOf(id);
      if (idx >= 0) desktopDetailStack.splice(idx, 1);
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, []);
  const target = document.querySelector(".main-stage") ?? document.body;
  return createPortal(
    <section
      ref={ref}
      className="desktop-detail-page"
      role="region"
      aria-label={title}
    >
      <header className="desktop-detail-header">
        <Button
          variant="ghost"
          size="sm"
          className="desktop-detail-back"
          onClick={onClose}
        >
          <ArrowLeft size={15} />
          返回
        </Button>
        <div className="desktop-detail-titles">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      <div className="desktop-detail-body">
        <div className="desktop-detail-inner">{children}</div>
      </div>
    </section>,
    target,
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  side = false,
  presentation = "page",
  pageable = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  side?: boolean;
  presentation?: "page" | "dialog";
  pageable?: boolean | "always";
}) {
  const compact = useCompactLayout();
  const narrowDesktop = useNarrowDesktop();
  const { preferences } = usePreferences();
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) closeRef.current();
  }, []);
  if (compact && presentation === "page")
    return (
      <MobileDetailPage title={title} subtitle={subtitle} onBack={onClose}>
        {children}
      </MobileDetailPage>
    );
  const useDesktopPage =
    !compact &&
    presentation === "page" &&
    !!pageable &&
    (preferences.detailPresentation === "page" ||
      (preferences.detailPresentation === "auto" &&
        (pageable === "always" || narrowDesktop)));
  if (useDesktopPage)
    return (
      <DesktopDetailPage title={title} subtitle={subtitle} onClose={onClose}>
        {children}
      </DesktopDetailPage>
    );
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
        className={`campus-modal ${wide ? "wide" : ""} ${presentation === "dialog" ? "campus-confirmation" : ""}`}
      >
        {content}
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}

export function DiscardDraft({
  title,
  detail,
  onKeep,
  onDiscard,
}: {
  title: string;
  detail: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <Modal title={title} onClose={onKeep} presentation="dialog">
      <p className="discard-draft-copy">{detail}</p>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onKeep}>
          继续编辑
        </Button>
        <Button onClick={onDiscard}>放弃编辑</Button>
      </div>
    </Modal>
  );
}

type FeedbackDetail = {
  id?: string;
  description?: string;
  duration?: number;
  message: string;
  variant: ToastStatus;
  action?: AnimatedToastAction;
};
export function showFeedback(
  message: string,
  variant: ToastStatus = "success",
  action?: AnimatedToastAction,
  id?: string,
  options?: { description?: string; duration?: number },
) {
  if (message)
    window.dispatchEvent(
      new CustomEvent<FeedbackDetail>("campus:feedback", {
        detail: { message, variant, action, id, ...options },
      }),
    );
}
export function dismissFeedback(id: string) {
  window.dispatchEvent(
    new CustomEvent("campus:feedback-dismiss", { detail: id }),
  );
}
export function useFeedback(variant: ToastStatus = "success") {
  return useCallback(
    (
      message: string,
      kind: ToastStatus = variant,
      action?: AnimatedToastAction,
    ) => {
      showFeedback(message, kind, action);
    },
    [variant],
  );
}
/** 保留页面所需的失败状态，操作原因统一交给浮动提示。 */
export function useErrorState() {
  const [error, storeError] = useState("");
  const notify = useFeedback("error");
  const setError = useCallback(
    (message: string) => {
      storeError(message);
      if (message)
        notify(message, message === "此目录暂无可下载文件" ? "info" : "error");
    },
    [notify],
  );
  return [error, setError] as const;
}
export function FeedbackAlerts() {
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  useEffect(() => {
    const update = () => setPortalRoot(document.fullscreenElement);
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const { toasts, showToast, dismissToast } = useAnimatedToastStack({
    defaultDuration: 4500,
    limit: 3,
  });
  useEffect(() => {
    const receive = (event: Event) => {
      const { message, variant, action, id, description, duration } = (
        event as CustomEvent<FeedbackDetail>
      ).detail;
      showToast({
        id,
        title: message,
        description,
        status: variant,
        action,
        duration:
          duration ?? (variant === "error" ? 10000 : action ? 8000 : 4500),
      });
    };
    const dismiss = (event: Event) =>
      dismissToast((event as CustomEvent<string>).detail);
    window.addEventListener("campus:feedback", receive);
    window.addEventListener("campus:feedback-dismiss", dismiss);
    return () => {
      window.removeEventListener("campus:feedback", receive);
      window.removeEventListener("campus:feedback-dismiss", dismiss);
    };
  }, [showToast, dismissToast]);
  return (
    <AnimatedToastStack
      toasts={toasts}
      onDismiss={dismissToast}
      placement="fixed"
      portalRoot={portalRoot}
      position="bottom-right"
      maxVisible={3}
      className="campus-feedback-toasts"
      classNames={{
        surface: "campus-feedback-surface",
        title: "campus-feedback-title",
        description: "campus-feedback-description",
        action: "campus-feedback-action",
        close: "campus-feedback-close",
      }}
    />
  );
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
