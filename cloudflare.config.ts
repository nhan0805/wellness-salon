import { bindings, defineConfig, defineWorker, triggers } from "cf/config";
import { PRODUCTION_TIMEZONE, SCHEDULER_CRON } from "./src/domain/scheduler.ts";

export default defineConfig({
  worker: defineWorker({
    name: "wellness",
    entrypoint: "src/worker.ts",
    compatibilityDate: "2026-10-12",
    // Prisma's D1 query-compiler WASM module can finish a shared compiler
    // promise in a later request context when dashboard requests fan out.
    // Keep the Workers runtime from cancelling that continuation mid-query.
    compatibilityFlags: ["nodejs_compat", "no_handle_cross_request_promise_resolution"],
    workersDev: true,
    assets: { notFoundHandling: "none" },
    triggers: [
      triggers.scheduled({ schedule: SCHEDULER_CRON }),
    ],
    env: {
      ASSETS: bindings.assets(),
      DB: bindings.d1({ name: "wellness-salon" }),
      SHOP_TIMEZONE: bindings.text(PRODUCTION_TIMEZONE),
      PRODUCTION_TIMEZONE_CONFIRMED: bindings.text("true"),
      SCHEDULER_CRON: bindings.text(SCHEDULER_CRON),
    },
  }),
});
