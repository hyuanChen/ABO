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
  bvid: string;
  tags: string[];
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

export interface BiliFollowedUp {
  mid: string;
  uname: string;
  face: string;
  sign: string;
  official_desc: string;
  special: number;
  tag_ids: number[];
  tag_names: string[];
}

export interface BiliOriginalFollowedGroup {
  tag_id: number;
  name: string;
  count: number;
  tip: string;
}

export interface FetchFollowedUpsRequest {
  sessdata: string;
  max_count?: number;
}

export interface FetchFollowedUpsResponse {
  total: number;
  groups: BiliOriginalFollowedGroup[];
  ups: BiliFollowedUp[];
}

export interface StartFollowedUpsCrawlResponse {
  success: boolean;
  task_id: string;
}

export interface FollowedUpsCrawlTask {
  task_id: string;
  kind: "followed-ups";
  status: "running" | "completed" | "failed";
  stage: string;
  current_page: number;
  page_size: number;
  fetched_count: number;
  updated_at: string;
  error?: string | null;
  result?: FetchFollowedUpsResponse | null;
}

export interface BilibiliSmartGroupOption {
  value: string;
  label: string;
  count?: number;
  sample_authors?: string[];
  sample_tags?: string[];
}

export interface BilibiliSmartGroupProfile {
  author?: string;
  author_id?: string;
  matched_author?: string;
  manual_override?: boolean;
  favorite_note_count?: number;
  smart_groups?: string[];
  smart_group_labels?: string[];
  latest_title?: string;
  sample_titles?: string[];
  sample_tags?: string[];
  sample_folders?: string[];
  source_summary?: string;
}

export interface BilibiliSmartGroupResult {
  success: boolean;
  bilibili_dir: string;
  favorites_dir: string;
  total_files: number;
  total_notes: number;
  total_authors: number;
  matched_followed_count: number;
  unmatched_author_count: number;
  group_options: BilibiliSmartGroupOption[];
  profiles: Record<string, BilibiliSmartGroupProfile>;
  message: string;
}

export interface BilibiliSmartGroupTask {
  task_id: string;
  kind: "followed-up-smart-groups";
  status: "running" | "completed" | "failed";
  stage: string;
  progress: number;
  total_files: number;
  processed_files: number;
  matched_followed_count: number;
  total_groups: number;
  total_followed_count?: number;
  updated_at: string;
  error?: string | null;
  result?: BilibiliSmartGroupResult | null;
}

export interface BilibiliSmartGroupRequest {
  sessdata: string;
  vault_path?: string;
  max_count?: number;
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
  cookie?: string;
  cookie_count?: number;
  cookie_preview?: string;
  message?: string;
  error?: string;
}

export interface CrawlToVaultRequest {
  cookie?: string;
  vault_path?: string;
  include_dynamics?: boolean;
  include_favorites?: boolean;
  include_watch_later?: boolean;
  dynamic_limit?: number;
  favorite_folder_limit?: number;
  favorite_item_limit?: number;
  watch_later_limit?: number;
  use_cdp?: boolean;
  cdp_port?: number;
}

export interface CrawlToVaultResponse {
  success: boolean;
  vault_path: string;
  output_dir: string;
  written_count: number;
  written_files: string[];
  renamed_favorite_count?: number;
  renamed_favorite_files?: string[];
  dynamic_count: number;
  favorite_count: number;
  watch_later_count: number;
  login?: {
    valid: boolean;
    mid: string;
    uname: string;
  };
}

export interface SaveSelectedDynamicsRequest {
  vault_path?: string;
  dynamics: BiliDynamic[];
}

export interface BilibiliFavoriteFolder {
  id: string;
  title: string;
  media_count: number;
  cover: string;
  first_video_title: string;
  first_video_bvid: string;
  crawled_count: number;
  last_crawled_at: string;
  source_type?: "favorite" | "watch_later";
}

export interface FavoriteFoldersRequest {
  cookie?: string;
  use_cdp?: boolean;
  cdp_port?: number;
}

export interface FavoriteFoldersResponse {
  success: boolean;
  folder_count: number;
  folders: BilibiliFavoriteFolder[];
  login?: {
    valid: boolean;
    mid: string;
    uname: string;
  };
}

export interface FavoriteFoldersTask {
  task_id: string;
  kind: "favorite-folders";
  status: "running" | "completed" | "failed";
  stage: string;
  processed_folders: number;
  total_folders: number;
  current_folder: string;
  updated_at: string;
  error?: string | null;
  result?: FavoriteFoldersResponse | null;
}

export interface FavoriteCrawlRequest {
  cookie?: string;
  vault_path?: string;
  folder_ids: string[];
  crawl_mode?: "full" | "incremental";
  item_limit?: number;
  since_days?: number;
  since_date?: string;
  use_cdp?: boolean;
  cdp_port?: number;
}

export interface FavoriteCrawlResponse extends CrawlToVaultResponse {
  selected_folder_count: number;
  matched_folder_count: number;
  fetched_count: number;
  favorite_count: number;
  skipped_count: number;
  state_path: string;
  watch_later_count: number;
  crawl_mode?: "full" | "incremental";
}

export interface FavoriteCrawlTask {
  task_id: string;
  kind: "favorite-crawl";
  status: "running" | "completed" | "failed";
  stage: string;
  selected_folder_count: number;
  current_step: string;
  current_folder: string;
  current_page: number;
  fetched_count: number;
  saved_count: number;
  skipped_count: number;
  updated_at: string;
  error?: string | null;
  result?: FavoriteCrawlResponse | null;
}

const API_BASE = "http://127.0.0.1:8765/api/tools";

async function readError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return data.detail || data.error || text || fallback;
  } catch {
    return text || fallback;
  }
}

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

export async function bilibiliFetchFollowedUps(
  req: FetchFollowedUpsRequest
): Promise<FetchFollowedUpsResponse> {
  const res = await fetch(`${API_BASE}/bilibili/followed-ups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Fetch followed ups failed");
  }
  return res.json();
}

export async function bilibiliStartFollowedUpsCrawl(
  req: FetchFollowedUpsRequest
): Promise<StartFollowedUpsCrawlResponse> {
  const res = await fetch(`${API_BASE}/bilibili/followed-ups/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Start followed ups crawl failed");
  }
  return res.json();
}

export async function bilibiliGetFollowedUpsCrawlTask(
  taskId: string
): Promise<FollowedUpsCrawlTask> {
  const res = await fetch(`${API_BASE}/bilibili/followed-ups/crawl/${taskId}`);
  if (!res.ok) {
    const error = await readError(res, "Read followed ups crawl progress failed");
    throw new Error(error);
  }
  return res.json();
}

export async function bilibiliStartSmartGroupTask(
  req: BilibiliSmartGroupRequest
): Promise<StartFollowedUpsCrawlResponse> {
  const res = await fetch(`${API_BASE}/bilibili/followed-ups/smart-groups/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const error = await readError(res, "Start smart grouping failed");
    throw new Error(error);
  }
  return res.json();
}

export async function bilibiliGetSmartGroupTask(
  taskId: string
): Promise<BilibiliSmartGroupTask> {
  const res = await fetch(`${API_BASE}/bilibili/followed-ups/smart-groups/${taskId}`);
  if (!res.ok) {
    const error = await readError(res, "Read smart grouping progress failed");
    throw new Error(error);
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
  try {
    const res = await fetch(`${API_BASE}/bilibili/config/from-browser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || "浏览器 Cookie 获取失败");
    }
    return res.json();
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error("ABO 后端未启动，请重启 ABO 后再点击一键连接浏览器 Cookie");
    }
    throw err;
  }
}

export async function bilibiliCrawlToVault(
  req: CrawlToVaultRequest
): Promise<CrawlToVaultResponse> {
  const res = await fetch(`${API_BASE}/bilibili/crawl-to-vault`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Crawl to vault failed");
  }
  return res.json();
}

export async function bilibiliSaveSelectedDynamics(
  req: SaveSelectedDynamicsRequest
): Promise<CrawlToVaultResponse> {
  const res = await fetch(`${API_BASE}/bilibili/dynamics/save-selected`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(await readError(res, "Save selected dynamics failed"));
  }
  return res.json();
}

export async function bilibiliListFavoriteFolders(
  req: FavoriteFoldersRequest = {}
): Promise<FavoriteFoldersResponse> {
  const res = await fetch(`${API_BASE}/bilibili/favorites/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(await readError(res, "Favorite folders failed"));
  }
  return res.json();
}

export async function bilibiliStartListFavoriteFolders(
  req: FavoriteFoldersRequest = {}
): Promise<StartFollowedUpsCrawlResponse> {
  const res = await fetch(`${API_BASE}/bilibili/favorites/folders/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(await readError(res, "Favorite folder preview start failed"));
  }
  return res.json();
}

export async function bilibiliGetListFavoriteFoldersTask(
  taskId: string
): Promise<FavoriteFoldersTask> {
  const res = await fetch(`${API_BASE}/bilibili/favorites/folders/crawl/${taskId}`);
  if (!res.ok) {
    throw new Error(await readError(res, "Favorite folder preview progress failed"));
  }
  return res.json();
}

export async function bilibiliCrawlFavoriteFolders(
  req: FavoriteCrawlRequest
): Promise<FavoriteCrawlResponse> {
  const res = await fetch(`${API_BASE}/bilibili/favorites/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(await readError(res, "Favorite crawl failed"));
  }
  return res.json();
}

export async function bilibiliStartCrawlFavoriteFolders(
  req: FavoriteCrawlRequest
): Promise<StartFollowedUpsCrawlResponse> {
  const res = await fetch(`${API_BASE}/bilibili/favorites/crawl/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(await readError(res, "Favorite crawl start failed"));
  }
  return res.json();
}

export async function bilibiliGetCrawlFavoriteFoldersTask(
  taskId: string
): Promise<FavoriteCrawlTask> {
  const res = await fetch(`${API_BASE}/bilibili/favorites/crawl/${taskId}`);
  if (!res.ok) {
    throw new Error(await readError(res, "Favorite crawl progress failed"));
  }
  return res.json();
}

export interface DebugTestResult {
  sessdata_preview: string;
  tests: Record<string, {
    status_code?: number;
    code?: number;
    message?: string;
    cards_count?: number;
    first_card_types?: number[];
    error?: string;
  }>;
  suggestions: string[];
}

export async function bilibiliDebugTest(sessdata: string): Promise<DebugTestResult> {
  const res = await fetch(`${API_BASE}/bilibili/debug`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessdata }),
  });
  if (!res.ok) throw new Error("Debug test failed");
  return res.json();
}
