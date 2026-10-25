import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import { syncAndroidInsets } from "./androidInsets";
import { isAndroid } from "./platform";
import React from "react";
import ReactDOM from "react-dom/client";
import { AppUpdaterProvider } from "./AppUpdater";
import App from "./App";
import { FilePreviewProvider } from "./FilePreview";
import { DownloadsProvider } from "./Downloads";
import { PreferencesProvider } from "./preferences";
import "./styles.css";
import "./interface.css";
import "./appearance.css";
import "./homepage.css";
import "./mobile.css";
import "./grades.css";
import "./mobile-surfaces.css";
if (isAndroid) document.documentElement.dataset.platform = "android";
syncAndroidInsets();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppUpdaterProvider>
      <PreferencesProvider>
        <DownloadsProvider>
          <FilePreviewProvider>
            <App />
          </FilePreviewProvider>
        </DownloadsProvider>
      </PreferencesProvider>
    </AppUpdaterProvider>
  </React.StrictMode>,
);
