import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { FilePreviewProvider } from "./FilePreview";
import { DownloadsProvider } from "./Downloads";
import { PreferencesProvider } from "./preferences";
import "./styles.css";
import "./appearance.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <DownloadsProvider>
        <FilePreviewProvider>
          <App />
        </FilePreviewProvider>
      </DownloadsProvider>
    </PreferencesProvider>
  </React.StrictMode>,
);
