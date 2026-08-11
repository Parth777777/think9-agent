// Typed client for the P0 routes in docs/LLD.md §8. Plain fetch, no library —
// three pages don't need a data-fetching framework.
import type {
  ApprovePipelineResponse,
  Brand,
  ChatReply,
  Decision,
  MarketBundle,
  MeterSnapshot,
  PipelineState,
  RunPipelineResponse,
  RunRow,
  SocialBuzz,
  WorkspaceFile,
  WorkspaceNode,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function getBrands(): Promise<Brand[]> {
  return request("/brands");
}

export function runPipeline(brandId: string): Promise<RunPipelineResponse> {
  return request("/pipeline/run", {
    method: "POST",
    body: JSON.stringify({ brand_id: brandId, trigger: "manual" }),
  });
}

export function getPipelineState(runId: string): Promise<PipelineState> {
  return request(`/pipeline/${runId}`);
}

export function approvePipeline(
  runId: string,
  decision: Decision,
  notes?: string
): Promise<ApprovePipelineResponse> {
  return request(`/pipeline/${runId}/approve`, {
    method: "POST",
    body: JSON.stringify({ decision, notes: notes ?? null }),
  });
}

export function getWorkspaceTree(): Promise<WorkspaceNode> {
  return request("/workspace/tree");
}

export function getWorkspaceFile(path: string): Promise<WorkspaceFile> {
  return request(`/workspace/file?path=${encodeURIComponent(path)}`);
}

// --- Routes that returned real data to nobody until now. ---

export function getRuns(status?: string): Promise<RunRow[]> {
  return request(status ? `/runs?status=${encodeURIComponent(status)}` : "/runs");
}

export function getMeter(): Promise<MeterSnapshot> {
  return request("/meter");
}

export function getMarket(brandId: string): Promise<MarketBundle> {
  return request(`/market/${encodeURIComponent(brandId)}`);
}

export function getSocial(brandCategory: string): Promise<SocialBuzz> {
  return request(`/social/${encodeURIComponent(brandCategory)}`);
}

export function getCelebrities(): Promise<Record<string, unknown>[]> {
  return request("/celebrities");
}

export function getCreators(): Promise<Record<string, unknown>[]> {
  return request("/creators");
}

export function getDigest(): Promise<Record<string, unknown>> {
  return request("/digest/latest");
}

export function askPulse(
  message: string,
  history: { role: string; content: string }[] = []
): Promise<ChatReply> {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
}
