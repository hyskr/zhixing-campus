import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const mobileHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    host: mobileHost || "127.0.0.1",
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
});
