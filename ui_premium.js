// ui_premium.js — SecureText Premium UI Layer (SAFE)
// - Big premium animated background + cursor glow on entry screens only
// - Cinematic transitions between screens
// - Lightweight "burst" particles on send/receive/reply events (NO continuous particles)
// - Auto-disables heavy effects in chat to prevent lag

(function () {
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const $ = (id) => document.getElementById(id);

  function ensureBg() {
    if ($("premiumBg")) return;

    const wrap = document.createElement("div");
    wrap.id = "premiumBg";
    wrap.innerHTML = `
      <div class="bg-glow glow-1"></div>
      <div class="bg-glow glow-2"></div>
      <div class="bg-glow glow-3"></div>
      <div class="bg-noise"></div>
      <div class="bg-vignette"></div>
      <div id="cursorGlow"></div>
    `;
    document.body.insertBefore(wrap, document.body.firstChild);

    const c = document.createElement("canvas");
    c.id = "fxBurstCanvas";
    c.className = "fx-burst-canvas";
    document.body.appendChild(c);

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

  function isChatActive() {
    const chat = $("screen-chat");
    return !!(chat && chat.classList.contains("active"));
  }

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

  function observeScreens() {
    const target = $("root") || document.body;
    const obs = new MutationObserver(() => {
      if (isChatActive()) disableCursorGlow();
      else enableCursorGlow();
    });
    obs.observe(target, { subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  }

  function burst(x, y, type) {
    if (prefersReduced) return;
    const c = $("fxBurstCanvas");
    if (!c) return;

    const inChat = isChatActive();
    const strength = inChat ? 0.6 : 1.0;

    const ctx = c.getContext("2d");
    const dpr = Number(c.dataset.dpr || "1");
    const cx = x * dpr;
    const cy = y * dpr;

    const colors = {
      send: "rgba(60,255,160,0.95)",
      receive: "rgba(80,140,255,0.95)",
      reply: "rgba(255,211,107,0.95)",
      approve: "rgba(120,255,200,0.95)",
    };
    const col = colors[type] || "rgba(255,255,255,0.85)";

    const count = Math.floor((inChat ? 18 : 28) * strength);
    const parts = Array.from({ length: count }).map(() => {
      const a = Math.random() * Math.PI * 2;
      const s = (Math.random() * 2.2 + 1.4) * (inChat ? 0.9 : 1.1) * strength;
      return { x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: Math.random() * 18 + 26, r: Math.random() * 2 + 1.5 };
    });

    let frame = 0;
    const max = 44;
    const fade = inChat ? 0.14 : 0.10;

    function step() {
      frame++;
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, c.width, c.height);

      ctx.beginPath();
      for (const p of parts) {
        p.x += p.vx * dpr;
        p.y += p.vy * dpr;
        p.vy += 0.02 * dpr;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.life -= 1;
        if (p.life > 0) {
          ctx.moveTo(p.x, p.y);
          ctx.arc(p.x, p.y, p.r * dpr, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = col;
      ctx.globalAlpha = inChat ? 0.55 : 0.65;
      ctx.globalCompositeOperation = "lighter";
      ctx.fill();

      if (frame < max) requestAnimationFrame(step);
      else {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(0, 0, c.width, c.height);
      }
    }
    requestAnimationFrame(step);
  }

  function hookChatEvents() {
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      if (t.id === "sendBtn") {
        const rect = t.getBoundingClientRect();
        burst(rect.left + rect.width / 2, rect.top + rect.height / 2, "send");
      }
      if (t.id === "sendReplyBtn") {
        const rect = t.getBoundingClientRect();
        burst(rect.left + rect.width / 2, rect.top + rect.height / 2, "reply");
      }
      if (t.id === "rulesContinue") {
        burst(window.innerWidth * 0.52, window.innerHeight * 0.44, "approve");
      }
    });

    const messages = $("messages");
    if (!messages) return;

    let lastBurstAt = 0;
    const mo = new MutationObserver((mut) => {
      const now = Date.now();
      if (now - lastBurstAt < 250) return;
      for (const m of mut) {
        if (m.addedNodes && m.addedNodes.length) {
          lastBurstAt = now;
          burst(window.innerWidth * 0.72, window.innerHeight * 0.62, "receive");
          break;
        }
      }
    });
    mo.observe(messages, { childList: true });
  }

  function boot() {
    ensureBg();

    if (!isTouch && !prefersReduced) {
      window.addEventListener("mousemove", (e) => {
        if (isChatActive()) return;
        enableCursorGlow();
        updateGlowPos(e);
      }, { passive: true });
    } else {
      disableCursorGlow();
    }

    observeScreens();
    hookChatEvents();

    // expose
    window.ST_FX = { burst };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
