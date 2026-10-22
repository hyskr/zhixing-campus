import { Button } from "@/components/motion/button";
import { Check, Palette } from "lucide-react";
import { usePreferences } from "./preferences";
import { useErrorState, useFeedback } from "./ui";
export default function AppearanceSettings() {
  const { preferences, ready, save } = usePreferences();
  const [, setError] = useErrorState(),
    feedback = useFeedback();
  async function select(appearance: "classic" | "claude") {
    try {
      await save({ ...preferences, appearance });
      feedback(
        `已切换为 ${appearance === "claude" ? "Claude App" : "知行经典"} 风格`,
      );
    } catch (error) {
      setError(String(error));
    }
  }
  return (
    <section className="appearance-settings surface" aria-label="界面风格">
      <div className="appearance-options">
        {[
          {
            id: "classic",
            name: "知行经典",
            description: "清晰中性 · 紧凑工作台",
          },
          {
            id: "claude",
            name: "Claude App",
            description: "暖纸色 · 低对比边框 · 清晰正文",
          },
        ].map((style) => (
          <Button
            key={style.id}
            variant="ghost"
            className={`appearance-option ${style.id}`}
            aria-pressed={preferences.appearance === style.id}
            disabled={!ready}
            onClick={() => void select(style.id as "classic" | "claude")}
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
