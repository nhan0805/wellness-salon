import { bindings, defineConfig, defineWorker, triggers } from "cf/config";
import { PRODUCTION_TIMEZONE, SCHEDULER_CRON } from "./src/domain/scheduler.ts";

export default defineConfig({
  worker: defineWorker({
    name: "wellness",
    entrypoint: "src/worker.ts",
    compatibilityDate: "2026-10-12",
    // D1/Prisma work is request-scoped. Use Cloudflare's default
    // cross-request Promise handling so a leaked continuation fails loudly
    // instead of being allowed to resume in the wrong request context.
    compatibilityFlags: ["nodejs_compat"],
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
