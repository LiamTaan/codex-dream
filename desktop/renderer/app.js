const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let toastTimer;
function toast(message, isError = false) { const element=$("#toast"); element.textContent=message; element.style.borderColor=isError?"var(--danger)":"var(--accent)"; element.classList.add("visible"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>element.classList.remove("visible"),3600); }
function setBusy(busy) { $$('button').forEach((button)=>{ button.disabled=busy; }); }
function renderStatus(status) {
  const dot=$("#status-dot"); dot.classList.toggle("ready",Boolean(status.available)); dot.classList.toggle("error",status.available===false);
  $("#platform-label").textContent=status.platform||"—"; $("#status-label").textContent=status.available?"运行时已就绪":"需要安装或检查运行时";
  $("#status-message").textContent=status.message||"桌面面板会调用当前平台的官方换肤运行时，不修改 Codex 安装文件。";
  if (status.activeThemeName||status.appliedThemeName||status.theme) $("#active-theme").textContent=status.activeThemeName||status.appliedThemeName||status.theme;
  const pauseButton=document.querySelector('[data-action="pause"]'); const customizeButton=document.querySelector('[data-action="customize"] strong');
  const isPaused=status.paused||status.session==="paused";
  if (status.platform==="Windows") { pauseButton.textContent=isPaused?"继续显示":"暂停显示"; customizeButton.textContent="导入一张背景图"; }
  else { pauseButton.textContent=isPaused?"继续显示":"暂停显示"; customizeButton.textContent="导入一张背景图"; }
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[character])); }
function renderPresets(presets) { const grid=$("#theme-grid"); $("#theme-count").textContent=`${presets.length} 套可用主题`; if(!presets.length){grid.innerHTML='<div class="theme-card"><figcaption><strong>暂无内置主题</strong><span>可以从上方导入自己的背景图。</span></figcaption></div>';return;} grid.innerHTML=presets.map((preset)=>`<figure class="theme-card" data-theme-id="${escapeHtml(preset.id)}" title="${escapeHtml(preset.name)}">${preset.image?`<img src="${preset.image}" alt="" />`:""}<figcaption><strong>${escapeHtml(preset.name)}</strong><span>${escapeHtml(preset.category)}</span></figcaption></figure>`).join(""); grid.querySelectorAll("[data-theme-id]").forEach((card)=>card.addEventListener("click",async()=>{setBusy(true);try{await window.dreamSkin.applyPreset(card.dataset.themeId);toast("主题已应用");setTimeout(refresh,1200);}catch(error){toast(error.message,true);}finally{setBusy(false);}})); }
async function refresh(){ try { const [status,presets]=await Promise.all([window.dreamSkin.getStatus(),window.dreamSkin.getPresets()]); renderStatus(status); renderPresets(presets); $("#last-updated").textContent=`更新于 ${new Date().toLocaleTimeString()}`; } catch(error){ renderStatus({available:false,platform:"—",message:error.message}); toast(error.message,true); } }
async function action(actionName){ setBusy(true); try { if(actionName==="customize") await window.dreamSkin.chooseImage(); else await window.dreamSkin.performAction(actionName); toast(actionName==="restore"?"已请求恢复官方外观":"操作已发送"); setTimeout(refresh,1200); } catch(error){ toast(error.message,true); } finally { setBusy(false); } }
$$('[data-action]').forEach((button)=>button.addEventListener("click",()=>action(button.dataset.action)));
$("#refresh").addEventListener("click",refresh);
$("#open-state").addEventListener("click",async()=>{try{await window.dreamSkin.openState();}catch(error){toast(error.message,true);}});
refresh();
