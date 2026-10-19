import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/motion/button";
import { Checkbox } from "@/components/motion/checkbox";
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
}: {
  links: ReplayLink[];
  view: string;
}) {
  const [multiple, setMultiple] = useState(false);
  const [rate, setRate] = useState("1");
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const position = useRef({ time: 0, paused: true });
  const [, setError] = useErrorState();
  const visible = multiple ? links : links.filter((link) => link.view === view);
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
      <div className="replay-controls">
        <Checkbox
          label="多视角同步"
          checked={multiple}
          disabled={links.length < 2}
          onCheckedChange={setMultiple}
        />
        <label>
          播放速度
          <Select value={rate} onValueChange={setRate}>
            <SelectTrigger aria-label="播放速度">
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
        <Button size="sm" variant="ghost" onClick={() => synchronize(true)}>
          同步画面
        </Button>
        <span>声音与播放控制跟随所选视角</span>
      </div>
      <div className={`replay-streams ${multiple ? "multiple" : ""}`}>
        {visible.map((link) => (
          <div key={link.view}>
            <div className="replay-stream-label">
              {link.label}
              {link.view === view ? " · 主视角 / 声音" : " · 静音同步"}
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
              onError={setError}
            />
          </div>
        ))}
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
  onError,
}: {
  link: ReplayLink;
  primary: boolean;
  register: (video: HTMLVideoElement | null) => void;
  onReady: (video: HTMLVideoElement) => void;
  onChange: () => void;
  onTime: () => void;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current!;
    let active = true;
    let hls: import("hls.js").default | undefined;
    if (
      /\.m3u8(?:$|[?#])/i.test(link.url) &&
      !video.canPlayType("application/vnd.apple.mpegurl")
    ) {
      void import("hls.js").then(({ default: Hls }) => {
        if (!active) return;
        if (!Hls.isSupported()) {
          onError("当前窗口不支持此 HLS 回放，请使用外部播放器。");
          return;
        }
        hls = new Hls();
        hls.loadSource(link.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal)
            onError("HLS 回放加载失败，请重新获取链接或使用外部播放器。");
        });
      });
    } else video.src = link.url;
    return () => {
      active = false;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [link.url]);
  return (
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
      onLoadedMetadata={(event) => onReady(event.currentTarget)}
      onPlay={primary ? onChange : undefined}
      onPause={primary ? onChange : undefined}
      onSeeked={primary ? onChange : undefined}
      onRateChange={primary ? onChange : undefined}
      onTimeUpdate={onTime}
      onError={() =>
        onError("回放加载失败，请重新获取链接，或使用外部播放器打开。")
      }
    />
  );
}
