// ui_premium_v2.js — SecureText Premium UI Layer (SAFE, NO Firebase touches)
// Fixes: black-screen canvas issue by never painting black over the page.
// Adds: HUD bar + toasts + ambient pulses + premium transitions.
// Performance: cursor glow disabled in chat; no continuous particle loop; bursts are short and transparent.

(function () {
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const $ = (id) => document.getElementById(id);

  function isChatActive() {
    const chat = $("screen-chat");
    return !!(chat && chat.classList.contains("active"));
  }

  // ----------------------------
  // BACKGROUND + OVERLAYS
  // ----------------------------
  function ensureBg() {
    if ($("premiumBg")) return;

    const wrap = document.createElement("div");
    wrap.id = "premiumBg";
    wrap.style.pointerEvents = "none";
    wrap.innerHTML = `
      <div class="bg-glow glow-1"></div>
      <div class="bg-glow glow-2"></div>
      <div class="bg-glow glow-3"></div>
      <div class="bg-noise"></div>
      <div class="bg-vignette"></div>
      <div id="cursorGlow"></div>
      <div id="ambientPulseLayer"></div>
    `;
    document.body.insertBefore(wrap, document.body.firstChild);

    const c = document.createElement("canvas");
    c.id = "fxBurstCanvas";
    c.className = "fx-burst-canvas";
    c.style.pointerEvents = "none";
    document.body.appendChild(c);

    const toast = document.createElement("div");
    toast.id = "toastContainer";
    toast.className = "toast-container";
    document.body.appendChild(toast);

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas, { passive: true });
  }

  function resizeCanvas() {
    const c = $("fxBurstCanvas");
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.floor(window.innerWidth * dpr);
    c.height = Math.floor(window.innerHeight * dpr);
    c.style.width = window.innerWidth + "px";
    c.style.height = window.innerHeight + "px";
    c.dataset.dpr = String(dpr);
  }

  // ----------------------------
  // CURSOR GLOW (ENTRY ONLY)
  // ----------------------------
  function enableCursorGlow() {
    const g = $("cursorGlow");
    if (!g) return;
    g.style.opacity = "1";
  }
  function disableCursorGlow() {
    const g = $("cursorGlow");
    if (!g) return;
    g.style.opacity = "0";
  }
  function updateGlowPos(e) {
    const g = $("cursorGlow");
    if (!g) return;
    g.style.left = e.clientX + "px";
    g.style.top = e.clientY + "px";
  }

  // ----------------------------
  // TOASTS
  // ----------------------------
  function toast(msg, kind = "info") {
    const cont = $("toastContainer");
    if (!cont) return;

    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = msg;
    cont.appendChild(el);

    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => { try { el.remove(); } catch {} }, 260);
    }, 3200);
  }

  // ----------------------------
  // AMBIENT PULSE (EVENT-ONLY)
  // ----------------------------
  function ambientPulse(color = "rgba(60,255,160,.22)") {
    if (prefersReduced) return;

    const layer = $("ambientPulseLayer");
    if (!layer) return;

    const inChat = isChatActive();
    const el = document.createElement("div");
    el.className = "ambient-pulse";
    el.style.background = `radial-gradient(circle, ${color}, transparent 60%)`;
    el.style.opacity = inChat ? "0.16" : "0.26";
    layer.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 900);
  }

  // ----------------------------
  // BURST PARTICLES (TRANSPARENT)
  // Never paints black. Clears fully each frame.
  // ----------------------------
  function burst(x, y, type) {
    if (prefersReduced) return;
    const c = $("fxBurstCanvas");
    if (!c) return;

    const inChat = isChatActive();
    const strength = inChat ? 0.55 : 1.0;

    const ctx = c.getContext("2d");
    const dpr = Number(c.dataset.dpr || "1");
    const cx = x * dpr;
    const cy = y * dpr;

    const colors = {
      send: "rgba(60,255,160,0.95)",
      receive: "rgba(80,140,255,0.95)",
      reply: "rgba(255,211,107,0.95)",
      approve: "rgba(120,255,200,0.95)",
      lock: "rgba(255,211,107,0.95)",
      deny: "rgba(255,90,90,0.95)",
    };
    const col = colors[type] || "rgba(255,255,255,0.85)";

    const count = Math.floor((inChat ? 16 : 26) * strength);
    const parts = Array.from({ length: count }).map(() => {
      const a = Math.random() * Math.PI * 2;
      const s = (Math.random() * 2.0 + 1.2) * (inChat ? 0.85 : 1.1) * strength;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(a) * s * dpr,
        vy: Math.sin(a) * s * dpr,
        life: Math.random() * 18 + 24,
        r: (Math.random() * 2 + 1.2) * dpr,
      };
    });

    let frame = 0;
    const max = 38;

    // Use a private frame loop that clears only the burst layer.
    function step() {
      frame++;
      ctx.clearRect(0, 0, c.width, c.height);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = inChat ? 0.55 : 0.65;
      ctx.fillStyle = col;

      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03 * dpr;
        p.vx *= 0.982;
        p.vy *= 0.982;
        p.life -= 1;

        if (p.life > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      if (frame < max) requestAnimationFrame(step);
      else ctx.clearRect(0, 0, c.width, c.height);
    }

    requestAnimationFrame(step);
  }

  // ----------------------------
  // HUD BAR (Chat only)
  // ----------------------------
  function ensureHud() {
    if ($("stHud")) return;
    const header = document.querySelector(".chat-header");
    if (!header) return;

    const hud = document.createElement("div");
    hud.id = "stHud";
    hud.className = "st-hud";
    hud.innerHTML = `
      <div class="hud-left">
        <div class="hud-badge"><span class="dot"></span><span class="txt">SecureText</span></div>
        <div class="hud-chip" id="hudClock">--:--</div>
        <div class="hud-chip" id="hudOnline">• 0 online</div>
      </div>
      <div class="hud-right">
        <div class="hud-chip hud-soft" id="hudState">LIVE</div>
      </div>
    `;
    header.style.position = "relative";
    header.appendChild(hud);

    function updateClock() {
      const el = $("hudClock");
      if (!el) return;
      const now = new Date();
      el.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    updateClock();
    setInterval(updateClock, 30000);
  }

  // Sync HUD online count with existing onlineBadge if present
  function syncHudOnline() {
    const hud = $("hudOnline");
    const badge = $("onlineBadge");
    if (!hud || !badge) return;
    hud.textContent = badge.textContent || "• 0 online";
  }

  // ----------------------------
  // OBSERVERS / HOOKS
  // ----------------------------
  function observeScreenChanges() {
    const root = $("root") || document.body;
    const mo = new MutationObserver(() => {
      if (isChatActive()) {
        disableCursorGlow();
        ensureHud();
        syncHudOnline();
      } else {
        if (!isTouch && !prefersReduced) enableCursorGlow();
      }
    });
    mo.observe(root, { subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  }

  function hookEvents() {
    // Click events (send / logout / settings / rules)
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      if (t.id === "sendBtn") {
        const r = t.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, "send");
        ambientPulse("rgba(60,255,160,.22)");
      }
      if (t.id === "sendReplyBtn") {
        const r = t.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, "reply");
        ambientPulse("rgba(255,211,107,.18)");
      }
      if (t.id === "rulesContinue") {
        burst(window.innerWidth * 0.50, window.innerHeight * 0.46, "approve");
        ambientPulse("rgba(120,255,200,.22)");
        toast("✅ Rules accepted", "good");
      }
      if (t.id === "logoutBtn") {
        toast("👋 Logged out", "info");
      }
      if (t.id === "settingsBtn") {
        toast("⚙️ Settings", "info");
      }
    });

    // Message receive burst (watch #messages for additions)
    const messages = $("messages");
    if (messages) {
      let last = 0;
      const mo = new MutationObserver((mut) => {
        const now = Date.now();
        if (now - last < 250) return;
        for (const m of mut) {
          if (m.addedNodes && m.addedNodes.length) {
            last = now;
            burst(window.innerWidth * 0.72, window.innerHeight * 0.62, "receive");
            ambientPulse("rgba(80,140,255,.18)");
            // don't toast every message (spam) — only when tab is hidden would be nice, but keep minimal
            break;
          }
        }
      });
      mo.observe(messages, { childList: true });
    }

    // Lock overlay state (if your app creates stLockOverlay)
    const lock = $("stLockOverlay");
    if (lock) {
      const mo = new MutationObserver(() => {
        const active = lock.classList.contains("active");
        if (active) {
          toast("🔒 Chat locked", "warn");
          ambientPulse("rgba(255,211,107,.20)");
        } else {
          toast("🔓 Chat unlocked", "good");
          ambientPulse("rgba(60,255,160,.18)");
        }
      });
      mo.observe(lock, { attributes: true, attributeFilter: ["class"] });
    }
  }

  function hookCursor() {
    if (isTouch || prefersReduced) {
      disableCursorGlow();
      return;
    }

    window.addEventListener("mousemove", (e) => {
      if (isChatActive()) return;
      enableCursorGlow();
      updateGlowPos(e);
    }, { passive: true });
  }

  // Keep HUD online synced periodically (cheap)
  function startHudSyncLoop() {
    setInterval(() => {
      if (!isChatActive()) return;
      syncHudOnline();
    }, 1200);
  }

  // ----------------------------
  // BOOT
  // ----------------------------
  function boot() {
    ensureBg();
    hookCursor();
    observeScreenChanges();
    hookEvents();
    startHudSyncLoop();

    // Initial state
    if (isChatActive()) disableCursorGlow();
    else enableCursorGlow();

    // Expose helpers (optional)
    window.ST_UIX = { toast, burst, ambientPulse };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
