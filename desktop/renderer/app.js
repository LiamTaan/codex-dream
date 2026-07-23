const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const sessionLabels = {
  active: "运行中",
  applying: "应用中",
  paused: "已暂停",
  off: "未启动",
  stale: "需要重启",
  unknown: "状态异常",
  "not-installed": "未安装",
};

const optionLabels = {
  appearance: { auto: "跟随 Codex", light: "浅色", dark: "深色" },
  safeArea: { auto: "自动", left: "左侧", right: "右侧", center: "居中", none: "无" },
  taskMode: { auto: "自动", ambient: "弱化背景", banner: "顶部横幅", off: "任务页关闭" },
};

let latestStatus;
let themes = [];
let selectedTheme;
let activeFilter = "all";
let activeGroup = "all";
let searchTerm = "";
let studioImage;
let toastTimer;
let noticeTimer;
let refreshTimer;
let busy = false;
let latestError;
let themeLibrarySignature = "";
let groupOptionsSignature = "";

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

function showToast(message) {
  dismissError();
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 3200);
}

function dismissError() {
  clearTimeout(noticeTimer);
  noticeTimer = undefined;
  $("#notice").hidden = true;
}

function showError(error) {
  latestError = error.details || { title: "操作未完成", message: error.message, detail: error.stack || error.message };
  $("#notice-title").textContent = latestError.title;
  $("#notice-message").textContent = latestError.message;
  $("#notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(dismissError, 12000);
  $("#error-title").textContent = latestError.title;
  $("#error-message").textContent = latestError.message;
  $("#error-detail").textContent = latestError.detail || "没有更多诊断信息。";
  $("#error-dialog").showModal();
}

function setBusy(value) {
  busy = value;
  document.body.classList.toggle("busy", value);
  $$('[data-action], [data-refresh], [data-refresh-diagnostics], #apply-selected-theme, #edit-selected-theme, #delete-selected-theme, #save-theme-metadata, #pick-studio-image, #replace-studio-image, #create-theme, #reinstall-runtime, #open-state, #open-logs')
    .forEach((button) => { button.disabled = value || button.dataset.requiresRuntime === "true" && !latestStatus?.available; });
}

function statusIcon(status) {
  if (status === "ok") return "circle-check";
  if (status === "warning") return "triangle-alert";
  if (status === "error") return "circle-x";
  return "loader-circle";
}

function setStatusIndicator(element, status) {
  element.className = `status-indicator ${status}`;
  element.innerHTML = `<i data-lucide="${statusIcon(status)}"></i>`;
}

function currentTheme() {
  const runtimeId = latestStatus?.appliedThemeId || latestStatus?.activeThemeId || latestStatus?.themeId;
  if (runtimeId) {
    const byRuntimeId = themes.find((theme) => theme.runtimeId === runtimeId);
    if (byRuntimeId) return byRuntimeId;
  }
  const name = latestStatus?.activeThemeName || latestStatus?.appliedThemeName || latestStatus?.themeName;
  return themes.find((theme) => theme.name === name);
}

function renderStatus(status) {
  latestStatus = status;
  const ready = Boolean(status.available);
  const partial = Boolean(status.runtimeFilesPresent);
  const upgradeRequired = Boolean(status.upgradeRequired);
  const session = status.session || (status.running ? "active" : "off");
  const theme = currentTheme();
  const themeName = status.activeThemeName || status.appliedThemeName || status.themeName || "未选择主题";
  const isPaused = status.paused || session === "paused";
  const health = ready ? "ok" : partial ? "warning" : "error";

  setStatusIndicator($("#sidebar-status-icon"), health);
  $("#sidebar-status").textContent = ready ? "运行时就绪" : upgradeRequired ? "需要更新" : partial ? "安装未完成" : "需要安装";
  $("#sidebar-platform").textContent = status.platform || "未检测平台";

  $("#overview-banner").className = `status-banner ${health}`;
  setStatusIndicator($("#overview-status-icon"), health);
  $("#overview-status-title").textContent = ready ? "Codex Dream Skin 已就绪" : upgradeRequired ? "检测到旧运行时" : partial ? "运行时安装尚未完成" : "首次使用需要安装运行时";
  $("#overview-status-message").textContent = status.message || status.error?.message || "重新检查后获取当前状态。";
  $("#overview-platform").textContent = status.platform || "—";

  $("#codex-value").textContent = status.codexInstalled === false ? "未安装" : status.codexRunning ? "正在运行" : "已关闭";
  $("#codex-detail").textContent = status.codexVersion ? `Codex ${status.codexVersion} · 动态检测` : "版本动态检测";
  $("#session-value").textContent = sessionLabels[session] || session;
  $("#port-value").textContent = status.port ? `127.0.0.1:${status.port}` : `${status.platform === "Windows" ? 9335 : 9341}（平台默认）`;
  $("#runtime-version").textContent = status.runtimeVersion && status.runtimeVersion !== "unknown" ? `运行时 v${status.runtimeVersion} · 动态读取` : "运行时版本待检测";

  const primary = $(".command-panel .primary-button[data-action]");
  primary.dataset.action = ready ? "start" : "install";
  primary.querySelector("strong").textContent = ready ? "应用皮肤" : upgradeRequired ? "更新运行时" : partial ? "继续安装" : "安装运行时";
  primary.querySelector("small").textContent = ready ? "启动或刷新当前主题" : "准备当前平台所需组件";
  primary.querySelector("svg")?.remove();
  primary.insertAdjacentHTML("afterbegin", `<i data-lucide="${ready ? "play" : "download"}"></i>`);
  $("[data-action='pause'] strong").textContent = isPaused ? "继续显示" : "暂停显示";

  const preview = $("#current-theme-preview");
  const image = $("#current-theme-image");
  const empty = $("#current-theme-empty");
  if (theme?.image) {
    preview.classList.remove("empty");
    image.src = theme.image;
    image.hidden = false;
    empty.hidden = true;
    $("#current-theme-name").textContent = theme.name;
    $("#current-theme-source").textContent = theme.source === "custom" ? "我的主题 · theme.json" : "内置主题 · theme.json";
    $("#current-theme-state").innerHTML = `<i data-lucide="${isPaused ? "pause-circle" : "circle-check"}"></i>${isPaused ? "已暂停" : "已启用"}`;
  } else {
    preview.classList.add("empty");
    image.hidden = true;
    empty.hidden = false;
    $("#current-theme-name").textContent = themeName;
    $("#current-theme-source").textContent = ready ? "未匹配到活动主题预览" : "等待运行时检测";
    $("#current-theme-state").innerHTML = `<i data-lucide="circle-dashed"></i>${ready ? "未应用" : "未检测"}`;
  }

  $("#pick-studio-image").disabled = !ready || busy;
  $("#replace-studio-image").disabled = !ready || busy;
  $("#pick-studio-image").dataset.requiresRuntime = "true";
  $("#replace-studio-image").dataset.requiresRuntime = "true";
  $("#pick-studio-image").innerHTML = `<i data-lucide="${ready ? "folder-open" : "lock"}"></i>${ready ? "选择背景图" : "安装运行时后选择"}`;

  renderThemeLibrary();
  renderSelectedTheme();
  refreshIcons();
}

function visibleThemes() {
  return themes.filter((theme) => {
    const filterMatches = activeFilter === "all" || theme.source === activeFilter;
    const groupMatches = activeGroup === "all" || theme.group === activeGroup;
    const searchMatches = !searchTerm || theme.name.toLocaleLowerCase().includes(searchTerm) || theme.description.toLocaleLowerCase().includes(searchTerm) || theme.group.toLocaleLowerCase().includes(searchTerm);
    return filterMatches && groupMatches && searchMatches;
  });
}

function renderGroupOptions() {
  const groups = [...new Set(themes.map((theme) => theme.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (activeGroup !== "all" && !groups.includes(activeGroup)) activeGroup = "all";
  const signature = JSON.stringify({ groups, activeGroup });
  if (signature === groupOptionsSignature) return;
  groupOptionsSignature = signature;
  $("#theme-group-filter").innerHTML = `<option value="all">全部分组</option>${groups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join("")}`;
  $("#theme-group-filter").value = activeGroup;
  const customGroups = groups.filter((group) => group !== "内置主题" && group !== "未分组");
  $("#theme-group-options").innerHTML = customGroups.map((group) => `<option value="${escapeHtml(group)}"></option>`).join("");
}

function renderThemeLibrary() {
  const visible = visibleThemes();
  const active = currentTheme();
  const signature = JSON.stringify({
    filter: activeFilter,
    group: activeGroup,
    search: searchTerm,
    active: active ? `${active.source}:${active.id}` : "",
    selected: selectedTheme ? `${selectedTheme.source}:${selectedTheme.id}` : "",
    themes: visible.map((theme) => [theme.id, theme.source, theme.name, theme.group, theme.image]),
  });
  if (signature === themeLibrarySignature) return;
  themeLibrarySignature = signature;
  $("#theme-count").textContent = `${visible.length} 套主题`;
  if (!visible.length) {
    $("#theme-grid").innerHTML = '<div class="empty-state"><i data-lucide="search-x"></i><strong>没有匹配的主题</strong><span>调整筛选条件，或前往主题工作室创建一套。</span></div>';
    refreshIcons();
    return;
  }
  const grouped = new Map();
  for (const theme of visible) {
    if (!grouped.has(theme.group)) grouped.set(theme.group, []);
    grouped.get(theme.group).push(theme);
  }
  $("#theme-grid").innerHTML = [...grouped.entries()].map(([group, items]) => `<section class="theme-group-section" aria-label="${escapeHtml(group)}">
    <div class="theme-group-heading"><span><i data-lucide="folder"></i><strong>${escapeHtml(group)}</strong></span><small>${items.length} 套</small></div>
    <div class="theme-group-grid">${items.map((theme) => {
      const isActive = active && active.id === theme.id && active.source === theme.source;
      const isSelected = selectedTheme && selectedTheme.id === theme.id && selectedTheme.source === theme.source;
      return `<button class="theme-card${isActive ? " active" : ""}${isSelected ? " selected" : ""}" type="button" data-theme-id="${escapeHtml(theme.id)}" data-theme-source="${escapeHtml(theme.source)}">
        <span class="theme-preview">${theme.image ? `<img src="${escapeHtml(theme.image)}" alt="" loading="lazy" decoding="async" />` : '<span class="theme-preview-placeholder"><i data-lucide="image-off"></i></span>'}${isActive ? '<span class="theme-badge"><i data-lucide="circle-check"></i>已启用</span>' : ""}</span>
        <span class="theme-meta"><strong>${escapeHtml(theme.name)}</strong><span><i data-lucide="${theme.source === "custom" ? "folder" : "package"}"></i>${escapeHtml(theme.group)}</span></span>
      </button>`;
    }).join("")}</div></section>`).join("");
  $$("[data-theme-id]").forEach((card) => card.addEventListener("click", () => selectTheme(card.dataset.themeId, card.dataset.themeSource)));
  refreshIcons();
}

function selectTheme(id, source) {
  selectedTheme = themes.find((theme) => theme.id === id && theme.source === source);
  renderThemeLibrary();
  renderSelectedTheme();
}

function renderSelectedTheme() {
  const panel = $("#theme-details");
  if (!selectedTheme) {
    panel.classList.add("empty");
    $("#detail-empty").hidden = false;
    $("#detail-content").hidden = true;
    return;
  }
  const active = currentTheme();
  const isActive = active && active.id === selectedTheme.id && active.source === selectedTheme.source;
  panel.classList.remove("empty");
  $("#detail-empty").hidden = true;
  $("#detail-content").hidden = false;
  $("#detail-image").src = selectedTheme.image || "";
  $("#detail-image").alt = `${selectedTheme.name} 主题预览`;
  $("#detail-state").innerHTML = `<i data-lucide="${isActive ? "circle-check" : "circle-dashed"}"></i>${isActive ? "已启用" : "可应用"}`;
  $("#theme-detail-title").textContent = selectedTheme.name;
  $("#detail-description").textContent = selectedTheme.description;
  $("#detail-source").textContent = selectedTheme.source === "custom" ? "我的主题" : "内置主题";
  $("#detail-group").textContent = selectedTheme.group;
  $("#detail-appearance").textContent = optionLabels.appearance[selectedTheme.appearance] || selectedTheme.appearance;
  $("#detail-safe-area").textContent = optionLabels.safeArea[selectedTheme.safeArea] || selectedTheme.safeArea;
  $("#detail-task-mode").textContent = optionLabels.taskMode[selectedTheme.taskMode] || selectedTheme.taskMode;
  $("#apply-selected-theme").disabled = isActive || !latestStatus?.available || busy;
  $("#apply-selected-theme").innerHTML = `<i data-lucide="${isActive ? "circle-check" : "check"}"></i>${isActive ? "当前正在使用" : "应用这套主题"}`;
  $("#delete-selected-theme").hidden = selectedTheme.source !== "custom";
  $("#edit-selected-theme").hidden = selectedTheme.source !== "custom";
  $("#edit-selected-theme").disabled = busy;
  $("#delete-selected-theme").disabled = busy;
  refreshIcons();
}

function switchView(name) {
  $$("[data-view]").forEach((view) => {
    const active = view.dataset.view === name;
    view.hidden = !active;
    view.classList.toggle("active", active);
  });
  $$("[data-view-target]").forEach((item) => {
    const active = item.dataset.viewTarget === name;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
  });
  $(".main-content").scrollTop = 0;
  if (name === "diagnostics") refreshDiagnostics();
}

async function refresh({ quiet = false } = {}) {
  try {
    const [status, nextThemes] = await Promise.all([window.dreamSkin.getStatus(), window.dreamSkin.getThemes()]);
    themes = nextThemes;
    renderGroupOptions();
    if (selectedTheme) selectedTheme = themes.find((theme) => theme.id === selectedTheme.id && theme.source === selectedTheme.source);
    renderStatus(status);
    $("#last-updated").textContent = `更新于 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    renderStatus({ available: false, platform: "—", message: error.message, session: "unknown" });
    if (!quiet) showError(error);
  }
}

function delayedRefresh() {
  return new Promise((resolve) => setTimeout(() => refresh({ quiet: true }).finally(resolve), 900));
}

async function perform(actionName) {
  setBusy(true);
  try {
    const result = await window.dreamSkin.performAction(actionName);
    if (result?.canceled) return;
    dismissError();
    showToast(actionName === "install" ? "运行时安装完成" : actionName === "restore" ? "已恢复官方外观" : "操作已完成");
    await delayedRefresh();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
    renderStatus(latestStatus || {});
  }
}

async function applySelectedTheme() {
  if (!selectedTheme) return;
  setBusy(true);
  try {
    await window.dreamSkin.applyTheme(selectedTheme.id, selectedTheme.source);
    showToast("主题已应用");
    await delayedRefresh();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
    renderStatus(latestStatus || {});
  }
}

async function deleteSelectedTheme() {
  if (!selectedTheme || selectedTheme.source !== "custom") return;
  setBusy(true);
  try {
    const result = await window.dreamSkin.deleteTheme(selectedTheme.id, selectedTheme.source);
    if (result?.canceled) return;
    selectedTheme = null;
    showToast("主题已删除");
    await refresh({ quiet: true });
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
    renderSelectedTheme();
  }
}

function openThemeEditor() {
  if (!selectedTheme || selectedTheme.source !== "custom") return;
  $("#edit-theme-name").value = selectedTheme.name;
  $("#edit-theme-group").value = selectedTheme.group === "未分组" ? "" : selectedTheme.group;
  $("#edit-theme-dialog").showModal();
}

async function saveThemeMetadata() {
  if (!selectedTheme || selectedTheme.source !== "custom") return;
  const selectedId = selectedTheme.id;
  const selectedSource = selectedTheme.source;
  setBusy(true);
  try {
    await window.dreamSkin.updateThemeMetadata(selectedId, selectedSource, {
      name: $("#edit-theme-name").value,
      group: $("#edit-theme-group").value,
    });
    $("#edit-theme-dialog").close();
    showToast("主题名称与分组已更新");
    await refresh({ quiet: true });
    selectedTheme = themes.find((theme) => theme.id === selectedId && theme.source === selectedSource);
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
    renderThemeLibrary();
    renderSelectedTheme();
  }
}

function setStudioEnabled(enabled) {
  ["#theme-name", "#theme-group", "#theme-appearance", "#theme-safe-area", "#theme-task-mode", "#create-theme", ".focus-fields"]
    .forEach((selector) => { $(selector).disabled = !enabled || busy; });
}

function updateFocusPosition(x, y) {
  const focusX = Math.max(0, Math.min(1, Number(x)));
  const focusY = Math.max(0, Math.min(1, Number(y)));
  $("#theme-focus-x").value = focusX;
  $("#theme-focus-y").value = focusY;
  $("#focus-x-value").value = `${Math.round(focusX * 100)}%`;
  $("#focus-y-value").value = `${Math.round(focusY * 100)}%`;
  $("#focus-x-value").textContent = `${Math.round(focusX * 100)}%`;
  $("#focus-y-value").textContent = `${Math.round(focusY * 100)}%`;
  $("#focus-marker").style.left = `${focusX * 100}%`;
  $("#focus-marker").style.top = `${focusY * 100}%`;
  $("#studio-image").style.objectPosition = `${focusX * 100}% ${focusY * 100}%`;
}

function markStudioDirty() {
  if (!studioImage) return;
  $("#studio-save-state").className = "save-state dirty";
  $("#studio-save-state").innerHTML = '<i data-lucide="circle-dot"></i>有未保存修改';
  refreshIcons();
}

function updateStudioGuides() {
  const visible = Boolean(studioImage && $("#guides-toggle").checked);
  const safeArea = $("#theme-safe-area").value;
  $("#safe-area-overlay").hidden = !visible || safeArea === "none";
  $("#safe-area-overlay").dataset.position = safeArea === "auto" ? "left" : safeArea;
}

async function pickStudioImage() {
  setBusy(true);
  try {
    const result = await window.dreamSkin.pickThemeImage();
    if (result.canceled) return;
    studioImage = result;
    $("#studio-image").src = result.imageUrl;
    $("#theme-name").value = result.suggestedName || "";
    updateFocusPosition(0.5, 0.5);
    $("#studio-empty").hidden = true;
    $("#studio-preview").hidden = false;
    $("#canvas-toolbar").hidden = false;
    setStudioEnabled(true);
    updateStudioGuides();
    markStudioDirty();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
    setStudioEnabled(Boolean(studioImage));
  }
}

async function createStudioTheme() {
  if (!studioImage) return;
  setBusy(true);
  $("#studio-save-state").className = "save-state";
  $("#studio-save-state").innerHTML = '<i data-lucide="loader-circle"></i>正在创建主题';
  refreshIcons();
  try {
    await window.dreamSkin.createImageTheme(studioImage.imagePath, {
      name: $("#theme-name").value,
      group: $("#theme-group").value,
      appearance: $("#theme-appearance").value,
      safeArea: $("#theme-safe-area").value,
      taskMode: $("#theme-task-mode").value,
      focusX: Number($("#theme-focus-x").value),
      focusY: Number($("#theme-focus-y").value),
    });
    $("#studio-save-state").className = "save-state saved";
    $("#studio-save-state").innerHTML = '<i data-lucide="circle-check"></i>主题已创建并应用';
    studioImage = null;
    showToast("主题已创建并应用");
    await delayedRefresh();
  } catch (error) {
    $("#studio-save-state").className = "save-state danger-text";
    $("#studio-save-state").innerHTML = '<i data-lucide="circle-x"></i>创建失败，请重试';
    showError(error);
  } finally {
    setBusy(false);
    setStudioEnabled(Boolean(studioImage));
    refreshIcons();
  }
}

async function refreshDiagnostics() {
  if (busy) return;
  $("#diagnostic-results").innerHTML = '<div class="diagnostic-loading"><i data-lucide="loader-circle"></i>正在读取本机状态…</div>';
  $("#diagnostic-summary").className = "diagnostic-summary pending";
  setStatusIndicator($("#diagnostic-summary-icon"), "pending");
  $("#diagnostic-summary-title").textContent = "正在检查";
  $("#diagnostic-summary-message").textContent = "读取真实配置、进程和主题文件。";
  refreshIcons();
  try {
    const result = await window.dreamSkin.getDiagnostics();
    const failures = result.checks.filter((check) => check.status === "error").length;
    const warnings = result.checks.filter((check) => check.status === "warning" || check.status === "pending").length;
    const summaryStatus = failures ? "error" : warnings ? "warning" : "ok";
    $("#diagnostic-summary").className = `diagnostic-summary ${summaryStatus}`;
    setStatusIndicator($("#diagnostic-summary-icon"), summaryStatus);
    $("#diagnostic-summary-title").textContent = failures ? `${failures} 项需要处理` : warnings ? `${warnings} 项等待完成` : "全部检查通过";
    $("#diagnostic-summary-message").textContent = failures ? "按检查项建议处理后重新检查。" : warnings ? "部分结果需要安装或启动运行时后确认。" : "Codex Dream Skin 当前可以正常工作。";
    $("#diagnostic-time").textContent = new Date(result.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    $("#diagnostic-results").innerHTML = result.checks.map((check) => `<div class="diagnostic-row" role="row">
      <div class="diagnostic-name" role="cell"><span class="status-indicator ${escapeHtml(check.status)}"><i data-lucide="${statusIcon(check.status)}"></i></span><strong>${escapeHtml(check.title)}</strong></div>
      <div class="diagnostic-value" role="cell">${escapeHtml(check.value)}</div>
      <div class="diagnostic-result" role="cell"><strong>${check.status === "ok" ? "检查通过" : check.status === "error" ? "需要处理" : check.status === "warning" ? "需要确认" : "等待检测"}</strong><p>${escapeHtml(check.detail)}</p></div>
    </div>`).join("");
    refreshIcons();
  } catch (error) {
    $("#diagnostic-results").innerHTML = '<div class="diagnostic-loading">诊断读取失败，请使用“重新检查”重试。</div>';
    showError(error);
  }
}

async function loadAppInfo() {
  try {
    const info = await window.dreamSkin.getAppInfo();
    $("#app-version").textContent = `v${info.version}`;
    $("#build-channel").textContent = info.development ? "开发版" : "正式版";
  } catch {
    $("#app-version").textContent = "版本待检测";
  }
}

$$('[data-view-target]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewTarget)));
$$('[data-go-view]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.goView)));
$$('[data-action]').forEach((button) => button.addEventListener("click", () => perform(button.dataset.action)));
$$('[data-refresh]').forEach((button) => button.addEventListener("click", () => refresh()));
$$('[data-refresh-diagnostics]').forEach((button) => button.addEventListener("click", refreshDiagnostics));
$$('[data-filter]').forEach((segment) => segment.addEventListener("click", () => {
  activeFilter = segment.dataset.filter;
  $$('[data-filter]').forEach((item) => {
    const active = item === segment;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  renderThemeLibrary();
}));
$("#theme-search").addEventListener("input", (event) => { searchTerm = event.target.value.trim().toLocaleLowerCase(); renderThemeLibrary(); });
$("#theme-group-filter").addEventListener("change", (event) => { activeGroup = event.target.value; renderThemeLibrary(); });
$("#apply-selected-theme").addEventListener("click", applySelectedTheme);
$("#edit-selected-theme").addEventListener("click", openThemeEditor);
$("#delete-selected-theme").addEventListener("click", deleteSelectedTheme);
$("#save-theme-metadata").addEventListener("click", saveThemeMetadata);
$("#pick-studio-image").addEventListener("click", pickStudioImage);
$("#replace-studio-image").addEventListener("click", pickStudioImage);
$("#create-theme").addEventListener("click", createStudioTheme);
$("#guides-toggle").addEventListener("change", updateStudioGuides);
$("#theme-safe-area").addEventListener("change", () => { updateStudioGuides(); markStudioDirty(); });
$("#theme-name").addEventListener("input", markStudioDirty);
$("#theme-group").addEventListener("input", markStudioDirty);
$("#theme-appearance").addEventListener("change", markStudioDirty);
$("#theme-task-mode").addEventListener("change", markStudioDirty);
$("#theme-focus-x").addEventListener("input", (event) => { updateFocusPosition(event.target.value, $("#theme-focus-y").value); markStudioDirty(); });
$("#theme-focus-y").addEventListener("input", (event) => { updateFocusPosition($("#theme-focus-x").value, event.target.value); markStudioDirty(); });
$("#studio-preview").addEventListener("pointerdown", (event) => {
  if (!studioImage || event.target.closest(".preview-chrome")) return;
  const rect = event.currentTarget.getBoundingClientRect();
  updateFocusPosition((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  markStudioDirty();
});
$("#reinstall-runtime").addEventListener("click", () => perform("install"));
$("#open-state").addEventListener("click", async () => { try { await window.dreamSkin.openState(); } catch (error) { showError(error); } });
$("#open-logs").addEventListener("click", async () => { try { await window.dreamSkin.openLogs(); } catch (error) { showError(error); } });
$("#notice-details").addEventListener("click", () => {
  if (!latestError) return;
  clearTimeout(noticeTimer);
  if (!$("#error-dialog").open) $("#error-dialog").showModal();
});
$("#notice-close").addEventListener("click", dismissError);
$("#error-dialog").addEventListener("close", dismissError);

refreshIcons();
loadAppInfo();
refresh();
refreshTimer = setInterval(() => { if (!busy && !document.hidden) refresh({ quiet: true }); }, 15000);
window.addEventListener("beforeunload", () => clearInterval(refreshTimer));
