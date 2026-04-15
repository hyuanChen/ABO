import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Check, Cookie, FolderHeart, ImageOff, RefreshCw, RotateCcw, Save, Tv, Users } from "lucide-react";
import { PageContainer, PageHeader, PageContent, Card, EmptyState, LoadingState } from "../../components/Layout";
import { useToast } from "../../components/Toast";
import { useStore } from "../../core/store";
import {
  BilibiliFavoriteFolder,
  FavoriteCrawlResponse,
  bilibiliListFavoriteFolders,
  bilibiliGetConfig,
  bilibiliGetCookieFromBrowser,
  bilibiliStartListFavoriteFolders,
  bilibiliGetListFavoriteFoldersTask,
  FavoriteFoldersTask,
  bilibiliCrawlFavoriteFolders,
  bilibiliStartCrawlFavoriteFolders,
  bilibiliGetCrawlFavoriteFoldersTask,
  FavoriteCrawlTask,
} from "../../api/bilibili";
import { BilibiliCookieModal } from "./BilibiliCookieModal";

interface BilibiliFavoritesPageProps {
  embedded?: boolean;
}

type FavoriteCrawlMode = "full" | "incremental";

function proxiedImage(url: string): string {
  if (!url) return "";
  return `http://127.0.0.1:8765/api/proxy/image?url=${encodeURIComponent(url)}`;
}

function isNotFoundError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || "");
  return /not found|404/i.test(message);
}

const FAVORITES_LIST_TASK_KEY = "bilibili_favorites_list_task_id";
const FAVORITES_CRAWL_TASK_KEY = "bilibili_favorites_crawl_task_id";
const FAVORITES_FOLDERS_CACHE_KEY = "bilibili_favorites_folders_cache";
const FAVORITES_RESULT_CACHE_KEY = "bilibili_favorites_result_cache";

function readJsonCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function BilibiliFavoritesPage({ embedded = false }: BilibiliFavoritesPageProps) {
  const toast = useToast();
  const setActiveTab = useStore((state) => state.setActiveTab);
  const didAutoLoad = useRef(false);
  const [cookie, setCookie] = useState("");
  const [cookieConfigured, setCookieConfigured] = useState(false);
  const [cookiePreview, setCookiePreview] = useState<string | null>(null);
  const [gettingFromBrowser, setGettingFromBrowser] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [showFullCookie, setShowFullCookie] = useState(false);
  const [folders, setFolders] = useState<BilibiliFavoriteFolder[]>(() => readJsonCache(FAVORITES_FOLDERS_CACHE_KEY, []));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(readJsonCache<string[]>("bilibili_favorites_selected_ids", [])));
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [result, setResult] = useState<FavoriteCrawlResponse | null>(() => readJsonCache(FAVORITES_RESULT_CACHE_KEY, null));
  const [listTask, setListTask] = useState<FavoriteFoldersTask | null>(null);
  const [crawlTask, setCrawlTask] = useState<FavoriteCrawlTask | null>(null);
  const [legacyStatus, setLegacyStatus] = useState<{
    kind: "list" | "crawl";
    title: string;
    stage: string;
    detail: string;
    ratio: number;
  } | null>(null);

  const selectedCount = selectedIds.size;
  const selectedVideos = useMemo(
    () => folders.filter((folder) => selectedIds.has(folder.id)).reduce((sum, folder) => sum + folder.media_count, 0),
    [folders, selectedIds]
  );
  const crawlProgressRatio = useMemo(() => {
    if (!crawlTask) return 0;
    if (crawlTask.status === "completed") return 1;
    if (crawlTask.current_step === "writing") return 0.92;
    if (crawlTask.current_step === "watch_later") return 0.85;
    const estimatedTotal = Math.max(1, selectedVideos || selectedCount * 1000 || crawlTask.fetched_count || 1);
    if (crawlTask.fetched_count > 0) {
      return Math.min(0.9, crawlTask.fetched_count / estimatedTotal);
    }
    return crawlTask.current_step === "favorites" ? 0.12 : 0.08;
  }, [crawlTask, selectedCount, selectedVideos]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_FOLDERS_CACHE_KEY, JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    localStorage.setItem("bilibili_favorites_selected_ids", JSON.stringify([...selectedIds]));
  }, [selectedIds]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_RESULT_CACHE_KEY, JSON.stringify(result));
  }, [result]);

  useEffect(() => {
    if (didAutoLoad.current) return;
    didAutoLoad.current = true;
    void loadConfig();
    const listTaskId = localStorage.getItem(FAVORITES_LIST_TASK_KEY);
    const crawlTaskId = localStorage.getItem(FAVORITES_CRAWL_TASK_KEY);
    if (crawlTaskId) {
      void resumeCrawlTask(crawlTaskId, false).catch((err) => {
        toast.error("恢复爬取任务失败", err instanceof Error ? err.message : "未知错误");
      });
      return;
    }
    if (listTaskId) {
      void resumeListTask(listTaskId, false).catch((err) => {
        toast.error("恢复收藏栏任务失败", err instanceof Error ? err.message : "未知错误");
      });
      return;
    }
  }, []);

  function finalizeListTask(taskId?: string | null) {
    if (!taskId) return;
    if (localStorage.getItem(FAVORITES_LIST_TASK_KEY) === taskId) {
      localStorage.removeItem(FAVORITES_LIST_TASK_KEY);
    }
  }

  function finalizeCrawlTask(taskId?: string | null) {
    if (!taskId) return;
    if (localStorage.getItem(FAVORITES_CRAWL_TASK_KEY) === taskId) {
      localStorage.removeItem(FAVORITES_CRAWL_TASK_KEY);
    }
  }

  async function resumeListTask(taskId: string, showToast = true) {
    setLoading(true);
    try {
      while (true) {
        const task = await bilibiliGetListFavoriteFoldersTask(taskId);
        setListTask(task);

        if (task.status === "completed") {
          const res = task.result;
          if (!res) {
            throw new Error("收藏栏预览结果为空");
          }
          setFolders(res.folders);
          setCookieConfigured(true);
          setSelectedIds((prev) => {
            const valid = new Set(res.folders.map((folder) => folder.id));
            return new Set([...prev].filter((id) => valid.has(id)));
          });
          finalizeListTask(taskId);
          if (showToast) {
            toast.success("收藏栏已加载", `${res.folder_count} 个条目`);
          }
          break;
        }

        if (task.status === "failed") {
          finalizeListTask(taskId);
          throw new Error(task.error || "收藏栏读取失败");
        }

        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }
    } catch (err) {
      finalizeListTask(taskId);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function resumeCrawlTask(taskId: string, showToast = true) {
    setCrawling(true);
    try {
      while (true) {
        const task = await bilibiliGetCrawlFavoriteFoldersTask(taskId);
        setCrawlTask(task);

        if (task.status === "completed") {
          const crawlResult = task.result;
          if (!crawlResult) {
            throw new Error("收藏内容入库结果为空");
          }
          setResult(crawlResult);
          setCookieConfigured(true);
          finalizeCrawlTask(taskId);
          if (showToast) {
            toast.success(
              crawlResult.crawl_mode === "full" ? "收藏夹已全量入库" : "收藏夹已增量入库",
              `新增 ${crawlResult.favorite_count} 条，稍后再看 ${crawlResult.watch_later_count} 条，跳过 ${crawlResult.skipped_count} 条`
            );
          }
          break;
        }

        if (task.status === "failed") {
          finalizeCrawlTask(taskId);
          throw new Error(task.error || "收藏内容入库失败");
        }

        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }
    } catch (err) {
      finalizeCrawlTask(taskId);
      throw err;
    } finally {
      setCrawling(false);
    }
  }

  async function loadConfig() {
    try {
      const config = await bilibiliGetConfig();
      setCookieConfigured(config.cookie_configured);
      setCookiePreview(config.cookie_preview);
      if (!config.cookie_configured && !cookie.trim()) {
        setShowCookieModal(true);
      }
    } catch {
      if (!cookie.trim()) {
        setShowCookieModal(true);
      }
    }
  }

  async function handleGetFromBrowser() {
    setGettingFromBrowser(true);
    try {
      const res = await bilibiliGetCookieFromBrowser();
      if (!res.success || !res.cookie) {
        throw new Error(res.error || "未能从浏览器获取 Bilibili Cookie");
      }
      setCookieConfigured(true);
      setCookiePreview(res.cookie_preview || null);
      setCookie(res.cookie);
      setShowCookieModal(false);
      toast.success("浏览器 Cookie 已连接", res.message || `获取到 ${res.cookie_count || 0} 个 Cookie`);
    } catch (err) {
      toast.error("获取失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setGettingFromBrowser(false);
    }
  }

  async function handleLoadFolders(showToast = true) {
    setLoading(true);
    setListTask(null);
    setLegacyStatus({
      kind: "list",
      title: "收藏栏预览",
      stage: "正在读取收藏栏",
      detail: "正在连接 Bilibili 并读取收藏夹、稍后再看预览。",
      ratio: 0.2,
    });
    try {
      const request = {
        cookie: cookie.trim() || undefined,
        use_cdp: true,
        cdp_port: 9222,
      };

      try {
        const started = await bilibiliStartListFavoriteFolders(request);
        localStorage.setItem(FAVORITES_LIST_TASK_KEY, started.task_id);
        await resumeListTask(started.task_id, showToast);
      } catch (err) {
        if (!isNotFoundError(err)) {
          throw err;
        }
        finalizeListTask(localStorage.getItem(FAVORITES_LIST_TASK_KEY));

        const res = await bilibiliListFavoriteFolders(request);
        setLegacyStatus({
          kind: "list",
          title: "收藏栏预览",
          stage: "旧接口返回中",
          detail: "当前后端未提供分页进度，正在等待收藏栏预览结果。",
          ratio: 0.65,
        });
        setFolders(res.folders);
        setCookieConfigured(true);
        setSelectedIds((prev) => {
          const valid = new Set(res.folders.map((folder) => folder.id));
          return new Set([...prev].filter((id) => valid.has(id)));
        });
        if (showToast) {
          toast.success("收藏栏已加载", `${res.folder_count} 个条目`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      if (
        message.includes("SESSDATA")
        || message.includes("Cookie")
        || message.includes("登录")
        || message.includes("未获取到")
      ) {
        setShowCookieModal(true);
      }
      toast.error("加载失败", message);
    } finally {
      setLegacyStatus((current) => {
        if (!current || current.kind !== "list") return current;
        return {
          ...current,
          stage: folders.length > 0 ? "收藏栏预览完成" : current.stage,
          detail: folders.length > 0 ? `已读取 ${folders.length} 个条目。` : current.detail,
          ratio: folders.length > 0 ? 1 : current.ratio,
        };
      });
      setLoading(false);
    }
  }

  function toggleFolder(folderId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(folders.map((folder) => folder.id)));
  }

  async function handleCrawlSelected(crawlMode: FavoriteCrawlMode) {
    if (selectedIds.size === 0) {
      toast.error("请选择收藏夹");
      return;
    }

    setCrawling(true);
    setCrawlTask(null);
    setLegacyStatus({
      kind: "crawl",
      title: "收藏内容入库",
      stage: "正在准备入库任务",
      detail: crawlMode === "full"
        ? `已选择 ${selectedIds.size} 个条目，正在准备全量入库。`
        : `已选择 ${selectedIds.size} 个条目，正在检查增量基线与登录态。`,
      ratio: 0.1,
    });
    try {
      const request = {
        cookie: cookie.trim() || undefined,
        folder_ids: [...selectedIds],
        crawl_mode: crawlMode,
        item_limit: crawlMode === "full" ? 100000 : 1000,
        use_cdp: true,
        cdp_port: 9222,
      };
      try {
        const started = await bilibiliStartCrawlFavoriteFolders(request);
        localStorage.setItem(FAVORITES_CRAWL_TASK_KEY, started.task_id);
        await resumeCrawlTask(started.task_id, true);
        return;
      } catch (err) {
        if (isNotFoundError(err)) {
          finalizeCrawlTask(localStorage.getItem(FAVORITES_CRAWL_TASK_KEY));
          setLegacyStatus({
            kind: "crawl",
            title: "收藏内容入库",
            stage: "旧接口处理中",
            detail: "当前后端未提供实时页数进度，正在等待入库完成。",
            ratio: 0.7,
          });
          const crawlResult = await bilibiliCrawlFavoriteFolders(request);
          setResult(crawlResult);
          setCookieConfigured(true);
          toast.success(
            crawlResult.crawl_mode === "full" ? "收藏夹已全量入库" : "收藏夹已增量入库",
            `新增 ${crawlResult.favorite_count} 条，稍后再看 ${crawlResult.watch_later_count} 条，跳过 ${crawlResult.skipped_count} 条`
          );
          setLegacyStatus({
            kind: "crawl",
            title: "收藏内容入库",
            stage: "入库完成",
            detail: `新增 ${crawlResult.favorite_count} 条，稍后再看 ${crawlResult.watch_later_count} 条，跳过 ${crawlResult.skipped_count} 条。`,
            ratio: 1,
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      if (
        message.includes("SESSDATA")
        || message.includes("Cookie")
        || message.includes("登录")
        || message.includes("未获取到")
      ) {
        setShowCookieModal(true);
      }
      toast.error("爬取失败", message);
    } finally {
      setCrawling(false);
    }
  }

  function openBilibiliPanel(panel: "dynamics" | "following") {
    localStorage.setItem("bilibili_tool_panel", panel);
    setActiveTab("bilibili");
  }

  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", height: "100%" }}>
      {!embedded && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
            <button
              type="button"
              onClick={() => openBilibiliPanel("dynamics")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.9375rem",
                fontWeight: 700,
                cursor: "pointer",
                justifyContent: "flex-start",
              }}
            >
              <span style={{ width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-hover)", color: "#00AEEC", flexShrink: 0 }}>
                <Tv size={18} />
              </span>
              动态追踪
            </button>
            <button
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid #FB7299",
                background: "rgba(251, 114, 153, 0.12)",
                color: "#D64078",
                fontSize: "0.9375rem",
                fontWeight: 700,
                cursor: "default",
                justifyContent: "flex-start",
              }}
            >
              <span style={{ width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(251, 114, 153, 0.14)", color: "#D64078", flexShrink: 0 }}>
                <FolderHeart size={18} />
              </span>
              收藏整理
            </button>
            <button
              type="button"
              onClick={() => openBilibiliPanel("following")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
                background: "var(--bg-card)",
                color: "var(--text-main)",
                fontSize: "0.9375rem",
                fontWeight: 700,
                cursor: "pointer",
                justifyContent: "flex-start",
              }}
            >
              <span style={{ width: "36px", height: "36px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-hover)", color: "#10B981", flexShrink: 0 }}>
                <Users size={18} />
              </span>
              关注监控
            </button>
        </div>
      )}

      <Card title="选择范围" icon={<Tv size={18} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "10px",
                }}
              >
                <Metric label="收藏夹" value={folders.length.toString()} />
                <Metric label="已选择" value={selectedCount.toString()} />
                <Metric label="视频总数" value={selectedVideos.toString()} />
                <Metric label="增量依据" value="最新收藏日期" />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => handleLoadFolders()}
                  disabled={loading || crawling}
                  style={{
                    ...favoriteLoadButton,
                    opacity: loading || crawling ? 0.62 : 1,
                    cursor: loading || crawling ? "not-allowed" : "pointer",
                  }}
                >
                  <RefreshCw size={15} />
                  {folders.length > 0 ? "刷新收藏栏" : "读取收藏栏"}
                </button>
                <button type="button" onClick={selectAll} disabled={folders.length === 0 || crawling} style={secondaryButton}>
                  <Check size={15} />
                  全选
                </button>
                <button type="button" onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0 || crawling} style={secondaryButton}>
                  <RotateCcw size={15} />
                  清空
                </button>
                <button
                  type="button"
                  onClick={() => handleCrawlSelected("full")}
                  disabled={selectedIds.size === 0 || crawling || loading}
                  style={{
                    ...fullCrawlButton,
                    opacity: selectedIds.size === 0 || crawling || loading ? 0.6 : 1,
                    cursor: selectedIds.size === 0 || crawling || loading ? "not-allowed" : "pointer",
                  }}
                >
                  <Save size={15} />
                  全量爬取
                </button>
                <button
                  type="button"
                  onClick={() => handleCrawlSelected("incremental")}
                  disabled={selectedIds.size === 0 || crawling || loading}
                  style={{
                    ...primaryButton,
                    opacity: selectedIds.size === 0 || crawling || loading ? 0.6 : 1,
                    cursor: selectedIds.size === 0 || crawling || loading ? "not-allowed" : "pointer",
                  }}
                >
                  <Save size={15} />
                  {crawling ? "入库中..." : "增量爬取"}
                </button>
              </div>

              {result && (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid rgba(82, 196, 26, 0.28)",
                    background: "rgba(82, 196, 26, 0.1)",
                    color: "var(--color-success)",
                    fontSize: "0.8125rem",
                    lineHeight: 1.65,
                  }}
                >
                  {result.crawl_mode === "full"
                    ? `全量爬取完成：新增收藏 ${result.favorite_count} 条，稍后再看 ${result.watch_later_count} 条，跳过 ${result.skipped_count} 条。已按收藏日期重命名 ${result.renamed_favorite_count ?? 0} 个收藏文件。状态记录保存在 ${result.state_path}`
                    : `增量爬取完成：新增收藏 ${result.favorite_count} 条，稍后再看 ${result.watch_later_count} 条，跳过已记录 ${result.skipped_count} 条。已按收藏日期重命名 ${result.renamed_favorite_count ?? 0} 个收藏文件。增量记录保存在 ${result.state_path}`}
                </div>
              )}

              {listTask && listTask.status === "running" && (
                <ProgressNotice
                  title="收藏栏预览"
                  stage={listTask.stage}
                  detail={`已处理 ${listTask.processed_folders}/${Math.max(listTask.total_folders || 0, 1)} 项${listTask.current_folder ? ` · ${listTask.current_folder}` : ""}`}
                  ratio={listTask.total_folders ? listTask.processed_folders / listTask.total_folders : 0}
                />
              )}

              {crawlTask && crawlTask.status === "running" && (
                <ProgressNotice
                  title="收藏内容入库"
                  stage={crawlTask.stage}
                  detail={`已检查 ${crawlTask.fetched_count} 条，新增待入库 ${crawlTask.saved_count} 条，跳过已入库 ${crawlTask.skipped_count} 条${crawlTask.current_folder ? ` · ${crawlTask.current_folder}` : ""}`}
                  ratio={crawlProgressRatio}
                />
              )}

              {!listTask && !crawlTask && legacyStatus && (loading || crawling || legacyStatus.ratio >= 1) && (
                <ProgressNotice
                  title={legacyStatus.title}
                  stage={legacyStatus.stage}
                  detail={legacyStatus.detail}
                  ratio={legacyStatus.ratio}
                />
              )}

            </div>
          </Card>

      {loading ? (
        <LoadingState message="正在读取收藏夹和封面..." />
      ) : folders.length === 0 ? (
        <EmptyState
          icon={FolderHeart}
          title="未读取到收藏夹"
          description="进入页面不会自动创建，点击上方“读取收藏栏”后开始加载"
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "14px",
            paddingBottom: "24px",
          }}
        >
          {folders.map((folder) => (
            <FavoriteFolderTile
              key={folder.id}
              folder={folder}
              selected={selectedIds.has(folder.id)}
              onToggle={() => toggleFolder(folder.id)}
            />
          ))}
        </div>
      )}
    </div>
  );

  const modal = (
    <BilibiliCookieModal
      open={showCookieModal}
      canClose={cookieConfigured || Boolean(cookie.trim())}
      onClose={() => setShowCookieModal(false)}
      gettingFromBrowser={gettingFromBrowser}
      onFetchFromBrowser={handleGetFromBrowser}
      cookiePreview={cookiePreview}
      cookieInput={cookie}
      showFullCookie={showFullCookie}
      onToggleFullCookie={() => setShowFullCookie((visible) => !visible)}
    />
  );

  if (embedded) {
    return (
      <>
        {modal}
        {content}
      </>
    );
  }

  return (
    <PageContainer>
      {modal}
      <PageHeader
        title="哔哩哔哩工具"
        subtitle="一键连接 Cookie，按动态、稍后再看分类入库"
        icon={Tv}
        actions={
          <button
            type="button"
            onClick={() => setShowCookieModal(true)}
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              background: cookieConfigured ? "transparent" : "rgba(239, 68, 68, 0.08)",
              color: cookieConfigured ? "var(--text-secondary)" : "var(--color-danger)",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Cookie size={16} />
            {cookieConfigured ? "Cookie 配置" : "配置 Cookie"}
          </button>
        }
      />
      <PageContent>
        {content}
      </PageContent>
    </PageContainer>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-subtle)",
        background: "var(--bg-elevated)",
      }}
    >
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function FavoriteFolderTile({
  folder,
  selected,
  onToggle,
}: {
  folder: BilibiliFavoriteFolder;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        padding: 0,
        borderRadius: "var(--radius-md)",
        border: selected ? "2px solid #00AEEC" : "1px solid var(--border-subtle)",
        background: "var(--bg-card)",
        overflow: "hidden",
        textAlign: "left",
        cursor: "pointer",
        minHeight: "286px",
        display: "flex",
        flexDirection: "column",
        boxShadow: selected ? "0 10px 24px rgba(0, 174, 236, 0.16)" : "none",
      }}
    >
      <div style={{ position: "relative", aspectRatio: "16 / 9", background: "var(--bg-muted)", overflow: "hidden" }}>
        {folder.cover ? (
          <img
            src={proxiedImage(folder.cover)}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
            }}
          >
            <ImageOff size={28} />
          </div>
        )}
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            width: "26px",
            height: "26px",
            borderRadius: "6px",
            background: selected ? "#00AEEC" : "rgba(0, 0, 0, 0.52)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected && <Check size={16} />}
        </div>
      </div>

      <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
        <div
          style={{
            fontSize: "0.9375rem",
            fontWeight: 800,
            color: "var(--text-primary)",
            lineHeight: 1.35,
          }}
        >
          {folder.title}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.45, minHeight: "34px" }}>
          {folder.first_video_title || "暂无视频预览"}
        </div>
        <div style={{ marginTop: "auto", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          <Pill>{folder.media_count} 条视频</Pill>
          <Pill>已入库 {folder.crawled_count}</Pill>
          {folder.last_crawled_at && <Pill>{folder.last_crawled_at}</Pill>}
        </div>
      </div>
    </button>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: "5px 7px",
        borderRadius: "6px",
        background: "var(--bg-hover)",
        color: "var(--text-secondary)",
        fontSize: "0.6875rem",
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

function ProgressNotice({
  title,
  stage,
  detail,
  ratio,
}: {
  title: string;
  stage: string;
  detail: string;
  ratio: number;
}) {
  const progress = Math.max(0, Math.min(1, ratio || 0));
  return (
    <div
      style={{
        padding: "12px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid rgba(0, 174, 236, 0.28)",
        background: "rgba(0, 174, 236, 0.08)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-primary)" }}>{title}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{Math.round(progress * 100)}%</div>
      </div>
      <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{stage}</div>
      <div
        style={{
          width: "100%",
          height: "8px",
          borderRadius: "999px",
          background: "rgba(0, 0, 0, 0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(progress * 100)}%`,
            height: "100%",
            background: "linear-gradient(90deg, #00AEEC, #52C41A)",
          }}
        />
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{detail}</div>
    </div>
  );
}

const secondaryButton: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-elevated)",
  color: "var(--text-secondary)",
  fontSize: "0.875rem",
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "7px",
};

const favoriteLoadButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid rgba(0, 174, 236, 0.34)",
  background: "linear-gradient(135deg, rgba(0, 174, 236, 0.22), rgba(251, 114, 153, 0.18))",
  color: "#047EAA",
  fontSize: "0.875rem",
  fontWeight: 800,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "7px",
  boxShadow: "0 7px 16px rgba(0, 174, 236, 0.16)",
};

const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "#00AEEC",
  color: "white",
  fontSize: "0.875rem",
  fontWeight: 800,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "7px",
};

const fullCrawlButton: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid rgba(245, 158, 11, 0.42)",
  background: "rgba(245, 158, 11, 0.12)",
  color: "#B45309",
  fontSize: "0.875rem",
  fontWeight: 800,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "7px",
};
