export interface BiliDynamic {
  id: string;
  dynamic_id: string;
  title: string;
  content: string;
  author: string;
  author_id: string;
  url: string;
  published_at: string | null;
  dynamic_type: "video" | "image" | "text" | "article";
  pic: string;
  images: string[];
}

export interface FetchFollowedRequest {
  sessdata: string;
  keywords?: string[];
  dynamic_types?: number[];
  limit?: number;
  days_back?: number;
}

export interface FetchFollowedResponse {
  total_found: number;
  dynamics: BiliDynamic[];
}

export interface VerifySessdataRequest {
  sessdata: string;
}

export interface VerifySessdataResponse {
  valid: boolean;
  message: string;
}

export interface CookieConfigResponse {
  cookie_configured: boolean;
  cookie_preview: string | null;
}

export interface CookieSaveRequest {
  cookie: string;
}

export interface CookieSaveResponse {
  success: boolean;
  cookie_configured: boolean;
  cookie_preview: string;
}

export interface BrowserCookieResponse {
  success: boolean;
  cookie_count?: number;
  cookie_preview?: string;
  message?: string;
  error?: string;
}

const API_BASE = "http://127.0.0.1:8765/api/tools";

export async function bilibiliFetchFollowed(
  req: FetchFollowedRequest
): Promise<FetchFollowedResponse> {
  const res = await fetch(`${API_BASE}/bilibili/followed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Fetch failed");
  }
  return res.json();
}

export async function bilibiliVerifySessdata(
  req: VerifySessdataRequest
): Promise<VerifySessdataResponse> {
  const res = await fetch(`${API_BASE}/bilibili/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error("Verification failed");
  return res.json();
}

export async function bilibiliGetConfig(): Promise<CookieConfigResponse> {
  const res = await fetch(`${API_BASE}/bilibili/config`);
  if (!res.ok) throw new Error("Failed to get config");
  return res.json();
}

export async function bilibiliSaveConfig(req: CookieSaveRequest): Promise<CookieSaveResponse> {
  const res = await fetch(`${API_BASE}/bilibili/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error("Failed to save config");
  return res.json();
}

export async function bilibiliGetCookieFromBrowser(): Promise<BrowserCookieResponse> {
  const res = await fetch(`${API_BASE}/bilibili/config/from-browser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to get cookie from browser");
  return res.json();
}
