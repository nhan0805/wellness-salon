import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

function inlinePrismaQueryCompilerWasm() {
  return {
    name: "inline-prisma-query-compiler-wasm",
    enforce: "pre" as const,
    load(id: string) {
      const sourcePath = id
        .split("?", 1)[0]
        .replace(/^\0[^:]+:/, "");
      if (!sourcePath.endsWith("query_compiler_bg.wasm")) return undefined;

      const base64 = readFileSync(sourcePath).toString("base64");
      return `const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (character) => character.charCodeAt(0));\nexport default new WebAssembly.Module(bytes);`;
    },
  };
}

const cloudflareViteEnvironment =
  process.env.CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT === "true"
    ? { name: "rsc" }
    : { name: "rsc", childEnvironments: ["ssr"] };

export default defineConfig({
  // Prisma's D1 client loads its query compiler through a generated dynamic
  // import. Keep the package available to the Cloudflare bundler and treat
  // the compiler as a Worker asset instead of leaving a filesystem-relative
  // .wasm read in the output.
  assetsInclude: ['**/*.wasm'],
  resolve: {
    // Prefer Prisma's Vite-compatible edge-light loader so the compiler is
    // represented as a WebAssembly module import instead of a workerd
    // filesystem read.
    conditions: ['edge-light', 'workerd', 'worker', 'module', 'browser'],
  },
  optimizeDeps: {
    exclude: ['@prisma/d1-client', '@prisma/adapter-d1'],
  },
  plugins: [
    inlinePrismaQueryCompilerWasm(),
    vinext(),
    cloudflare({
      inspectorPort: false,
      experimental: { newConfig: true },
      viteEnvironment: cloudflareViteEnvironment,
    }),
  ],
});
