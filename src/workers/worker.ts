import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { runScrapers } from "../scrapers/run.js";
import { scraperQueue } from "./queue.js";

const connection = {
  url: env.REDIS_URL
};

new Worker(
  "scraper",
  async (job) => {
    if (job.name === "run") {
      await runScrapers(job.data.fonte);
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
  ...automaticJobOptions,
  jobId: "automatic-initial-scrape"
});

await scraperQueue.add("run", { fonte: "all" }, {
  ...automaticJobOptions,
  jobId: "automatic-periodic-scrape"
});
