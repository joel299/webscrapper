import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { runScrapers } from "../scrapers/run.js";
import { runAnalysis } from "../analysis/editalAnalysis.js";
import { runCleanup } from "./cleanup.js";
import { scraperQueue } from "./queue.js";

const connection = {
  url: env.REDIS_URL
};

new Worker(
  "scraper",
  async (job) => {
    if (job.name === "run") {
      await runScrapers(job.data.fonte);
    } else if (job.name === "cleanup") {
      await runCleanup();
    } else if (job.name === "analysis") {
      await runAnalysis(job.data.analysisId);
    }
  },
  {
    connection,
    concurrency: env.SCRAPER_CONCURRENCY
  }
);

const automaticJobOptions = {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
  attempts: 3,
  repeat: { every: env.SCRAPER_INTERVAL_MINUTES * 60 * 1000 }
};

await scraperQueue.add("run", { fonte: "all" }, {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
  attempts: 3,
  jobId: "automatic-initial-scrape"
});

await scraperQueue.add("run", { fonte: "all" }, automaticJobOptions);

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
