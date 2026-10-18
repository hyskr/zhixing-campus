import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
});
