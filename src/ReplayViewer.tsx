import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/motion/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import type { ReplayLink } from "./types";
import { useErrorState } from "./ui";

// 多视角同步与单路音频参考：
// https://github.com/57Darling02/BjtuCoursePlatform/blob/a426761cbb8d38e218ba59653bfaf5f49c3fc47e/src/features/replay/components/CourseReplaySyncPlayer.vue
export default function ReplayViewer({
  links,
  view,
  onViewChange,
  onRefresh,
  refreshing = false,
}: {
  links: ReplayLink[];
  view: string;
  onViewChange: (view: string) => void;
  onRefresh: () => Promise<void>;
  refreshing?: boolean;
}) {
  const [multiple, setMultiple] = useState(false);
  const [rate, setRate] = useState("1");
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const position = useRef({ time: 0, paused: true });
  const [, setError] = useErrorState();
  const visible = multiple
    ? [...links].sort(
        (a, b) => Number(b.view === view) - Number(a.view === view),
      )
    : links.filter((link) => link.view === view);
  const primaryLabel =
    links.find((link) => link.view === view)?.label ?? "所选画面";
  const master = () => videos.current.get(view);
  function synchronize(force = false) {
    const leader = master();
    if (!leader?.readyState) return;
    position.current = { time: leader.currentTime, paused: leader.paused };
    for (const [key, follower] of videos.current) {
      if (key === view || !follower.readyState) continue;
      if (force || Math.abs(follower.currentTime - leader.currentTime) > 0.4)
        follower.currentTime = leader.currentTime;
      follower.playbackRate = leader.playbackRate;
      if (leader.paused) follower.pause();
      else if (follower.paused)
        void follower
          .play()
          .catch(() => setError("副视角播放失败，请重新播放或切换单视角。"));
    }
  }
  useEffect(() => {
    const video = master();
    if (video) {
      video.playbackRate = Number(rate);
      synchronize(true);
    }
  }, [rate, view, multiple]);
  useEffect(() => {
    const timer = window.setInterval(() => synchronize(), 1000);
    return () => clearInterval(timer);
  }, [view]);
  return (
    <section className="replay-viewer">
      <div className="replay-playback-setup">
        <Tabs
          value={multiple ? "multiple" : "single"}
          onValueChange={(value) => setMultiple(value === "multiple")}
          variant="segment"
          className="replay-mode-tabs"
        >
          <TabsList aria-label="播放方式">
            <TabsTrigger value="single">单画面</TabsTrigger>
            <TabsTrigger value="multiple" disabled={links.length < 2}>
              多画面同步
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="replay-master-picker">
          <span>{multiple ? "主画面与声音" : "选择画面"}</span>
          <Select value={view} onValueChange={onViewChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {links.map((link) => (
                <SelectItem key={link.view} value={link.view}>
                  {link.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {multiple && (
          <p className="replay-mode-help">
            在下方“{primaryLabel}
            ”点击播放或拖动进度，其他画面会同步跟随并保持静音。
          </p>
        )}
      </div>
      <div className={`replay-streams ${multiple ? "multiple" : ""}`}>
        {visible.map((link) => (
          <div
            key={link.view}
            className={
              link.view === view
                ? "replay-primary-stream"
                : "replay-secondary-stream"
            }
          >
            <div className="replay-stream-label">
              {link.label}
              {multiple &&
                (link.view === view ? (
                  <span className="replay-primary-label">主画面 · 有声音</span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onViewChange(link.view)}
                  >
                    设为主画面
                  </Button>
                ))}
            </div>
            <Stream
              link={link}
              primary={link.view === view}
              register={(video) => {
                if (video) videos.current.set(link.view, video);
                else videos.current.delete(link.view);
              }}
              onReady={(video) => {
                video.playbackRate = Number(rate);
                video.currentTime = position.current.time;
                if (!position.current.paused)
                  void video
                    .play()
                    .catch(() => setError("请点击播放继续回放。"));
                synchronize(true);
              }}
              onChange={() => synchronize(true)}
              onTime={() => {
                if (link.view === view) {
                  const video = master();
                  if (video)
                    position.current = {
                      time: video.currentTime,
                      paused: video.paused,
                    };
                }
              }}
              onRefresh={onRefresh}
              refreshing={refreshing}
            />
          </div>
        ))}
      </div>
      <div className="replay-controls">
        <label>
          <span>播放速度</span>
          <Select value={rate} onValueChange={setRate}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0.75, 1, 1.25, 1.5, 2].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {multiple && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => synchronize(true)}
          >
            <RefreshCw size={14} />
            重新对齐画面
          </Button>
        )}
      </div>
    </section>
  );
}
function Stream({
  link,
  primary,
  register,
  onReady,
  onChange,
  onTime,
  onRefresh,
  refreshing,
}: {
  link: ReplayLink;
  primary: boolean;
  register: (video: HTMLVideoElement | null) => void;
  onReady: (video: HTMLVideoElement) => void;
  onChange: () => void;
  onTime: () => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const video = ref.current!;
    setFailure("");
    let active = true;
    let hls: import("hls.js").default | undefined;
    if (
      /\.m3u8(?:$|[?#])/i.test(link.url) &&
      !video.canPlayType("application/vnd.apple.mpegurl")
    ) {
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (!active) return;
          if (!Hls.isSupported()) {
            setFailure("当前系统无法解码此 HLS 回放，可在下方外部打开。");
            return;
          }
          hls = new Hls();
          hls.loadSource(link.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal)
              setFailure("视频流读取失败，请刷新播放地址后重试。");
          });
        })
        .catch(() => {
          if (active) setFailure("播放器未能加载，请重新打开回放。");
        });
    } else {
      video.src = link.url;
      video.load();
    }
    return () => {
      active = false;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [link.url]);
  return (
    <div className="replay-stream-surface">
      <video
        ref={(video) => {
          ref.current = video;
          register(video);
        }}
        className="replay-video"
        controls={primary}
        muted={!primary}
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          setFailure("");
          onReady(event.currentTarget);
        }}
        onPlay={primary ? onChange : undefined}
        onPause={primary ? onChange : undefined}
        onSeeked={primary ? onChange : undefined}
        onRateChange={primary ? onChange : undefined}
        onTimeUpdate={onTime}
        onError={() => {
          const code = ref.current?.error?.code;
          setFailure(
            code === 3
              ? "视频格式无法解码，可尝试切换视角或在外部打开。"
              : code === 2
                ? "视频连接中断，请检查网络并刷新播放地址。"
                : "无法读取视频，请刷新播放地址；仍失败时可在外部打开。",
          );
        }}
      />
      {failure && (
        <div className="replay-playback-error" role="status">
          <p>{failure}</p>
          <Button
            variant="secondary"
            disabled={refreshing}
            onClick={() => void onRefresh()}
          >
            <RefreshCw size={16} className={refreshing ? "spin" : ""} />
            {refreshing ? "正在获取" : "重新获取视频"}
          </Button>
        </div>
      )}
    </div>
  );
}
