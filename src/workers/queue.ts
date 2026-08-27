import { Queue } from "bullmq";
import { env } from "../config/env.js";

const connection = {
  url: env.REDIS_URL
};

export const scraperQueue = new Queue("scraper", { connection });
export const analysisQueue = new Queue("analysis", { connection });

export async function enqueueScraperRun(fonte: string, jobId?: string) {
  return scraperQueue.add("run", { fonte }, {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    jobId: jobId || `sync:${fonte}`
  });
}

export async function enqueueDailySyncSources(sources: string[], date: string) {
  return Promise.all(sources.map((fonte) => enqueueScraperRun(fonte, `daily-sync:${date}:${fonte}`)));
}

export async function enqueueAnalysis(analysisId: string) {
  const jobId = `analysis-${analysisId}`;
  const existing = await analysisQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (["waiting", "active", "delayed", "prioritized", "paused"].includes(state)) {
      return existing;
    }
    await existing.remove();
  }
  return analysisQueue.add("analysis", { analysisId }, { jobId, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 }, attempts: 2, backoff: { type: "exponential", delay: 5000 } });
}

export async function analysisQueueHasCapacity(analysisId: string) {
  const existing = await analysisQueue.getJob(`analysis-${analysisId}`);
  if (existing) {
    const state = await existing.getState();
    if (["waiting", "active", "delayed", "prioritized", "paused"].includes(state)) return true;
  }
  return (await analysisQueue.getWaitingCount()) < env.ANALYSIS_QUEUE_MAX_WAITING;
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
