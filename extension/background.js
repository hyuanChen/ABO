/**
 * XHS Bridge - Background Service Worker
 *
 * 连接 Python bridge server（ws://localhost:9334），接收命令并执行：
 * - navigate / wait_for_load: chrome.tabs.update + onUpdated
 * - evaluate / has_element 等: chrome.scripting.executeScript (MAIN world)
 * - click / input 等 DOM 操作: chrome.tabs.sendMessage → content.js
 * - screenshot: chrome.tabs.captureVisibleTab
 * - get_cookies: chrome.cookies.getAll
 */

const BRIDGE_URL = "ws://localhost:9334";
const DEDICATED_STORAGE_KEY = "xhsBridgeDedicatedTarget";
let ws = null;
let preferredXhsTabId = null;
let preferredXhsWindowId = null;
let dedicatedXhsTabId = null;
let dedicatedXhsWindowId = null;

// 保持 service worker 存活：有开放的 WebSocket 连接时 Chrome 不会终止 SW
// 额外加 alarm 作为保底
chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN) connect();
});

// ───────────────────────── WebSocket ─────────────────────────

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

  ws = new WebSocket(BRIDGE_URL);

  ws.onopen = () => {
    console.log("[XHS Bridge] 已连接到 bridge server");
    ws.send(JSON.stringify({ role: "extension" }));
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    try {
      const result = await handleCommand(msg);
      ws.send(JSON.stringify({ id: msg.id, result: result ?? null }));
    } catch (err) {
      ws.send(JSON.stringify({ id: msg.id, error: String(err.message || err) }));
    }
  };

  ws.onclose = () => {
    console.log("[XHS Bridge] 连接断开，3s 后重连...");
    setTimeout(connect, 3000);
  };

  ws.onerror = (e) => {
    console.error("[XHS Bridge] WS 错误", e);
  };
}

// ───────────────────────── 命令路由 ─────────────────────────

async function handleCommand(msg) {
  const { method, params = {} } = msg;

  switch (method) {
    // ── 导航 ──
    case "navigate":
      return await cmdNavigate(params);

    case "wait_for_load":
      return await cmdWaitForLoad(params);

    case "ensure_dedicated_xhs_tab":
      return await cmdEnsureDedicatedXhsTab(params);

    case "activate_tab":
      return await cmdActivateTab(params);

    case "pulse_tab":
      return await cmdPulseTab(params);

    /*
     * 2026-04-14 shared-tab experiment, see docs/xhs/xhs-update.md §11.3/§11.4.
     * 暂时注释掉这条命令：它用于“当前共享浏览器标签页”模式下的强制切回/切出实验，
     * 实测会打乱专辑页首次进入后的可滚动状态。当前主链路不再调用它，等待专用浏览器窗口方案接手。
     */
    // case "bounce_xhs_tab":
    //   return await cmdBounceXhsTab(params);

    case "get_tab_state":
      return await cmdGetTabState(params);

    // ── 截图 ──
    case "screenshot_element":
      return await cmdScreenshot(params);

    case "set_file_input":
      return await cmdSetFileInputViaDebugger(params);

    // ── Cookies ──
    case "get_cookies":
      return await cmdGetCookies(params);

    // ── 在页面主 world 执行 JS（可访问 window.__INITIAL_STATE__ 等） ──
    case "evaluate":
    case "wait_dom_stable":
    case "wait_for_selector":
    case "has_element":
    case "get_elements_count":
    case "get_element_text":
    case "get_element_attribute":
    case "get_scroll_top":
    case "get_viewport_height":
    case "get_url":
    case "get_xhs_page_snapshot":
    case "get_xhs_profile_cards":
    case "wait_for_xhs_state":
      return await cmdEvaluateInMainWorld(method, params);

    case "xhs_apply_followed_search_filter":
      return await cmdApplyFollowedSearchFilter(params);

    // ── DOM 操作（在页面 MAIN world 执行，无需 content script 就绪） ──
    default:
      return await cmdDomInMainWorld(method, params);
  }
}

// ───────────────────────── 导航 ─────────────────────────

async function cmdNavigate({ url, background = false }) {
  const tab = await getOrOpenXhsTab();
  rememberXhsTab(tab);
  const previousActiveTab = background ? await getCurrentFocusedActiveTab() : null;
  if (!background) {
    await ensureTabVisible(tab);
  }
  if (tab.url === url) return null;
  await chrome.tabs.update(tab.id, { url, active: !background });
  await waitForTabReady(tab.id, url, 60000);
  const updated = await chrome.tabs.get(tab.id).catch(() => tab);
  rememberXhsTab(updated);
  if (background) {
    await restorePreviousActiveTab(previousActiveTab, updated.id);
  }
  return null;
}

async function cmdWaitForLoad({ timeout = 60000, background = false }) {
  const tab = await getOrOpenXhsTab();
  rememberXhsTab(tab);
  const previousActiveTab = background ? await getCurrentFocusedActiveTab() : null;
  if (!background) {
    await ensureTabVisible(tab);
  }
  await waitForTabReady(tab.id, null, timeout);
  if (background) {
    await restorePreviousActiveTab(previousActiveTab, tab.id);
  }
  return null;
}

async function cmdApplyFollowedSearchFilter({
  timeout = 12000,
  foreground = false,
  restore_focus = true,
} = {}) {
  const tab = await getOrOpenXhsTab();
  rememberXhsTab(tab);

  const shouldForeground = Boolean(foreground);
  const shouldRestoreFocus = shouldForeground && Boolean(restore_focus);
  const previousActiveTab = shouldForeground ? await getCurrentFocusedActiveTab() : null;

  if (shouldForeground) {
    await ensureTabVisible(tab);
    await sleep(250);
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: domExecutor,
      args: ["xhs_apply_followed_search_filter", { timeout }],
    });
    const result = results?.[0]?.result;
    if (result && typeof result === "object" && "__xhs_error" in result) {
      throw new Error(result.__xhs_error);
    }
    return result ?? null;
  } finally {
    if (shouldRestoreFocus) {
      await restorePreviousActiveTab(previousActiveTab, tab.id);
    }
  }
}

async function cmdEnsureDedicatedXhsTab({ url = "https://www.xiaohongshu.com/explore" } = {}) {
  await restoreDedicatedTargetFromStorage();

  const existing = await getDedicatedXhsTab();
  if (existing?.id) {
    const dedicatedWindowTabs = await chrome.tabs.query({ windowId: existing.windowId }).catch(() => []);
    const nonChromeTabs = dedicatedWindowTabs.filter((tab) => !(tab.url || "").startsWith("chrome://"));
    const isStandaloneDedicatedWindow =
      nonChromeTabs.length === 1
      && nonChromeTabs[0]?.id === existing.id;

    if (isStandaloneDedicatedWindow) {
      rememberDedicatedXhsTab(existing);
      if (url && !urlMatchesExpectation(existing.url || "", url)) {
        await chrome.tabs.update(existing.id, { url, active: false });
        await waitForTabReady(existing.id, url, 60000);
        const updated = await chrome.tabs.get(existing.id).catch(() => existing);
        rememberDedicatedXhsTab(updated);
        return {
          tabId: updated.id,
          windowId: updated.windowId,
          url: updated.url || "",
          reused: true,
        };
      }
      return {
        tabId: existing.id,
        windowId: existing.windowId,
        url: existing.url || "",
        reused: true,
      };
    }

    dedicatedXhsTabId = null;
    dedicatedXhsWindowId = null;
    await clearDedicatedTargetStorage();
  }

  const createdWindow = await chrome.windows.create({
    url,
    focused: false,
    type: "normal",
  });
  const tab = createdWindow.tabs?.[0];
  if (!tab?.id) throw new Error("无法创建小红书专用窗口");
  await waitForTabReady(tab.id, url, 60000);
  const updated = await chrome.tabs.get(tab.id).catch(() => tab);
  rememberDedicatedXhsTab(updated);
  return {
    tabId: updated.id,
    windowId: updated.windowId,
    url: updated.url || "",
    reused: false,
  };
}

async function cmdActivateTab() {
  const tab = await getOrOpenXhsTab();
  rememberXhsTab(tab);
  await ensureTabVisible(tab);
  return { tabId: tab.id, windowId: tab.windowId };
}

async function cmdPulseTab() {
  const tab = await getOrOpenXhsTab();
  rememberXhsTab(tab);
  await ensureTabVisible(tab);

  const siblingTabs = await chrome.tabs.query({ windowId: tab.windowId });
  const altTab = siblingTabs.find((item) => item.id !== tab.id && !item.url?.startsWith("chrome://"));

  if (altTab?.id) {
    await chrome.tabs.update(altTab.id, { active: true }).catch(() => {});
    await sleep(350);
    await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    await sleep(350);
    rememberXhsTab(tab);
    return { tabId: tab.id, pulsed: true };
  }

  // 当前窗口没有其他 tab 时，临时创建 about:blank 做一次真实切换，再切回 XHS。
  const tempTab = await chrome.tabs.create({
    windowId: tab.windowId,
    url: "about:blank",
    active: true,
  }).catch(() => null);
  if (tempTab?.id) {
    await sleep(350);
    await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    await sleep(350);
    await chrome.tabs.remove(tempTab.id).catch(() => {});
    rememberXhsTab(tab);
    return { tabId: tab.id, pulsed: true, temporaryTab: true };
  }

  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  await sleep(500);
  await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
  rememberXhsTab(tab);
  return { tabId: tab.id, pulsed: false, temporaryTab: false };
}

/*
 * 2026-04-14 shared-tab experiment, see docs/xhs/xhs-update.md §11.3/§11.4.
 * 暂时保留注释实现，便于和阶段性文档对照回退。
 *
 * async function cmdBounceXhsTab() {
 *   const tab = await getOrOpenXhsTab();
 *   rememberXhsTab(tab);
 *
 *   const previousActiveTab = await getCurrentFocusedActiveTab();
 *   await ensureTabVisible(tab);
 *   await sleep(450);
 *
 *   let returnTab = null;
 *   if (previousActiveTab?.id && previousActiveTab.id !== tab.id) {
 *     returnTab = previousActiveTab;
 *   } else {
 *     const siblingTabs = await chrome.tabs.query({ windowId: tab.windowId }).catch(() => []);
 *     returnTab = siblingTabs.find((item) => item.id !== tab.id && !item.url?.startsWith("chrome://")) || null;
 *   }
 *
 *   if (returnTab?.id) {
 *     await chrome.tabs.update(returnTab.id, { active: true }).catch(() => {});
 *     if (typeof returnTab.windowId === "number") {
 *       await chrome.windows.update(returnTab.windowId, { focused: true }).catch(() => {});
 *     }
 *     await sleep(350);
 *     await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
 *     await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
 *     await sleep(450);
 *     rememberXhsTab(tab);
 *     return {
 *       tabId: tab.id,
 *       bounced: true,
 *       via: "previous_or_sibling_tab",
 *       returnTabId: returnTab.id,
 *     };
 *   }
 *
 *   const tempTab = await chrome.tabs.create({
 *     windowId: tab.windowId,
 *     url: "about:blank",
 *     active: true,
 *   }).catch(() => null);
 *   if (tempTab?.id) {
 *     await sleep(350);
 *     await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
 *     await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
 *     await sleep(450);
 *     await chrome.tabs.remove(tempTab.id).catch(() => {});
 *     rememberXhsTab(tab);
 *     return {
 *       tabId: tab.id,
 *       bounced: true,
 *       via: "temporary_tab",
 *       returnTabId: tempTab.id,
 *     };
 *   }
 *
 *   return { tabId: tab.id, bounced: false };
 * }
 */

async function cmdGetTabState() {
  const activeInFocusedWindow = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  }).catch(() => []);
  const preferredTab = preferredXhsTabId ? await chrome.tabs.get(preferredXhsTabId).catch(() => null) : null;
  return {
    preferredTabId: preferredXhsTabId,
    preferredWindowId: preferredXhsWindowId,
    dedicatedTabId: dedicatedXhsTabId,
    dedicatedWindowId: dedicatedXhsWindowId,
    preferredUrl: preferredTab?.url || "",
    activeFocusedTabId: activeInFocusedWindow[0]?.id || null,
    activeFocusedUrl: activeInFocusedWindow[0]?.url || "",
  };
}

async function waitForTabComplete(tabId, expectedUrlPrefix, timeout) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    function listener(id, info, updatedTab) {
      if (id !== tabId) return;
      if (info.status !== "complete") return;
      if (!urlMatchesExpectation(updatedTab?.pendingUrl || updatedTab?.url || "", expectedUrlPrefix)) return;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(listener);

    // 轮询兜底：若事件在监听前已触发
    const poll = async () => {
      if (Date.now() > deadline) {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("页面加载超时"));
        return;
      }
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab && tab.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
        return;
      }
      setTimeout(poll, 400);
    };
    setTimeout(poll, 600);
  });
}

async function waitForTabReady(tabId, expectedUrlPrefix, timeout) {
  const deadline = Date.now() + timeout;
  let lastError = "";

  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab?.id) {
      throw new Error("标签页不存在");
    }

    const currentUrl = tab.pendingUrl || tab.url || "";
    const urlMatched = urlMatchesExpectation(currentUrl, expectedUrlPrefix);
    if (urlMatched && tab.status === "complete") {
      return;
    }

    try {
      const probe = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: () => ({
          href: location.href,
          readyState: document.readyState,
          bodySize: document.body?.innerText?.length || document.body?.innerHTML?.length || 0,
        }),
      });
      const result = probe?.[0]?.result;
      const readyState = result?.readyState || "";
      const href = result?.href || currentUrl;
      const bodySize = Number(result?.bodySize || 0);
      const scriptUrlMatched = urlMatchesExpectation(href, expectedUrlPrefix);
      if (scriptUrlMatched && (readyState === "interactive" || readyState === "complete") && bodySize >= 0) {
        return;
      }
    } catch (error) {
      lastError = String(error?.message || error || "");
    }

    await sleep(350);
  }

  if (lastError) {
    throw new Error(`页面加载超时: ${lastError}`);
  }
  throw new Error("页面加载超时");
}

// ───────────────────────── 截图 ─────────────────────────

async function cmdScreenshot() {
  const tab = await getOrOpenXhsTab();
  rememberXhsTab(tab);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return { data: dataUrl.split(",")[1] };
}

// ───────────────────────── Cookies ─────────────────────────

async function cmdGetCookies({ domain = "xiaohongshu.com" }) {
  return await chrome.cookies.getAll({ domain });
}

// ───────────────────────── MAIN world JS 执行 ─────────────────────────

async function cmdEvaluateInMainWorld(method, params) {
  if (method === "get_url") {
    const tab = await getOrOpenXhsTab();
    rememberXhsTab(tab);
    return tab?.pendingUrl || tab?.url || "";
  }
  const tab = await getOrOpenXhsTab();
  rememberXhsTab(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: mainWorldExecutor,
    args: [method, params],
  });
  const r = results?.[0]?.result;
  if (r && typeof r === "object" && "__xhs_error" in r) {
    throw new Error(r.__xhs_error);
  }
  return r;
}

/**
 * 在页面主 world 运行，可访问 window.__INITIAL_STATE__ 等页面全局变量。
 * 注意：此函数被序列化后注入页面，不能引用外部变量。
 */
function mainWorldExecutor(method, params) {
  function unwrap(value) {
    let current = value;
    const seen = new Set();
    while (current && typeof current === "object" && !seen.has(current)) {
      seen.add(current);
      if (Array.isArray(current)) return current;
      if ("_value" in current) { current = current._value; continue; }
      if ("value" in current) { current = current.value; continue; }
      if ("_rawValue" in current) { current = current._rawValue; continue; }
      break;
    }
    return current;
  }

  function classifyXhsPage(text) {
    const normalized = String(text || "");
    const rules = [
      ["risk_limited", "访问频繁", "命中小红书访问频繁限制"],
      ["risk_limited", "安全限制", "命中小红书安全限制"],
      ["risk_limited", "安全访问", "命中小红书安全访问限制"],
      ["risk_limited", "请稍后再试", "小红书要求稍后重试"],
      ["manual_required", "扫码", "页面要求扫码验证"],
      ["auth_invalid", "请先登录", "当前浏览器未登录小红书"],
      ["auth_invalid", "登录后查看更多内容", "当前页面要求登录后查看"],
      ["not_found", "300031", "当前页面暂时无法浏览"],
      ["not_found", "页面不见了", "页面已不可访问"],
      ["not_found", "内容无法展示", "页面内容不可展示"],
      ["not_found", "笔记不存在", "笔记不存在或已删除"],
      ["not_found", "内容已无法查看", "内容已无法查看"],
    ];
    for (const [code, marker, message] of rules) {
      if (normalized.includes(marker)) return { code, message, marker };
    }
    return null;
  }

  function getXhsSnapshot(params = {}) {
    const state = window.__INITIAL_STATE__ || {};
    const feedState = unwrap(state.feed) || {};
    const searchState = unwrap(state.search) || {};
    const noteState = unwrap(state.note) || {};
    const boardState = unwrap(state.board) || {};
    const feedFeeds = unwrap(feedState.feeds);
    const searchFeeds = unwrap(searchState.feeds);
    const noteMap = unwrap(noteState.noteDetailMap) || {};
    const noteId = params.noteId || "";
    const noteMapValues = noteMap && typeof noteMap === "object" ? Object.values(noteMap) : [];
    const noteTargetReady = (() => {
      if (!noteId) return noteMap && typeof noteMap === "object" ? Object.keys(noteMap).length > 0 : false;
      if (noteMap && typeof noteMap === "object" && noteMap[noteId]) return true;
      for (const item of noteMapValues) {
        if (!item || typeof item !== "object") continue;
        const note = item.note && typeof item.note === "object" ? item.note : item;
        const candidateId = note.noteId || note.note_id || note.id || "";
        if (String(candidateId) === String(noteId)) return true;
      }
      const pathId = (location.pathname.match(/\/(?:explore|search_result)\/([^/?#]+)/) || [])[1] || "";
      return !!pathId && String(pathId) === String(noteId);
    })();
    const boardFeedsMap = unwrap(boardState.boardFeedsMap) || {};
    const boardId = params.boardId || "";
    const boardNotes = boardId ? unwrap(boardFeedsMap?.[boardId]?.notes) : [];
    const bodyText = document.body?.innerText || "";
    const pageText = `${document.title || ""}\n${location.href}\n${bodyText.slice(0, 2500)}`;
    const risk = classifyXhsPage(pageText);
    return {
      href: location.href,
      title: document.title || "",
      readyState: document.readyState,
      hasInitialState: !!window.__INITIAL_STATE__,
      risk,
      bodyText: bodyText.slice(0, Number(params.textLimit || 1200)),
      statePaths: {
        "feed.feeds": Array.isArray(feedFeeds) ? feedFeeds.length : 0,
        "search.feeds": Array.isArray(searchFeeds) ? searchFeeds.length : 0,
        "note.noteDetailMap": noteMap && typeof noteMap === "object" ? Object.keys(noteMap).length : 0,
        "note.targetReady": noteTargetReady ? 1 : 0,
        "board.boardFeedsMap": boardFeedsMap && typeof boardFeedsMap === "object" ? Object.keys(boardFeedsMap).length : 0,
        "board.boardFeedsMap[boardId].notes": Array.isArray(boardNotes) ? boardNotes.length : 0,
      },
    };
  }

  function isXhsStateReady(snapshot, params = {}) {
    if (snapshot.risk) return true;
    const kind = params.kind || "any";
    const paths = snapshot.statePaths || {};
    if (kind === "feed") return paths["feed.feeds"] > 0;
    if (kind === "search") return paths["search.feeds"] > 0;
    if (kind === "note") {
      if (params.noteId) return paths["note.targetReady"] > 0;
      return paths["note.noteDetailMap"] > 0;
    }
    if (kind === "board") return paths["board.boardFeedsMap[boardId].notes"] > 0;
    return snapshot.hasInitialState || Object.values(paths).some((count) => Number(count || 0) > 0);
  }

  function collectXhsCards(params = {}) {
    const pageKind = params.kind || "profile";
    const limit = Math.max(1, Math.min(Number(params.limit || 50), 200));
    const defaultXsecSource = pageKind === "feed" ? "pc_feed" : (pageKind === "profile" ? "pc_user" : "pc_search");
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const state = window.__INITIAL_STATE__ || {};
    const roots = [
      unwrap(state.user?.notes),
      unwrap(state.user?.noteList),
      unwrap(state.user?.feeds),
      unwrap(state.profile?.notes),
      unwrap(state.profile?.noteList),
      unwrap(state.search?.feeds),
      unwrap(state.search?.notes),
      unwrap(state.feed?.feeds),
      unwrap(state.note?.noteDetailMap),
    ].filter(Boolean);
    const metaById = {};
    const mergeMeta = (noteId, patch) => {
      if (!noteId) return;
      const current = metaById[noteId] || {};
      metaById[noteId] = {
        xsec_token: current.xsec_token || patch.xsec_token || "",
        author: current.author || patch.author || "",
        author_id: current.author_id || patch.author_id || "",
      };
    };
    const addToken = (value) => {
      if (!value || typeof value !== "object") return;
      const noteCard = value.noteCard || {};
      const noteId = value.noteId || value.note_id || value.id || noteCard.noteId || noteCard.note_id || noteCard.id;
      const token = value.xsecToken || value.xsec_token || noteCard.xsecToken || noteCard.xsec_token;
      const user = value.user || value.userInfo || value.authorInfo || noteCard.user || noteCard.userInfo || noteCard.authorInfo || {};
      const author = user.nickname || user.name || user.userName || value.author || noteCard.author || "";
      const authorId = user.userId || user.user_id || user.uid || user.id || value.authorId || value.author_id || value.userId || noteCard.authorId || noteCard.author_id || noteCard.userId || "";
      mergeMeta(noteId, {
        xsec_token: token ? String(token) : "",
        author: author ? String(author) : "",
        author_id: authorId ? String(authorId) : "",
      });
    };
    const queue = roots.map((value) => ({ value, depth: 0 }));
    const seenObjects = new WeakSet();
    let visited = 0;
    while (queue.length && visited < 2500) {
      const { value, depth } = queue.shift();
      if (!value || typeof value !== "object" || seenObjects.has(value) || depth > 5) continue;
      seenObjects.add(value);
      visited += 1;
      addToken(value);
      const children = Array.isArray(value)
        ? value.slice(0, 120)
        : Object.keys(value).slice(0, 120).map((key) => {
            try { return value[key]; } catch (_) { return null; }
          });
      for (const child of children) {
        if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1 });
      }
    }

    const cards = [];
    const seenHrefs = new Set();
    const anchors = Array.from(document.querySelectorAll('a[href*="/explore/"]'));
    for (const anchor of anchors) {
      const rawHref = anchor.href || anchor.getAttribute("href") || "";
      if (!rawHref) continue;
      const absoluteHref = rawHref.startsWith("http") ? rawHref : new URL(rawHref, location.origin).href;
      if (seenHrefs.has(absoluteHref)) continue;
      seenHrefs.add(absoluteHref);
      const url = new URL(absoluteHref);
      const noteId = (url.pathname.match(/\/explore\/([^/?#]+)/) || [])[1] || "";
      const noteMeta = metaById[noteId] || {};
      const tokenNode = anchor.closest('[data-xsec-token],[xsec-token]');
      const card =
        anchor.closest("section") ||
        anchor.closest("article") ||
        anchor.closest('div[class*="note"]') ||
        anchor.closest('div[class*="feed"]') ||
        anchor.parentElement;
      const authorLink = Array.from((card || anchor).querySelectorAll('a[href*="/user/profile/"]')).find((node) => {
        const text = normalize(node.innerText || node.textContent || "");
        return text && !/关注|粉丝|获赞|笔记|主页|小红书号/i.test(text);
      }) || null;
      const authorHref = authorLink?.href || authorLink?.getAttribute?.("href") || "";
      const absoluteAuthorHref = authorHref
        ? (authorHref.startsWith("http") ? authorHref : new URL(authorHref, location.origin).href)
        : "";
      const authorId = (absoluteAuthorHref.match(/\/user\/profile\/([^/?#]+)/) || [])[1] || noteMeta.author_id || "";
      const authorName = normalize(authorLink?.innerText || authorLink?.textContent || "") || normalize(noteMeta.author || "");
      const text = normalize(card?.innerText || anchor.innerText || "");
      const lines = text.split("\n").map((line) => normalize(line)).filter(Boolean);
      const images = Array.from((card || anchor).querySelectorAll("img"))
        .map((img) => img.src || img.getAttribute("data-src") || "")
        .filter(Boolean)
        .filter((src) => !src.includes("avatar"));
      cards.push({
        href: rawHref,
        xsec_token:
          url.searchParams.get("xsec_token") ||
          noteMeta.xsec_token ||
          anchor.dataset.xsecToken ||
          tokenNode?.dataset?.xsecToken ||
          tokenNode?.getAttribute?.("xsec-token") ||
          "",
        xsec_source: url.searchParams.get("xsec_source") || defaultXsecSource,
        author: authorName,
        author_id: authorId,
        title: lines[0] || "",
        text,
        lines,
        images: images.slice(0, 9),
      });
      if (cards.length >= limit) break;
    }
    return cards;
  }

  function poll(check, interval, timeout) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function tick() {
        const result = check();
        if (result !== false && result !== null && result !== undefined) {
          resolve(result);
          return;
        }
        if (Date.now() - start >= timeout) {
          reject(new Error("超时"));
          return;
        }
        setTimeout(tick, interval);
      })();
    });
  }

  switch (method) {
    case "evaluate": {
      try {
        // eslint-disable-next-line no-new-func
        return Function(`"use strict"; return (${params.expression})`)();
      } catch (e) {
        return { __xhs_error: `JS执行错误: ${e.message}` };
      }
    }

    case "has_element":
      return document.querySelector(params.selector) !== null;

    case "get_elements_count":
      return document.querySelectorAll(params.selector).length;

    case "get_element_text": {
      const el = document.querySelector(params.selector);
      return el ? el.textContent : null;
    }

    case "get_element_attribute": {
      const el = document.querySelector(params.selector);
      return el ? el.getAttribute(params.attr) : null;
    }

    case "get_scroll_top":
      return window.pageYOffset || document.documentElement.scrollTop || 0;

    case "get_viewport_height":
      return window.innerHeight;

    case "get_url":
      return window.location.href;

    case "get_xhs_page_snapshot":
      return getXhsSnapshot(params || {});

    case "get_xhs_profile_cards":
      return collectXhsCards({ ...(params || {}), kind: "profile" });

    case "wait_for_xhs_state": {
      const timeout = params.timeout || 15000;
      const interval = params.interval || 500;
      return poll(
        () => {
          const snapshot = getXhsSnapshot(params || {});
          return isXhsStateReady(snapshot, params || {}) ? snapshot : false;
        },
        interval,
        timeout,
      ).catch(() => getXhsSnapshot(params || {}));
    }

    case "wait_dom_stable": {
      const timeout = params.timeout || 10000;
      const interval = params.interval || 500;
      return new Promise((resolve) => {
        let last = -1;
        const start = Date.now();
        (function tick() {
          const size = document.body ? document.body.innerHTML.length : 0;
          if (size === last && size > 0) { resolve(null); return; }
          last = size;
          if (Date.now() - start >= timeout) { resolve(null); return; }
          setTimeout(tick, interval);
        })();
      });
    }

    case "wait_for_selector": {
      const timeout = params.timeout || 30000;
      return poll(
        () => document.querySelector(params.selector) ? true : false,
        200,
        timeout,
      ).catch(() => { throw new Error(`等待元素超时: ${params.selector}`); });
    }

    default:
      return { __xhs_error: `未知 MAIN world 方法: ${method}` };
  }
}

// ───────────────────────── 文件上传（chrome.debugger + CDP） ─────────

async function cmdSetFileInputViaDebugger({ selector, files }) {
  const tab = await getOrOpenXhsTab();
  rememberXhsTab(tab);
  const target = { tabId: tab.id };

  await chrome.debugger.attach(target, "1.3");
  try {
    const { root } = await chrome.debugger.sendCommand(target, "DOM.getDocument", { depth: 0 });
    const { nodeId } = await chrome.debugger.sendCommand(target, "DOM.querySelector", {
      nodeId: root.nodeId,
      selector,
    });
    if (!nodeId) throw new Error(`文件输入框不存在: ${selector}`);
    await chrome.debugger.sendCommand(target, "DOM.setFileInputFiles", {
      nodeId,
      files,  // 本地文件路径数组，由 Python 侧提供
    });
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
  return null;
}

// ───────────────────────── DOM 操作（MAIN world） ────────────────────

async function cmdDomInMainWorld(method, params) {
  const tab = await getOrOpenXhsTab();
  rememberXhsTab(tab);
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: domExecutor,
    args: [method, params],
  });
  const r = results?.[0]?.result;
  if (r && typeof r === "object" && "__xhs_error" in r) {
    throw new Error(r.__xhs_error);
  }
  return r ?? null;
}

/**
 * DOM 操作执行器，在页面 MAIN world 运行。
 * 不能引用外部变量，所有逻辑自包含。
 */
function domExecutor(method, params) {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function normalize(value) { return String(value || "").replace(/\s+/g, "").trim(); }
  function isVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const opacity = Number(style.opacity || "1");
    const zIndex = Number(style.zIndex || "0");
    const ariaHidden = String(el.getAttribute?.("aria-hidden") || "").toLowerCase() === "true";
    if (ariaHidden && opacity < 0.05) return false;
    if (opacity < 0.05) return false;
    if (zIndex < 0 && opacity < 0.2) return false;
    return rect.width > 8 && rect.height > 8 && style.visibility !== "hidden" && style.display !== "none";
  }
  function collectNodeTexts(node) {
    if (!node || !(node instanceof HTMLElement)) return [];
    return [
      node.innerText || "",
      node.textContent || "",
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      node.getAttribute?.("data-testid") || "",
      node.getAttribute?.("placeholder") || "",
      node.getAttribute?.("alt") || "",
    ].map((value) => normalize(value)).filter(Boolean);
  }
  function ancestorMatches(node, hints = []) {
    if (!hints.length) return false;
    let current = node;
    while (current && current instanceof HTMLElement) {
      const haystack = normalize([
        current.innerText || current.textContent || "",
        current.className || "",
        current.id || "",
        current.getAttribute?.("role") || "",
        current.getAttribute?.("data-testid") || "",
      ].join(" "));
      if (hints.some((hint) => haystack.includes(normalize(hint)))) return true;
      current = current.parentElement;
    }
    return false;
  }
  function getClickable(node) {
    if (!node) return null;
    return node.closest?.(
      'button,a[href],input,label,[role="button"],[role="option"],[role="radio"],[role="checkbox"],[tabindex],li,div'
    ) || node;
  }
  function findExactFilterButton() {
    const selectors = [
      ".search-layout__top .filter",
      ".filter",
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node instanceof HTMLElement && isVisible(node)) return node;
    }
    return null;
  }
  function findFollowedFilterOption() {
    const normalizeLabels = ["只看已关注", "已关注"].map((value) => normalize(value));
    const filterSections = Array.from(document.querySelectorAll(".filters"));
    for (const section of filterSections) {
      if (!(section instanceof HTMLElement) || !isVisible(section)) continue;
      const labelNode = Array.from(section.children).find((child) => child instanceof HTMLElement && normalize(child.innerText || child.textContent || ""));
      const sectionLabel = normalize(labelNode?.innerText || labelNode?.textContent || "");
      if (sectionLabel !== normalize("搜索范围")) continue;
      const exactTags = Array.from(section.querySelectorAll(".tag-container .tags[data-hp-bound='1']"));
      for (const node of exactTags) {
        if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
        const ariaHidden = String(node.getAttribute("aria-hidden") || "").toLowerCase();
        if (ariaHidden === "true") continue;
        const text = normalize(node.innerText || node.textContent || "");
        if (normalizeLabels.includes(text)) {
          return node;
        }
      }
    }

    const selectors = [
      ".filters .tags[data-hp-bound='1']",
      ".filters .tags",
      ".filters span",
      ".filters div",
      '[role=\"dialog\"] .tags',
      '[role=\"dialog\"] span',
      '[role=\"dialog\"] div',
    ];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
        const ariaHidden = String(node.getAttribute("aria-hidden") || "").toLowerCase();
        if (ariaHidden === "true") continue;
        const texts = collectNodeTexts(node);
        if (texts.some((text) => normalizeLabels.includes(text))) {
          return node;
        }
      }
    }
    return null;
  }
  function clickLikeUser(node) {
    const clickable = getClickable(node);
    if (!(clickable instanceof HTMLElement)) return false;
    clickable.scrollIntoView({ block: "center", inline: "center" });
    clickable.focus?.();
    const rect = clickable.getBoundingClientRect();
    const clientX = rect.left + Math.max(4, Math.min(rect.width - 4, rect.width / 2));
    const clientY = rect.top + Math.max(4, Math.min(rect.height - 4, rect.height / 2));
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      clickable.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX,
        clientY,
      }));
    }
    try {
      clickable.click?.();
    } catch (_err) {
      return false;
    }
    return true;
  }
  function clickNative(node) {
    if (!(node instanceof HTMLElement)) return false;
    node.scrollIntoView({ block: "center", inline: "center" });
    try {
      node.click?.();
    } catch (_err) {
      return false;
    }
    return true;
  }
  function findBestTextCandidate(labels, preferredAncestors = []) {
    const normalizedLabels = (labels || []).map((label) => normalize(label)).filter(Boolean);
    const candidates = [];
    const nodes = Array.from(document.querySelectorAll("button, a, span, div, li, label"));
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const texts = collectNodeTexts(node);
      if (!texts.length) continue;
      let bestScore = -1;
      let matchedLabel = "";
      let matchedText = "";
      for (const text of texts) {
        if (!text || text.length > 64) continue;
        for (const label of normalizedLabels) {
          if (text === label) {
            bestScore = Math.max(bestScore, 300);
            matchedLabel = label;
            matchedText = text;
          } else if (text.includes(label)) {
            bestScore = Math.max(bestScore, 220);
            matchedLabel = label;
            matchedText = text;
          }
        }
      }
      if (bestScore < 0) continue;
      const preferred = ancestorMatches(node, preferredAncestors);
      const clickable = getClickable(node);
      const score = bestScore + (preferred ? 180 : 0) + (clickable !== node ? 40 : 0);
      candidates.push({
        node,
        clickable,
        matchedLabel,
        matchedText,
        preferred,
        score,
      });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }
  async function waitForLabels(labels, timeout = 8000, interval = 300) {
    const normalizedLabels = (labels || []).map((label) => normalize(label)).filter(Boolean);
    const started = Date.now();
    let lastText = "";
    while (Date.now() - started < timeout) {
      lastText = normalize((document.body?.innerText || "").slice(0, 5000));
      if (normalizedLabels.some((label) => lastText.includes(label))) return true;
      await sleep(interval);
    }
    return { ok: false, lastText: lastText.slice(0, 800), labels: normalizedLabels };
  }
  function getFollowedFilterStatus() {
    const topFilter = findExactFilterButton();
    const topFilterText = normalize(topFilter?.innerText || topFilter?.textContent || "");
    let followedActive = false;
    const matches = [];
    const filterSections = Array.from(document.querySelectorAll(".filters"));
    for (const section of filterSections) {
      if (!(section instanceof HTMLElement) || !isVisible(section)) continue;
      const labelNode = Array.from(section.children).find((child) => child instanceof HTMLElement && normalize(child.innerText || child.textContent || ""));
      const sectionLabel = normalize(labelNode?.innerText || labelNode?.textContent || "");
      if (sectionLabel !== normalize("搜索范围")) continue;
      const exactTags = Array.from(section.querySelectorAll(".tag-container .tags[data-hp-bound='1']"));
      for (const node of exactTags) {
        if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
        const text = normalize(node.innerText || node.textContent || "");
        if (!text.includes(normalize("已关注")) && !text.includes(normalize("只看已关注"))) continue;
        const style = window.getComputedStyle(node);
        const classText = normalize(node.className || "");
        const active =
          /(active|selected|checked|current|on|enable)/i.test(classText) ||
          style.fontWeight === "700" ||
          style.fontWeight === "800" ||
          style.fontWeight === "900" ||
          style.color.includes("255, 46, 77");
        if (active) followedActive = true;
        matches.push({
          text,
          active,
          className: node.className || "",
          hpBound: node.getAttribute?.("data-hp-bound") || "",
          top_filter_text: topFilterText,
        });
      }
    }
    return {
      applied: followedActive || topFilterText.includes(normalize("已筛选")),
      top_filter_text: topFilterText,
      followed_active: followedActive,
      matches: matches.slice(0, 8),
    };
  }

  function requireEl(selector) {
    const el = document.querySelector(selector);
    if (!el) return { __xhs_error: `元素不存在: ${selector}` };
    return el;
  }

  switch (method) {
    case "click_element": {
      const el = requireEl(params.selector);
      if (el.__xhs_error) return el;
      el.scrollIntoView({ block: "center" });
      el.focus();
      el.click();
      return null;
    }

    case "xhs_apply_followed_search_filter": {
      return new Promise(async (resolve) => {
        const timeout = Number(params.timeout || 12000);
        const debug = { steps: [] };
        const readySearch = await waitForLabels(["筛选", "综合", "搜索"], Math.min(timeout, 12000), 350);
        if (readySearch !== true) {
          resolve({ __xhs_error: `搜索页未出现筛选入口: ${JSON.stringify(readySearch)}` });
          return;
        }

        const exactFilterButton = findExactFilterButton();
        if (exactFilterButton instanceof HTMLElement) {
          if (!clickNative(exactFilterButton)) {
            resolve({ __xhs_error: "找到了 .filter，但点击失败" });
            return;
          }
          debug.steps.push({ action: "open-filter", matched: normalize(exactFilterButton.innerText || exactFilterButton.textContent || ""), via: "exact-filter-selector" });
        } else {
          const filterButton = findBestTextCandidate(["筛选"]);
          if (!filterButton || !clickLikeUser(filterButton.node)) {
            resolve({ __xhs_error: `未找到可点击的筛选按钮: ${JSON.stringify(filterButton)}` });
            return;
          }
          debug.steps.push({ action: "open-filter", matched: filterButton.matchedText, score: filterButton.score, via: "text-candidate" });
        }
        await sleep(700);
        const exactFollowedReady = await waitForLabels(["已关注", "只看已关注", "搜索范围", "排序依据"], 4000, 250);
        debug.steps.push({ action: "wait-followed-panel", ready: exactFollowedReady === true ? "ok" : exactFollowedReady });

        const exactFollowedOption = findFollowedFilterOption();
        if (exactFollowedOption instanceof HTMLElement) {
          const optionText = normalize(exactFollowedOption.innerText || exactFollowedOption.textContent || "");
          if (!clickNative(exactFollowedOption)) {
            resolve({ __xhs_error: `找到了已关注选项，但点击失败: ${optionText}` });
            return;
          }
          debug.steps.push({ action: "select-followed", matched: optionText, via: "exact-followed-selector" });
        } else {
          const readyFollowed = await waitForLabels(["已关注", "只看已关注", "筛选"], 8000, 300);
          if (readyFollowed !== true) {
            resolve({ __xhs_error: `筛选面板未出现已关注选项: ${JSON.stringify(readyFollowed)}` });
            return;
          }

          const followedOption = findBestTextCandidate(
            ["只看已关注", "已关注"],
            ["筛选", "filter", "popup", "dialog", "drawer", "sheet", "panel"],
          );
          if (!followedOption || !clickLikeUser(followedOption.node)) {
            resolve({ __xhs_error: `未找到可点击的已关注选项: ${JSON.stringify(followedOption)}` });
            return;
          }
          debug.steps.push({ action: "select-followed", matched: followedOption.matchedText, score: followedOption.score, via: "text-candidate" });
        }
        await sleep(700);

        const confirmButton = findBestTextCandidate(
          ["确定", "完成", "应用"],
          ["筛选", "filter", "popup", "dialog", "drawer", "sheet", "panel"],
        );
        if (confirmButton) {
          clickLikeUser(confirmButton.node);
          debug.steps.push({ action: "confirm-filter", matched: confirmButton.matchedText, score: confirmButton.score });
          await sleep(900);
        }
        resolve({ ok: true, debug });
      });
    }

    case "input_text": {
      const el = requireEl(params.selector);
      if (el.__xhs_error) return el;
      el.focus();
      el.value = params.text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return null;
    }

    case "input_content_editable": {
      return new Promise(async (resolve) => {
        const el = document.querySelector(params.selector);
        if (!el) { resolve({ __xhs_error: `元素不存在: ${params.selector}` }); return; }
        el.focus();
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);
        await sleep(80);
        const lines = params.text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]) document.execCommand("insertText", false, lines[i]);
          if (i < lines.length - 1) {
            // insertParagraph 才能在 contenteditable 里真正插入换行
            document.execCommand("insertParagraph", false, null);
            await sleep(30);
          }
        }
        resolve(null);
      });
    }

    case "set_file_input": {
      return new Promise((resolve) => {
        const el = document.querySelector(params.selector);
        if (!el) { resolve({ __xhs_error: `文件输入框不存在: ${params.selector}` }); return; }

        function makeFiles() {
          const dt = new DataTransfer();
          for (const f of params.files) {
            const bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0));
            dt.items.add(new File([bytes], f.name, { type: f.type }));
          }
          return dt;
        }

        // 方法1: 覆盖 files 属性 + change 事件（标准 file input）
        try {
          const dt = makeFiles();
          Object.defineProperty(el, "files", { value: dt.files, configurable: true, writable: true });
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (e) {}

        // 方法2: drag-drop 到上传区域（XHS 主要监听 drop 事件）
        const dropTarget =
          el.closest('[class*="upload"]') ||
          el.closest('[class*="Upload"]') ||
          el.parentElement;
        if (dropTarget) {
          try {
            const dt2 = makeFiles();
            dropTarget.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt2 }));
            dropTarget.dispatchEvent(new DragEvent("dragover",  { bubbles: true, cancelable: true, dataTransfer: dt2 }));
            dropTarget.dispatchEvent(new DragEvent("drop",      { bubbles: true, cancelable: true, dataTransfer: dt2 }));
          } catch (e) {}
        }

        resolve(null);
      });
    }

    case "scroll_by":
      window.scrollBy(params.x || 0, params.y || 0); return null;
    case "scroll_to":
      window.scrollTo(params.x || 0, params.y || 0); return null;
    case "scroll_to_bottom":
      window.scrollTo(0, document.body.scrollHeight); return null;

    case "scroll_element_into_view": {
      const el = document.querySelector(params.selector);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return null;
    }
    case "scroll_nth_element_into_view": {
      const els = document.querySelectorAll(params.selector);
      if (els[params.index]) els[params.index].scrollIntoView({ behavior: "smooth", block: "center" });
      return null;
    }

    case "dispatch_wheel_event": {
      const target = document.querySelector(".note-scroller") ||
        document.querySelector(".interaction-container") || document.documentElement;
      target.dispatchEvent(new WheelEvent("wheel", { deltaY: params.deltaY || 0, deltaMode: 0, bubbles: true, cancelable: true }));
      return null;
    }

    case "mouse_move":
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: params.x, clientY: params.y, bubbles: true }));
      return null;

    case "mouse_click": {
      const el = document.elementFromPoint(params.x, params.y);
      if (el) {
        ["mousedown", "mouseup", "click"].forEach(t =>
          el.dispatchEvent(new MouseEvent(t, { clientX: params.x, clientY: params.y, bubbles: true }))
        );
      }
      return null;
    }

    case "press_key": {
      const active = document.activeElement || document.body;
      const inCE = active.isContentEditable;
      if (inCE && params.key === "Enter") {
        document.execCommand("insertParagraph", false, null);
        return null;
      }
      if (inCE && params.key === "ArrowDown") {
        // 将光标移到内容末尾（等价于多次下移到底）
        const sel = window.getSelection();
        if (sel && active.childNodes.length) {
          sel.selectAllChildren(active);
          sel.collapseToEnd();
        }
        return null;
      }
      const keyMap = {
        Enter: { key: "Enter", code: "Enter", keyCode: 13 },
        ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
        Tab: { key: "Tab", code: "Tab", keyCode: 9 },
        Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
      };
      const info = keyMap[params.key] || { key: params.key, code: params.key, keyCode: 0 };
      active.dispatchEvent(new KeyboardEvent("keydown", { ...info, bubbles: true }));
      active.dispatchEvent(new KeyboardEvent("keyup", { ...info, bubbles: true }));
      return null;
    }

    case "type_text": {
      return new Promise(async (resolve) => {
        const active = document.activeElement || document.body;
        const inCE = active.isContentEditable;
        for (const char of params.text) {
          if (inCE) {
            document.execCommand("insertText", false, char);
          } else {
            active.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
            active.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
            active.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
          }
          await sleep(params.delayMs || 50);
        }
        resolve(null);
      });
    }

    case "remove_element": {
      const el = document.querySelector(params.selector);
      if (el) el.remove();
      return null;
    }

    case "hover_element": {
      const el = document.querySelector(params.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        el.dispatchEvent(new MouseEvent("mouseover", { clientX: x, clientY: y, bubbles: true }));
        el.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
      }
      return null;
    }

    case "select_all_text": {
      const el = document.querySelector(params.selector);
      if (el) { el.focus(); if (el.select) el.select(); else document.execCommand("selectAll"); }
      return null;
    }

    default:
      return { __xhs_error: `未知 DOM 命令: ${method}` };
  }
}

// ───────────────────────── Tab 管理 ─────────────────────────

async function getOrOpenXhsTab() {
  const dedicated = await getDedicatedXhsTab();
  if (dedicated?.id) {
    rememberDedicatedXhsTab(dedicated);
    return dedicated;
  }

  if (preferredXhsTabId) {
    const preferred = await chrome.tabs.get(preferredXhsTabId).catch(() => null);
    if (preferred?.id && isXhsUrl(preferred.url)) {
      return preferred;
    }
    preferredXhsTabId = null;
    preferredXhsWindowId = null;
  }

  const focusedWindowTabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    url: [
      "https://www.xiaohongshu.com/*",
      "https://xiaohongshu.com/*",
      "https://creator.xiaohongshu.com/*",
    ],
  });
  if (focusedWindowTabs.length > 0) {
    rememberXhsTab(focusedWindowTabs[0]);
    return focusedWindowTabs[0];
  }

  const activeTabs = await chrome.tabs.query({
    active: true,
    url: [
      "https://www.xiaohongshu.com/*",
      "https://xiaohongshu.com/*",
      "https://creator.xiaohongshu.com/*",
    ],
  });
  if (activeTabs.length > 0) {
    activeTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    rememberXhsTab(activeTabs[0]);
    return activeTabs[0];
  }

  const tabs = await chrome.tabs.query({
    url: [
      "https://www.xiaohongshu.com/*",
      "https://xiaohongshu.com/*",
      "https://creator.xiaohongshu.com/*",
    ],
  });
  if (tabs.length > 0) {
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    rememberXhsTab(tabs[0]);
    return tabs[0];
  }
  // 没有已打开的 XHS 页面时，优先在现有窗口创建 tab；如果当前没有窗口，则新开窗口。
  const windows = await chrome.windows.getAll({ populate: false }).catch(() => []);
  if (windows.length > 0) {
    const current = await chrome.windows.getLastFocused().catch(() => null);
    const targetWindowId = current?.id || windows[0]?.id;
    const tab = await chrome.tabs.create({
      url: "https://www.xiaohongshu.com/",
      windowId: targetWindowId,
      active: true,
    });
    await waitForTabComplete(tab.id, null, 30000);
    rememberXhsTab(tab);
    return tab;
  }

  const createdWindow = await chrome.windows.create({ url: "https://www.xiaohongshu.com/" });
  const tab = createdWindow.tabs?.[0];
  if (!tab?.id) throw new Error("无法创建小红书浏览器窗口");
  await waitForTabComplete(tab.id, null, 30000);
  rememberXhsTab(tab);
  return tab;
}

async function getDedicatedXhsTab() {
  await restoreDedicatedTargetFromStorage();
  if (!dedicatedXhsTabId) return null;
  const tab = await chrome.tabs.get(dedicatedXhsTabId).catch(() => null);
  if (tab?.id && isXhsUrl(tab.url)) {
    return tab;
  }
  dedicatedXhsTabId = null;
  dedicatedXhsWindowId = null;
  await clearDedicatedTargetStorage();
  return null;
}

async function findReusableXhsTab({ avoidFocusedWindow = false } = {}) {
  const focusedWindow = avoidFocusedWindow ? await chrome.windows.getLastFocused().catch(() => null) : null;
  if (preferredXhsTabId) {
    const preferred = await chrome.tabs.get(preferredXhsTabId).catch(() => null);
    if (
      preferred?.id
      && isXhsUrl(preferred.url)
      && (!avoidFocusedWindow || preferred.windowId !== focusedWindow?.id)
    ) {
      return preferred;
    }
  }

  const tabs = await chrome.tabs.query({
    url: [
      "https://www.xiaohongshu.com/*",
      "https://xiaohongshu.com/*",
    ],
  }).catch(() => []);
  if (!tabs.length) return null;
  const filtered = avoidFocusedWindow
    ? tabs.filter((tab) => tab.windowId !== focusedWindow?.id)
    : tabs;
  if (!filtered.length) return null;
  filtered.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return filtered[0];
}

async function ensureTabVisible(tab) {
  if (!tab?.id) return;
  rememberXhsTab(tab);
  if (typeof tab.windowId === "number") {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }
  await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
}

async function getCurrentFocusedActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  }).catch(() => []);
  return tabs[0] || null;
}

async function restorePreviousActiveTab(previousTab, currentXhsTabId) {
  if (!previousTab?.id) return;
  if (previousTab.id === currentXhsTabId) return;
  await chrome.tabs.update(previousTab.id, { active: true }).catch(() => {});
  if (typeof previousTab.windowId === "number") {
    await chrome.windows.update(previousTab.windowId, { focused: true }).catch(() => {});
  }
}

function isXhsUrl(url) {
  return /^https:\/\/(www\.)?xiaohongshu\.com\//.test(url || "") || /^https:\/\/creator\.xiaohongshu\.com\//.test(url || "");
}

function rememberXhsTab(tab) {
  if (!tab?.id || !isXhsUrl(tab.url)) return;
  preferredXhsTabId = tab.id;
  preferredXhsWindowId = tab.windowId ?? null;
}

function rememberDedicatedXhsTab(tab) {
  if (!tab?.id || !isXhsUrl(tab.url)) return;
  dedicatedXhsTabId = tab.id;
  dedicatedXhsWindowId = tab.windowId ?? null;
  rememberXhsTab(tab);
  persistDedicatedTarget(tab);
}

function sameUrlWithoutHash(left, right) {
  return String(left || "").split("#", 1)[0] === String(right || "").split("#", 1)[0];
}

function parseUrlSafe(value) {
  try {
    return new URL(String(value || ""));
  } catch {
    return null;
  }
}

function trimTrailingSlash(pathname) {
  const text = String(pathname || "");
  if (!text || text === "/") return "/";
  return text.replace(/\/+$/, "") || "/";
}

function extractXhsRouteIdentity(urlValue) {
  const parsed = parseUrlSafe(urlValue);
  if (!parsed) return null;
  const match = parsed.pathname.match(/^\/(explore|search_result|board)\/([^/?#]+)/);
  if (!match) return null;
  const kind = match[1];
  const id = match[2];
  if (!id) return null;
  return { kind, id, origin: parsed.origin };
}

function queryMatchesExpectation(currentParsed, expectedParsed) {
  const expectedEntries = Array.from(expectedParsed.searchParams.entries());
  if (!expectedEntries.length) return true;
  for (const [key, value] of expectedEntries) {
    const currentValues = currentParsed.searchParams.getAll(key);
    if (!currentValues.length || !currentValues.includes(value)) {
      return false;
    }
  }
  return true;
}

function urlMatchesExpectation(current, expected) {
  if (!expected) return true;

  const currentText = String(current || "").split("#", 1)[0];
  const expectedText = String(expected || "").split("#", 1)[0];
  if (!currentText || !expectedText) return currentText === expectedText;
  if (currentText === expectedText) return true;

  const currentParsed = parseUrlSafe(currentText);
  const expectedParsed = parseUrlSafe(expectedText);
  if (!currentParsed || !expectedParsed) {
    return currentText.startsWith(expectedText);
  }
  if (currentParsed.origin !== expectedParsed.origin) return false;

  const currentPath = trimTrailingSlash(currentParsed.pathname);
  const expectedPath = trimTrailingSlash(expectedParsed.pathname);
  if (currentPath === expectedPath) {
    return queryMatchesExpectation(currentParsed, expectedParsed);
  }

  const currentIdentity = extractXhsRouteIdentity(currentText);
  const expectedIdentity = extractXhsRouteIdentity(expectedText);
  if (currentIdentity && expectedIdentity) {
    const sameRoute = currentIdentity.kind === expectedIdentity.kind && currentIdentity.id === expectedIdentity.id;
    const sameNote = ["explore", "search_result"].includes(currentIdentity.kind)
      && ["explore", "search_result"].includes(expectedIdentity.kind)
      && currentIdentity.id === expectedIdentity.id;
    if ((sameRoute || sameNote) && currentIdentity.origin === expectedIdentity.origin) {
      return true;
    }
  }

  return currentText.startsWith(expectedText);
}

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  if (dedicatedXhsTabId && tabId !== dedicatedXhsTabId) {
    return;
  }
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && isXhsUrl(tab.url)) {
    preferredXhsTabId = tabId;
    preferredXhsWindowId = windowId ?? tab.windowId ?? null;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === dedicatedXhsTabId && changeInfo.url && !isXhsUrl(changeInfo.url)) {
    dedicatedXhsTabId = null;
    dedicatedXhsWindowId = null;
    clearDedicatedTargetStorage();
  }
  if (tabId === preferredXhsTabId && changeInfo.url && !isXhsUrl(changeInfo.url)) {
    preferredXhsTabId = null;
    preferredXhsWindowId = null;
    return;
  }
  if ((tab.active || tabId === preferredXhsTabId) && isXhsUrl(changeInfo.url || tab?.url)) {
    preferredXhsTabId = tabId;
    preferredXhsWindowId = tab?.windowId ?? preferredXhsWindowId;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === dedicatedXhsTabId) {
    dedicatedXhsTabId = null;
    dedicatedXhsWindowId = null;
    clearDedicatedTargetStorage();
  }
  if (tabId === preferredXhsTabId) {
    preferredXhsTabId = null;
    preferredXhsWindowId = null;
  }
});

async function restoreDedicatedTargetFromStorage() {
  if (dedicatedXhsTabId) return;
  const stored = await chrome.storage.local.get(DEDICATED_STORAGE_KEY).catch(() => ({}));
  const target = stored?.[DEDICATED_STORAGE_KEY];
  const tabId = Number(target?.tabId || 0);
  const windowId = Number(target?.windowId || 0);
  if (!tabId) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.id && isXhsUrl(tab.url)) {
    dedicatedXhsTabId = tab.id;
    dedicatedXhsWindowId = tab.windowId ?? windowId ?? null;
    rememberXhsTab(tab);
    return;
  }
  await clearDedicatedTargetStorage();
}

function persistDedicatedTarget(tab) {
  chrome.storage.local.set({
    [DEDICATED_STORAGE_KEY]: {
      tabId: tab.id,
      windowId: tab.windowId ?? null,
      url: tab.url || "",
      updatedAt: Date.now(),
    },
  }).catch(() => {});
}

async function clearDedicatedTargetStorage() {
  await chrome.storage.local.remove(DEDICATED_STORAGE_KEY).catch(() => {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ───────────────────────── 启动 ─────────────────────────

connect();
