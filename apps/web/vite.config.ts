import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const edgeTarget = process.env.VITE_EDGE_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: edgeTarget, changeOrigin: true },
      "/graphql": { target: edgeTarget, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    manifest: true,
    sourcemap: false,
  },
});
