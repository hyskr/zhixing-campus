// BeUI 组件来源：https://beui.dev/r/bouncy-accordion.json
import { createContext, useContext, useState, type ReactNode } from "react";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
const SettingsGroupContext = createContext<{
  active: string | null;
  setActive: (id: string | null) => void;
} | null>(null);
export function SettingsGroups({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string | null>("login");
  return (
    <SettingsGroupContext.Provider value={{ active, setActive }}>
      <div className="settings-groups">{children}</div>
    </SettingsGroupContext.Provider>
  );
}
export function SettingsGroup({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const context = useContext(SettingsGroupContext);
  return (
    <BouncyAccordion
      items={[
        {
          id,
          title,
          description: (
            <div className="settings-group-content">
              <p className="settings-group-description">{description}</p>
              {children}
            </div>
          ),
        },
      ]}
      value={context?.active === id ? id : null}
      onValueChange={context?.setActive}
      className="campus-settings-group"
      classNames={{
        trigger: "campus-settings-trigger",
        content: "campus-settings-content",
      }}
    />
  );
}
