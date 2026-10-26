import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps all asset + data URLs relative, so the built site works from
// any sub-path (e.g. https://user.github.io/repo/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
});
