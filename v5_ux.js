
// v5_ux.js — SecureText UX Pack (SAFE, DOM-only)
// Adds: HUD, Toasts, Scroll-to-bottom + new message counter, message highlight,
// reply preview + jump-to-original, extra settings toggles, spam strict sanitizer.
// Does NOT change Firestore logic or admin logic.

(function(){
  const $ = (id) => document.getElementById(id);
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SETTINGS_KEY = "st_settings_v5";
  const DEFAULTS = {
    showHUD: true,
    showToasts: true,
    showScrollBtn: true,
    highlightNew: true,
    showOnline: true,
    spamStrict: "normal", // normal|strict
  };

  function getSettings(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      if(!raw) return { ...DEFAULTS };
      const p = JSON.parse(raw);
      return { ...DEFAULTS, ...(p||{}) };
    }catch{ return { ...DEFAULTS }; }
  }
  function setSettings(s){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }catch{} }

  // ---- Toasts ----
  function ensureToasts(){
    if($("stToastContainer")) return;
    const d = document.createElement("div");
    d.id = "stToastContainer";
    d.className = "st-toast-container";
    document.body.appendChild(d);
  }
  function toast(msg, kind="info"){
    const st = getSettings();
    if(!st.showToasts) return;
    ensureToasts();
    const c = $("stToastContainer"); if(!c) return;
    const el = document.createElement("div");
    el.className = `st-toast ${kind}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(()=>el.classList.add("out"), 2800);
    setTimeout(()=>{ try{el.remove();}catch{} }, 3150);
  }
  window.ST_TOAST = toast;

  // ---- HUD ----
  function ensureHUD(){
    const st = getSettings();
    const header = document.querySelector(".chat-header");
    if(!header) return;
    let hud = $("stHud");
    if(!st.showHUD){ if(hud) hud.remove(); return; }
    if(hud) return;

    hud = document.createElement("div");
    hud.id = "stHud";
    hud.className = "st-hud";
    hud.innerHTML = `
      <div class="hud-left">
        <div class="hud-badge"><span class="dot"></span><span class="txt">SecureText</span></div>
        <div class="hud-chip" id="stHudClock">--:--</div>
        <div class="hud-chip" id="stHudOnline">• 0 online</div>
      </div>
      <div class="hud-right">
        <div class="hud-chip hud-soft" id="stHudState">LIVE</div>
      </div>
    `;
    header.style.position="relative";
    header.appendChild(hud);

    const updateClock=()=>{
      const el=$("stHudClock"); if(!el) return;
      el.textContent = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    };
    updateClock();
    setInterval(updateClock, 30000);
  }

  function syncOnline(){
    const st=getSettings();
    const hud=$("stHudOnline");
    if(!hud || !st.showOnline) return;
    const badge=$("onlineBadge");
    if(badge) hud.textContent = badge.textContent || "• 0 online";
  }

  // ---- Scroll-to-bottom button ----
  let unseen=0;
  function ensureScrollBtn(){
    const st=getSettings();
    let btn=$("stScrollBtn");
    if(!st.showScrollBtn){ if(btn) btn.remove(); return null; }
    if(btn) return btn;

    btn=document.createElement("button");
    btn.id="stScrollBtn";
    btn.type="button";
    btn.className="st-scroll-btn hidden";
    btn.innerHTML = `<span class="arr">↓</span><span class="txt">New</span><span id="stUnseen" class="count">0</span>`;
    document.body.appendChild(btn);
    btn.onclick=()=>{
      const box=$("messages"); if(!box) return;
      box.scrollTop = box.scrollHeight;
      unseen=0;
      const c=$("stUnseen"); if(c) c.textContent="0";
      btn.classList.add("hidden");
    };
    return btn;
  }
  function nearBottom(el, t=160){ return (el.scrollHeight - el.scrollTop - el.clientHeight) < t; }

  function hookScroll(){
    const box=$("messages"); if(!box) return;
    const btn=ensureScrollBtn(); if(!btn) return;
    box.addEventListener("scroll", ()=>{
      if(nearBottom(box)){
        unseen=0;
        const c=$("stUnseen"); if(c) c.textContent="0";
        btn.classList.add("hidden");
      }
    }, {passive:true});
  }

  function hookNewMessages(){
    const box=$("messages"); if(!box) return;
    const btn=ensureScrollBtn();
    const mo=new MutationObserver((mut)=>{
      const b=$("messages"); if(!b) return;
      const isNear=nearBottom(b);
      for(const m of mut){
        for(const n of (m.addedNodes||[])){
          if(!(n instanceof HTMLElement)) continue;
          if(!n.classList.contains("msg")) continue;
          if(getSettings().highlightNew && !prefersReduced){
            n.classList.add("st-new-msg");
            setTimeout(()=>{ try{n.classList.remove("st-new-msg");}catch{} }, 1400);
          }
          if(!isNear){
            unseen++;
            if(btn){
              const c=$("stUnseen"); if(c) c.textContent=String(unseen);
              btn.classList.remove("hidden");
            }
          }
        }
      }
      if(isNear) b.scrollTop=b.scrollHeight;
    });
    mo.observe(box, {childList:true});
  }

  // ---- Reply preview + jump-to-original ----
  function ensureReplyPreview(panel, parentId){
    if(!panel || panel.classList.contains("hidden") || !parentId) return;
    let pv=panel.querySelector(".reply-preview");
    if(!pv){
      pv=document.createElement("div");
      pv.className="reply-preview";
      pv.innerHTML=`
        <div class="pv-top">
          <div class="pv-title">Replying to</div>
          <button type="button" class="pv-jump" id="stJumpToParent">Jump</button>
        </div>
        <div id="stParentSnippet" class="pv-snippet"></div>
      `;
      const header=panel.querySelector(".replies-header");
      if(header) header.insertAdjacentElement("afterend", pv);
    }
    const parentEl=document.getElementById("msg_"+parentId) || document.querySelector(`.msg[data-id="${parentId}"]`);
    const sn=$("stParentSnippet");
    if(sn && parentEl){
      const nm=parentEl.querySelector(".msg-top strong")?.textContent || "User";
      const tx=parentEl.querySelector(".msg-text")?.textContent || "";
      sn.textContent = `${nm}: ${tx}`;
    }
    const jump=$("stJumpToParent");
    if(jump){
      jump.onclick=()=>{
        const target=document.getElementById("msg_"+parentId);
        if(!target) return;
        target.scrollIntoView({behavior:"smooth", block:"center"});
        target.classList.add("st-jump-flash");
        setTimeout(()=>{ try{target.classList.remove("st-jump-flash");}catch{} }, 900);
      };
    }
  }

  function hookReplyClicks(){
    const box=$("messages"); if(!box) return;
    box.addEventListener("click",(e)=>{
      const t=e.target;
      if(!(t instanceof Element)) return;
      const btn=t.closest(".msg-btn.msg-reply");
      if(!btn) return;
      const msgEl=t.closest(".msg");
      const pid=msgEl?.dataset?.id;
      const panel=$("repliesPanel");
      if(panel && pid){
        panel.dataset.parentid=pid;
        setTimeout(()=>ensureReplyPreview(panel,pid),60);
        toast("↩ Reply mode","info");
      }
    });
  }

  // ---- Spam strict sanitizer (safe wrapper around existing send) ----
  function sanitizeText(raw){
    let t=String(raw??"");
    t=t.replace(/[\u200B-\u200D\uFEFF]/g,"");                 // invisibles
    t=t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,""); // control chars
    t=t.replace(/\s{3,}/g,"  ").trim();
    const st=getSettings();
    if(st.spamStrict==="strict"){
      t=t.replace(/(.)\1{8,}/g,"$1$1$1$1"); // compress extreme repeats
    }
    return t;
  }

  function hookSend(){
    const send=$("sendBtn");
    const inp=$("msgInput");
    if(!send || !inp) return;
    if(send.dataset.v5hook==="1") return;
    send.dataset.v5hook="1";
    const prev=send.onclick;
    send.onclick=async ()=>{
      inp.value = sanitizeText(inp.value);
      try{
        const r=prev && prev();
        if(r && typeof r.then==="function") await r;
      }catch{}
    };
  }

  // ---- Settings additions: inject extra toggles into existing settings modal if present ----
  // We keep your current settings UI; we only add a small "V5" section if the modal exists.
  function enhanceExistingSettingsModal(){
    const modal=document.getElementById("stSettingsOverlay");
    if(!modal) return;
    if(modal.querySelector("#stV5Settings")) return;

    const st=getSettings();
    const wrap=document.createElement("div");
    wrap.id="stV5Settings";
    wrap.innerHTML=`
      <div class="st-divider"></div>
      <div class="st-setting-name" style="margin-bottom:6px">V5</div>

      <div class="st-setting-row">
        <div><div class="st-setting-name">HUD</div><div class="st-setting-desc">Clock + online</div></div>
        <button id="v5HudBtn" class="st-pill-btn" type="button"></button>
      </div>
      <div class="st-setting-row">
        <div><div class="st-setting-name">Toasts</div><div class="st-setting-desc">Pop-up status</div></div>
        <button id="v5ToastBtn" class="st-pill-btn" type="button"></button>
      </div>
      <div class="st-setting-row">
        <div><div class="st-setting-name">Scroll button</div><div class="st-setting-desc">New msg counter</div></div>
        <button id="v5ScrollBtn" class="st-pill-btn" type="button"></button>
      </div>
      <div class="st-setting-row">
        <div><div class="st-setting-name">Highlight</div><div class="st-setting-desc">New message glow</div></div>
        <button id="v5HiBtn" class="st-pill-btn" type="button"></button>
      </div>
      <div class="st-setting-row">
        <div><div class="st-setting-name">Spam strictness</div><div class="st-setting-desc">Normal / Strict</div></div>
        <button id="v5SpamBtn" class="st-pill-btn" type="button"></button>
      </div>
    `;
    const body=modal.querySelector(".st-modal-body") || modal;
    body.appendChild(wrap);

    const render=()=>{
      const s=getSettings();
      const a=(id,txt)=>{ const el=$(id); if(el) el.textContent=txt; };
      a("v5HudBtn", s.showHUD ? "On" : "Off");
      a("v5ToastBtn", s.showToasts ? "On" : "Off");
      a("v5ScrollBtn", s.showScrollBtn ? "On" : "Off");
      a("v5HiBtn", s.highlightNew ? "On" : "Off");
      a("v5SpamBtn", s.spamStrict==="strict" ? "Strict" : "Normal");
    };
    render();

    const bind=(id,fn)=>{
      const el=$(id); if(!el) return;
      el.onclick=()=>{ const s=getSettings(); fn(s); setSettings(s); render(); applyLive(); };
    };
    bind("v5HudBtn", (s)=>s.showHUD=!s.showHUD);
    bind("v5ToastBtn", (s)=>s.showToasts=!s.showToasts);
    bind("v5ScrollBtn", (s)=>s.showScrollBtn=!s.showScrollBtn);
    bind("v5HiBtn", (s)=>s.highlightNew=!s.highlightNew);
    bind("v5SpamBtn", (s)=>s.spamStrict=(s.spamStrict==="strict"?"normal":"strict"));
  }

  function applyLive(){
    ensureHUD();
    syncOnline();
    ensureScrollBtn();
    const st=getSettings();
    const badge=$("onlineBadge");
    if(badge) badge.style.display = st.showOnline ? "" : "none";
  }

  // Watch for settings modal opening
  function watchSettingsModal(){
    const mo=new MutationObserver(()=>{ enhanceExistingSettingsModal(); });
    mo.observe(document.body, {childList:true, subtree:true});
  }

  // Boot when chat exists
  function bootWhenReady(){
    const chat=$("screen-chat");
    const msgs=$("messages");
    if(!chat || !msgs){
      setTimeout(bootWhenReady, 350);
      return;
    }
    ensureHUD();
    hookScroll();
    hookNewMessages();
    hookReplyClicks();
    hookSend();
    watchSettingsModal();
    setInterval(syncOnline, 1200);
  }

  function injectCssOnce(){
    if($("stV5Css")) return;
    const css=document.createElement("style");
    css.id="stV5Css";
    css.textContent=`
      .st-toast-container{position:fixed;bottom:18px;right:18px;display:flex;flex-direction:column;gap:10px;z-index:999999;pointer-events:none}
      .st-toast{padding:12px 14px;border-radius:12px;background:rgba(18,18,18,.86);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.92);backdrop-filter:blur(12px);box-shadow:0 20px 60px rgba(0,0,0,.55);transform:translateX(16px);opacity:0;animation:stToastIn .20s ease forwards;max-width:min(360px,86vw);font-weight:650}
      .st-toast.good{border-color:rgba(60,255,160,.22)} .st-toast.warn{border-color:rgba(255,211,107,.22)} .st-toast.info{border-color:rgba(80,140,255,.22)}
      .st-toast.out{animation:stToastOut .22s ease forwards}
      @keyframes stToastIn{to{transform:translateX(0);opacity:1}} @keyframes stToastOut{to{transform:translateX(16px);opacity:0}}

      .st-hud{position:absolute;top:10px;right:12px;display:flex;justify-content:space-between;gap:12px;align-items:center;pointer-events:none}
      .hud-left,.hud-right{display:flex;gap:10px;align-items:center}
      .hud-chip{padding:6px 10px;border-radius:999px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.86);font-size:12px;letter-spacing:.02em;backdrop-filter:blur(10px)}
      .hud-soft{opacity:.85}
      .hud-badge{display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(10px)}
      .hud-badge .dot{width:8px;height:8px;border-radius:50%;background:rgba(60,255,160,.92);box-shadow:0 0 18px rgba(60,255,160,.18);animation:stDotPulse 1.8s ease-in-out infinite}
      @keyframes stDotPulse{0%,100%{transform:scale(1);opacity:.75}50%{transform:scale(1.25);opacity:1}}
      .hud-badge .txt{font-weight:800;letter-spacing:.05em}

      .st-scroll-btn{position:fixed;right:18px;bottom:92px;z-index:999998;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.32);backdrop-filter:blur(12px);color:rgba(255,255,255,.92);cursor:pointer;box-shadow:0 20px 60px rgba(0,0,0,.55)}
      .st-scroll-btn.hidden{display:none}
      .st-scroll-btn .count{min-width:24px;height:20px;border-radius:999px;padding:0 8px;display:grid;place-items:center;font-size:12px;background:rgba(80,140,255,.22);border:1px solid rgba(80,140,255,.22)}
      .st-new-msg{animation:stNewMsg 1.4s ease}
      @keyframes stNewMsg{0%{box-shadow:0 0 0 rgba(0,0,0,0)}25%{box-shadow:0 0 22px rgba(80,140,255,.22)}100%{box-shadow:0 0 0 rgba(0,0,0,0)}}
      .st-jump-flash{animation:stJump .9s ease}
      @keyframes stJump{0%{box-shadow:0 0 0 rgba(0,0,0,0);transform:translateY(0)}40%{box-shadow:0 0 26px rgba(60,255,160,.20);transform:translateY(-1px)}100%{box-shadow:0 0 0 rgba(0,0,0,0);transform:translateY(0)}}

      .reply-preview{margin:10px 12px 0 12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.20)}
      .pv-top{display:flex;justify-content:space-between;align-items:center;gap:10px}
      .pv-title{font-weight:800;opacity:.9}
      .pv-snippet{margin-top:6px;opacity:.85;white-space:pre-wrap}
      .pv-jump{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;border-radius:10px;padding:6px 10px;cursor:pointer}
      .pv-jump:hover{border-color:rgba(60,255,160,.22);box-shadow:0 0 10px rgba(60,255,160,.10)}
    `;
    document.head.appendChild(css);
  }

  function boot(){
    injectCssOnce();
    bootWhenReady();
    // observe entering chat
    const root=$("root")||document.body;
    const mo=new MutationObserver(()=>{ 
      const chat=$("screen-chat");
      if(chat && chat.classList.contains("active")){ ensureHUD(); syncOnline(); }
    });
    mo.observe(root, {subtree:true, attributes:true, attributeFilter:["class"]});
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
})();
