import { defineConfig } from "vite";
import typescript from "@rollup/plugin-typescript";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "astro-content-loader",
      formats: ["es"],
      fileName: "index",
    },
    ssr: true,
    outDir: "dist",
    rollupOptions: {
      plugins: [
        typescript({
          noForceEmit: true,
        }),
      ],
    },
  },
});
