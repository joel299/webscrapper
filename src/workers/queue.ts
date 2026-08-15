import { Queue } from "bullmq";
import { env } from "../config/env.js";

const connection = {
  url: env.REDIS_URL
};

export const scraperQueue = new Queue("scraper", { connection });

export async function enqueueScraperRun(fonte: string) {
  return scraperQueue.add("run", { fonte }, {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
    attempts: 3
  });
}

export async function enqueueAnalysis(analysisId: string) {
  return scraperQueue.add("analysis", { analysisId }, { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 }, attempts: 2 });
}

export async function getAnalysisJobStatus(id: string) {
  return getScraperJobStatus(id);
}

export async function getScraperJobStatus(id: string) {
  const job = await scraperQueue.getJob(id);
  if (!job) return null;
  const state = await job.getState();
  return {
    id: job.id,
    name: job.name,
    state,
    progress: job.progress,
    failedReason: job.failedReason ?? null,
    stacktrace: job.stacktrace ?? [],
    queuedAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
    processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    durationMs: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null
  };
}
