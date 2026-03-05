import path from "path";
import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ],
  test: {
    pool: "forks",
    include: ["src/**/*.test.ts", "pipeline/**/*.test.ts"],
    teardownTimeout: 1000,
  },
});
