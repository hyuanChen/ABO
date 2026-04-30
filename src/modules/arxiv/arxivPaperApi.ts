import { API_BASE_URL } from "../../core/api";

const API_BASE = API_BASE_URL;

export interface ArxivIntroductionPayload {
  introduction: string;
  formatted_digest: string;
}

const introductionFetchCache = new Map<string, Promise<ArxivIntroductionPayload>>();

export async function fetchArxivPaperIntroduction(
  arxivId: string,
  abstract: string,
): Promise<ArxivIntroductionPayload> {
  const existing = introductionFetchCache.get(arxivId);
  if (existing) {
    return existing;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  const task = fetch(`${API_BASE}/api/tools/arxiv/introduction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      arxiv_id: arxivId,
      abstract,
    }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`API ${response.status}: ${await response.text()}`);
      }
      return response.json() as Promise<ArxivIntroductionPayload>;
    })
    .finally(() => {
      window.clearTimeout(timeout);
    })
    .then((result) => {
      if (!result.introduction) {
        introductionFetchCache.delete(arxivId);
      }
      return result;
    })
    .catch((error) => {
      introductionFetchCache.delete(arxivId);
      throw error;
    });

  introductionFetchCache.set(arxivId, task);
  return task;
}
