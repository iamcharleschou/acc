import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["cjs"],
  clean: true,
  dts: false,
  sourcemap: true,
  target: "node20",
  platform: "node",
  outDir: "dist",
  outExtension() {
    return { js: ".cjs" };
  }
});
