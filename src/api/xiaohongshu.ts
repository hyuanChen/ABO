export interface SearchRequest {
  keyword: string;
  max_results?: number;
  min_likes?: number;
  sort_by?: 'likes' | 'time';
  cookie?: string;
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
  cookie?: string;
  cookie_preview?: string;
  web_session?: string;
  id_token?: string;
  source?: string;
  message?: string;
  error?: string;
  debug?: string[];
}

export interface SearchResponse {
  keyword: string;
  total_found: number;
  notes: {
    id: string;
    title: string;
    content: string;
    author: string;
    likes: number;
    collects: number;
    comments_count: number;
    url: string;
    published_at: string | null;
    cover_image?: string | null;
    note_type?: string;
    images?: string[];
    video_url?: string | null;
    xsec_token?: string;
    xsec_source?: string;
    comments_preview?: {
      id: string;
      author: string;
      content: string;
      likes: number;
      is_top: boolean;
    }[];
  }[];
}

export interface CommentsRequest {
  note_id: string;
  note_url?: string;
  max_comments?: number;
  sort_by?: 'likes' | 'time';
  cookie?: string;
}

export interface CommentsResponse {
  note_id: string;
  total_comments: number;
  sort_by: string;
  comments: {
    id: string;
    author: string;
    content: string;
    likes: number;
    is_top: boolean;
  }[];
}

export interface TrendsRequest {
  keyword: string;
  cookie?: string;
}

export interface TrendsResponse {
  keyword: string;
  analysis: {
    hot_topics: string[];
    trending_tags: { tag: string; frequency: number }[];
    content_patterns: string[];
    audience_insights: string[];
    engagement_factors: string[];
    summary: string;
  };
  based_on_notes: number;
}

export interface VerifyCookieRequest {
  web_session: string;
  id_token?: string;
}

export interface VerifyCookieResponse {
  valid: boolean;
  message: string;
}

export interface CrawlNoteRequest {
  url: string;
  cookie?: string;
  include_images?: boolean;
  include_video?: boolean;
  include_live_photo?: boolean;
  include_comments?: boolean;
  include_sub_comments?: boolean;
  comments_limit?: number;
  use_cdp?: boolean;
  cdp_port?: number;
}

export interface CrawlNoteResponse {
  success: boolean;
  note_id: string;
  title: string;
  author: string;
  url: string;
  markdown_path: string;
  xhs_dir: string;
  used_cdp: boolean;
  warnings: string[];
  remote_resources: {
    images: string[];
    video: string | null;
    live: string[];
  };
  local_resources: {
    label: string;
    type: string;
    path: string;
    relative_path: string;
    remote_url: string;
    size: number;
  }[];
}

export interface CrawlBatchRequest {
  urls: string[];
  cookie?: string;
  include_images?: boolean;
  include_video?: boolean;
  include_live_photo?: boolean;
  include_comments?: boolean;
  include_sub_comments?: boolean;
  comments_limit?: number;
  use_cdp?: boolean;
  cdp_port?: number;
}

export interface CrawlBatchResponse {
  success: boolean;
  total: number;
  saved: number;
  failed: number;
  results: Array<CrawlNoteResponse | { success: false; url: string; error: string }>;
}

export interface SavePreviewNote {
  id: string;
  title: string;
  content: string;
  author: string;
  likes: number;
  collects: number;
  comments_count: number;
  url: string;
  published_at: string | null;
  cover_image?: string | null;
  note_type?: string;
  images?: string[];
  video_url?: string | null;
  xsec_token?: string;
  xsec_source?: string;
}

export interface SavePreviewsResponse {
  success: boolean;
  total: number;
  saved: number;
  failed: number;
  xhs_dir: string;
  results: Array<{ success: boolean; note_id?: string; title?: string; markdown_path?: string; error?: string }>;
}

export interface XHSAuthorCandidate {
  author: string;
  author_id: string;
  note_count: number;
  total_likes: number;
  total_collects: number;
  total_comments: number;
  latest_date: string;
  latest_title: string;
  sample_note_urls: string[];
  sample_titles: string[];
  sample_albums?: string[];
  sample_tags?: string[];
  source_summary?: string;
  score: number;
}

export interface XHSAuthorCandidatesResponse {
  success: boolean;
  xhs_dir: string;
  total_notes: number;
  candidates: XHSAuthorCandidate[];
  message: string;
}

export interface XHSAuthorSyncResponse {
  success: boolean;
  added_count: number;
  added_user_ids: string[];
  total_user_ids: number;
  skipped: Array<{ author: string; reason: string }>;
}

export interface XHSTaskStatus<T = any> {
  task_id: string;
  kind: string;
  status: "running" | "completed" | "failed" | "interrupted";
  stage: string;
  result: T | null;
  error: string | null;
  input?: Record<string, unknown>;
  input_summary?: string;
  current?: number;
  total?: number;
  created_at?: string;
  updated_at?: string;
}

const API_BASE = 'http://127.0.0.1:8765/api/tools';

export async function xiaohongshuSearch(req: SearchRequest): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function xiaohongshuComments(req: CommentsRequest): Promise<CommentsResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error('Fetch comments failed');
  return res.json();
}

export async function xiaohongshuTrends(req: TrendsRequest): Promise<TrendsResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/trends`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error('Analyze trends failed');
  return res.json();
}

export async function xiaohongshuVerifyCookie(
  req: VerifyCookieRequest
): Promise<VerifyCookieResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error('Verification failed');
  return res.json();
}

export async function xiaohongshuGetConfig(): Promise<CookieConfigResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/config`);
  if (!res.ok) throw new Error('Failed to get config');
  return res.json();
}

export async function xiaohongshuSaveConfig(req: CookieSaveRequest): Promise<CookieSaveResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error('Failed to save config');
  return res.json();
}

export async function xiaohongshuGetCookieFromBrowser(): Promise<BrowserCookieResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/config/from-browser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to get cookie from browser');
  return res.json();
}

export async function xiaohongshuCrawlNote(req: CrawlNoteRequest): Promise<CrawlNoteResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/crawl-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || 'Crawl note failed');
  }
  return res.json();
}

export async function xiaohongshuCrawlBatch(req: CrawlBatchRequest): Promise<CrawlBatchResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/crawl-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || 'Crawl batch failed');
  }
  return res.json();
}

export async function xiaohongshuSavePreviews(notes: SavePreviewNote[], vault_path?: string): Promise<SavePreviewsResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/save-previews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes, vault_path }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || 'Save previews failed');
  }
  return res.json();
}

export async function xiaohongshuGetAuthorCandidates(payload?: {
  cookie?: string;
  resolve_author_ids?: boolean;
  resolve_limit?: number;
  vault_path?: string;
}): Promise<XHSAuthorCandidatesResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/authors/candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || 'Analyze authors failed');
  }
  return res.json();
}

export async function xiaohongshuSyncAuthorsToTracker(authors: Array<{
  author: string;
  author_id: string;
  latest_title?: string;
  sample_titles?: string[];
  sample_albums?: string[];
  sample_tags?: string[];
  source_summary?: string;
}>): Promise<XHSAuthorSyncResponse> {
  const res = await fetch(`${API_BASE}/xiaohongshu/authors/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authors }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || 'Sync authors failed');
  }
  return res.json();
}

async function startTask(path: string, payload: object): Promise<{ success: boolean; task_id: string }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || "Start task failed");
  }
  return res.json();
}

export async function xiaohongshuGetTaskStatus<T = any>(taskId: string): Promise<XHSTaskStatus<T>> {
  const res = await fetch(`${API_BASE}/xiaohongshu/tasks/${taskId}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || "Read task failed");
  }
  return res.json();
}

export async function xiaohongshuListTasks(limit = 20): Promise<{ tasks: XHSTaskStatus[] }> {
  const res = await fetch(`${API_BASE}/xiaohongshu/tasks?limit=${limit}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || "List tasks failed");
  }
  return res.json();
}

export const xiaohongshuStartSearchTask = (payload: SearchRequest) =>
  startTask("/xiaohongshu/search/start", payload);

export const xiaohongshuStartTrendsTask = (payload: TrendsRequest) =>
  startTask("/xiaohongshu/trends/start", payload);

export const xiaohongshuStartCommentsTask = (payload: CommentsRequest) =>
  startTask("/xiaohongshu/comments/start", payload);

export const xiaohongshuStartFollowingFeedTask = (payload: { cookie?: string; keywords: string[]; max_notes?: number }) =>
  startTask("/xiaohongshu/following-feed/start", payload);

export const xiaohongshuStartCrawlNoteTask = (payload: CrawlNoteRequest) =>
  startTask("/xiaohongshu/crawl-note/start", payload);

export const xiaohongshuStartCrawlBatchTask = (payload: CrawlBatchRequest) =>
  startTask("/xiaohongshu/crawl-batch/start", payload);

export const xiaohongshuStartAuthorCandidatesTask = (payload?: {
  cookie?: string;
  resolve_author_ids?: boolean;
  resolve_limit?: number;
  vault_path?: string;
}) => startTask("/xiaohongshu/authors/candidates/start", payload || {});
