import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src"),
  build: {
    outDir: path.resolve(__dirname, "../../dist"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@funda/shared": path.resolve(__dirname, "../shared/src"),
      "@funda/keyword-engine": path.resolve(__dirname, "../keyword-engine/src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
  // current maintained package for in-browser Whisper
  "@capawesome/capacitor-file-picker",
  "@capacitor/share",
];

const stubPlugin = {
  name: "stub-unresolvable-packages",
  resolveId(id: string) {
    if (STUB_PACKAGES.includes(id)) return "\0stub:" + id;
  },
  load(id: string) {
    if (id.startsWith("\0stub:")) return "export default {}; export const pipeline = undefined; export const env = {};";
  },
};

export default defineConfig({
  plugins: [react(), stubPlugin],
  root: path.resolve(__dirname, "src"),
  build: {
    outDir: path.resolve(__dirname, "../../dist"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@funda/shared": path.resolve(__dirname, "../shared/src"),
      "@funda/keyword-engine": path.resolve(__dirname, "../keyword-engine/src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
