import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Preferences } from "./types";
export const defaultPreferences: Preferences = {
  quickLogin: true,
  resourcePort: 1936,
  downloadConcurrency: 3,
  reuseUploads: true,
  saveUploads: true,
  networkReconnect: false,
  networkAccount: "",
  networkInterval: 60,
  mailNotifications: false,
  mailAccount: "",
  mailInterval: 10,
};
const Context = createContext<{
  preferences: Preferences;
  ready: boolean;
  save: (next: Preferences) => Promise<void>;
}>({ preferences: defaultPreferences, ready: false, save: async () => {} });
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const load = isTauri()
      ? invoke<Preferences>("get_preferences")
      : Promise.resolve(
          JSON.parse(localStorage.getItem("zhixing.preferences") || "null") ??
            defaultPreferences,
        );
    void load
      .then((value) => {
        if (active) setPreferences({ ...defaultPreferences, ...value });
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(next: Preferences) {
    if (isTauri()) await invoke("set_preferences", { preferences: next });
    else localStorage.setItem("zhixing.preferences", JSON.stringify(next));
    setPreferences(next);
  }
  return (
    <Context.Provider value={{ preferences, ready, save }}>
      {children}
    </Context.Provider>
  );
}
export const usePreferences = () => useContext(Context);
