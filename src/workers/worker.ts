import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { runScrapers } from "../scrapers/run.js";
import { runAnalysis } from "../analysis/editalAnalysis.js";
import { runCleanup } from "./cleanup.js";
import { scraperQueue } from "./queue.js";
import { availableSources } from "../scrapers/run.js";

const connection = {
  url: env.REDIS_URL
};

new Worker(
  "scraper",
  async (job) => {
    if (job.name === "daily-sync") {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: env.BUSINESS_TIMEZONE }).format(new Date());
      await Promise.all(availableSources.map((fonte) => scraperQueue.add("run", { fonte }, {
        jobId: `daily-sync:${date}:${fonte}`, attempts: 3, removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 }
      })));
    } else if (job.name === "run") {
      await runScrapers(job.data.fonte, job.id);
    } else if (job.name === "cleanup") {
      await runCleanup();
    }
  },
  {
    connection,
    concurrency: Math.min(Math.max(env.SCRAPER_CONCURRENCY, 1), 2),
    lockDuration: 120000
  }
);

new Worker(
  "analysis",
  async (job) => {
    if (job.name === "analysis") await runAnalysis(job.data.analysisId);
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 120000,
    limiter: {
      max: env.ANALYSIS_RATE_LIMIT_MAX,
      duration: env.ANALYSIS_RATE_LIMIT_DURATION_MS
    }
  }
);

const businessDate = new Intl.DateTimeFormat("en-CA", { timeZone: env.BUSINESS_TIMEZONE }).format(new Date());
for (const fonte of availableSources) {
  await scraperQueue.add("run", { fonte }, {
    removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 }, attempts: 3,
    jobId: `initial-sync:${businessDate}:${fonte}`,
    backoff: { type: "exponential", delay: 5000 }
  });
}
await scraperQueue.add("daily-sync", {}, {
  removeOnComplete: { count: 100 }, removeOnFail: { count: 100 }, attempts: 3,
  jobId: "daily-sync-scheduler",
  backoff: { type: "exponential", delay: 5000 },
  repeat: { pattern: "0 0 * * *", tz: env.BUSINESS_TIMEZONE }
});

// Rotina de limpeza do bucket (expiração 7 dias) a cada 24h + imediatamente ao iniciar.
await scraperQueue.add("cleanup", {}, {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
  attempts: 2,
  jobId: "cleanup-on-boot"
});

await scraperQueue.add("cleanup", {}, {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
  attempts: 2,
  repeat: { every: 24 * 60 * 60 * 1000 },
  jobId: "cleanup-daily"
});
