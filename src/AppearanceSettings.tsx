import { Button } from "@/components/motion/button";
import { Check } from "lucide-react";
import { usePreferences } from "./preferences";
import { useErrorState, useFeedback } from "./ui";
import type { AppearanceTheme } from "./types";

const THEMES: { id: AppearanceTheme; name: string; description: string }[] = [
  {
    id: "classic",
    name: "知行经典",
    description: "松绿主色 · 中性浅灰 · 紧凑工作台",
  },
  {
    id: "claude",
    name: "Claude App",
    description: "暖纸色 · 陶土点缀 · 柔和阅读感",
  },
  {
    id: "slate",
    name: "晴空海蓝",
    description: "清透灰蓝 · 学术深蓝 · 冷静克制",
  },
  {
    id: "night",
    name: "静夜深色",
    description: "低眩光深灰 · 柔绿高亮 · 夜间护眼",
  },
];

export default function AppearanceSettings() {
  const { preferences, ready, save } = usePreferences();
  const [, setError] = useErrorState(),
    feedback = useFeedback();
  async function select(appearance: AppearanceTheme) {
    try {
      await save({ ...preferences, appearance });
      const chosen = THEMES.find((item) => item.id === appearance);
      feedback(`已切换为 ${chosen?.name ?? appearance} 风格`);
    } catch (error) {
      setError(String(error));
    }
  }
  return (
    <section className="appearance-settings" aria-label="界面风格">
      <div className="appearance-options">
        {THEMES.map((style) => (
          <Button
            key={style.id}
            variant="ghost"
            className={`appearance-option ${style.id}`}
            aria-pressed={preferences.appearance === style.id}
            disabled={!ready}
            onClick={() => void select(style.id)}
          >
            <span className="appearance-mini" aria-hidden="true">
              <i />
              <span>
                <b />
                <em />
                <em />
              </span>
            </span>
            <span className="appearance-copy">
              <strong>{style.name}</strong>
              <small>{style.description}</small>
            </span>
            {preferences.appearance === style.id && <Check size={15} />}
          </Button>
        ))}
      </div>
    </section>
  );
}
