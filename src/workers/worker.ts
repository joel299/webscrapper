import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { runScrapers } from "../scrapers/run.js";

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
