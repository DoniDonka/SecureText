// ui_fx_v4.js — SecureText V4 FX Pack
// Premium animated backgrounds + cursor glow + magnetic buttons (outside chat)
// Heavy effects auto-disable in chat to prevent lag.
// Particle BURSTS only (send/receive/reply/enterChat), no continuous particles.

(function () {
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const state = {
    lowPower: false,
    enabled: !prefersReduced,
    inChat: false,
    mx: 0,
    my: 0,
  };

  function readInChat() {
    try {
      // app.js sets body[data-st-screen="chat"]
      const scr = document.body && document.body.dataset ? document.body.dataset.stScreen : "";
      return String(scr) === "chat";
    } catch {
      return false;
    }
  }

  function setInChat(v) {
    state.inChat = !!v;
    document.documentElement.classList.toggle("st-chat-mode", state.inChat);
    // disable pointer-heavy transforms in chat
    if (state.inChat) {
      if (glow) glow.style.opacity = "0";
    }
  }

  document.addEventListener("visibilitychange", () => {
    state.lowPower = document.hidden;
    document.documentElement.classList.toggle("st-lowpower", state.lowPower);
  });

  // Keep inChat synced
  setInterval(() => setInChat(readInChat()), 250);

  // ===== Cursor glow tracking (disabled in chat) =====
  let cx = 0, cy = 0, tx = 0, ty = 0;

  const glow = document.createElement("div");
  glow.className = "st-cursor-glow";
  document.body.appendChild(glow);

  function onMove(e) {
    tx = e.clientX;
    ty = e.clientY;
    const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    state.mx = nx; state.my = ny;
    document.documentElement.style.setProperty("--st-mx", nx.toFixed(3));
    document.documentElement.style.setProperty("--st-my", ny.toFixed(3));
  }
  if (!isTouch) window.addEventListener("mousemove", onMove, { passive: true });

  function glowTick() {
    const ok = state.enabled && !state.lowPower && !isTouch && !state.inChat;
    glow.style.opacity = ok ? "1" : "0";
    if (ok) {
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      glow.style.transform = `translate3d(${cx - 140}px, ${cy - 140}px, 0)`;
    }
    requestAnimationFrame(glowTick);
  }
  requestAnimationFrame(glowTick);

  // ===== Background layers (blobs + vignette + noise) =====
  const layers = document.createElement("div");
  layers.className = "st-fx-layers";
  layers.innerHTML = `
    <div class="st-blobs">
      <div class="st-blob a"></div>
      <div class="st-blob b"></div>
      <div class="st-blob c"></div>
    </div>
    <div class="st-vignette"></div>
    <div class="st-noise"></div>
  `;
  document.body.appendChild(layers);

  // ===== Particle bursts canvas =====
  const canvas = document.createElement("canvas");
  canvas.className = "st-burst-canvas";
  const ctx = canvas.getContext("2d", { alpha: true });
  document.body.appendChild(canvas);

  function resize() {
    canvas.width = Math.floor(window.innerWidth * (window.devicePixelRatio || 1));
    canvas.height = Math.floor(window.innerHeight * (window.devicePixelRatio || 1));
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  const bursts = [];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function spawnBurst(type, x, y) {
    if (state.lowPower) return;
    if (state.inChat) return; // no background bursts in chat (per your request)
    const N = type === "enterChat" ? 120 : type === "reply" ? 56 : 48;

    const base = { send: [80, 220], receive: [210, 120], reply: [160, 200], enterChat: [110, 200] }[type] || [140, 180];

    for (let i = 0; i < N; i++) {
      bursts.push({
        x, y,
        vx: rand(-2.2, 2.2),
        vy: rand(-2.2, 2.2),
        r: rand(1.1, 2.6),
        life: rand(0.55, 1.05),
        t: 0,
        c: `hsla(${base[0] + rand(-20, 20)}, ${base[1]}%, ${rand(55, 70)}%, ${rand(0.35, 0.75)})`,
      });
    }
  }

  function burstAtCenter(type) {
    spawnBurst(type, window.innerWidth * 0.5, window.innerHeight * 0.35);
  }

  window.addEventListener("st:fxBurst", (e) => {
    const d = (e && e.detail) || {};
    const type = d.type || "send";
    const x = typeof d.x === "number" ? d.x : window.innerWidth * 0.5;
    const y = typeof d.y === "number" ? d.y : window.innerHeight * 0.45;
    spawnBurst(type, x, y);
  });

  // Warp overlay when entering chat
  window.addEventListener("st:enterChat", () => {
    // overlay effect - very short, doesn't touch chat background
    const warp = document.createElement("div");
    warp.className = "st-warp";
    document.body.appendChild(warp);
    setTimeout(() => { try { warp.remove(); } catch {} }, 900);
  });

  function draw() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    if (!state.lowPower && bursts.length) {
      for (let i = bursts.length - 1; i >= 0; i--) {
        const p = bursts[i];
        p.t += 1 / 60;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy *= 0.985;

        const k = 1 - (p.t / p.life);
        if (k <= 0) {
          bursts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.7 + (1 - k) * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // ===== Magnetic buttons + tilt cards (disabled in chat) =====
  function applyMagnet(el) {
    el.addEventListener("mousemove", (e) => {
      if (state.lowPower || prefersReduced || isTouch || state.inChat) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `translate3d(${(x * 10).toFixed(1)}px, ${(y * 10).toFixed(1)}px, 0)`;
    });
    el.addEventListener("mouseleave", () => { el.style.transform = ""; });
  }

  function scanMagnet() {
    if (isTouch || prefersReduced) return;
    document.querySelectorAll("button, .btn, .classBtn").forEach((el) => {
      if (el.dataset.stMagnet === "1") return;
      el.dataset.stMagnet = "1";
      applyMagnet(el);
    });
  }
  scanMagnet();
  new MutationObserver(scanMagnet).observe(document.documentElement, { childList: true, subtree: true });

})();
