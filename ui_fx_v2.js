// ui_fx.js — FX PACK v2 (backgrounds + particles + cursor glow + magnetic + ripples)
// Safe: no Firebase, no external libs.
(function () {
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const perf = { enabled: !prefersReduced, lowPower: false };
  document.addEventListener("visibilitychange", () => {
    perf.lowPower = document.hidden;
    document.documentElement.classList.toggle("fx-lowpower", perf.lowPower);
  });

  // ---------- Inject background layers ----------
  const layers = document.createElement("div");
  layers.className = "fx-layers";
  layers.innerHTML = `
    <div class="fx-noise"></div>
    <div class="fx-vignette"></div>
    <div class="fx-blobs">
      <div class="fx-blob a"></div>
      <div class="fx-blob b"></div>
      <div class="fx-blob c"></div>
      <div class="fx-blob d"></div>
    </div>
    <canvas class="fx-particles" aria-hidden="true"></canvas>
  `;
  document.body.appendChild(layers);

  // ---------- Cursor glow ----------
  let cx = 0, cy = 0, tx = 0, ty = 0;
  const glow = document.createElement("div");
  glow.className = "fx-cursor-glow";
  document.body.appendChild(glow);

  function onMove(e) { tx = e.clientX; ty = e.clientY; }
  if (!isTouch) window.addEventListener("mousemove", onMove, { passive: true });

  function glowTick() {
    if (!perf.enabled || perf.lowPower || isTouch) {
      glow.style.opacity = "0";
      requestAnimationFrame(glowTick);
      return;
    }
    glow.style.opacity = "1";
    cx += (tx - cx) * 0.14;
    cy += (ty - cy) * 0.14;
    glow.style.transform = `translate3d(${cx - 140}px, ${cy - 140}px, 0)`;
    requestAnimationFrame(glowTick);
  }
  requestAnimationFrame(glowTick);

  // ---------- Parallax blobs ----------
  let mx = 0, my = 0;
  if (!isTouch) {
    window.addEventListener("mousemove", (e) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
      document.documentElement.style.setProperty("--fx-mx", mx.toFixed(3));
      document.documentElement.style.setProperty("--fx-my", my.toFixed(3));
    }, { passive: true });
  }

  // ---------- Ripple click effect ----------
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const host = t.closest("button, .btn, a, .classBtn");
    if (!host) return;

    const r = document.createElement("span");
    r.className = "fx-ripple";
    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.2;
    r.style.width = r.style.height = size + "px";
    r.style.left = e.clientX - rect.left - size / 2 + "px";
    r.style.top = e.clientY - rect.top - size / 2 + "px";
    host.classList.add("fx-ripple-host");
    host.appendChild(r);
    setTimeout(() => { try { r.remove(); } catch {} }, 700);
  }, { passive: true });

  // ---------- Magnetic buttons ----------
  function applyMagnet(el) {
    el.addEventListener("mousemove", (e) => {
      if (perf.lowPower || prefersReduced) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `translate3d(${(x * 10).toFixed(2)}px, ${(y * 10).toFixed(2)}px, 0)`;
    });
    el.addEventListener("mouseleave", () => { el.style.transform = ""; });
  }
  function scanMagnet() {
    if (isTouch || prefersReduced) return;
    document.querySelectorAll("button, .btn, .classBtn").forEach((el) => {
      if (el.dataset.fxMagnet === "1") return;
      el.dataset.fxMagnet = "1";
      applyMagnet(el);
    });
  }
  scanMagnet();
  new MutationObserver(scanMagnet).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- Tilt cards ----------
  function tiltCard(card) {
    card.addEventListener("mousemove", (e) => {
      if (perf.lowPower || prefersReduced) return;
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateY(-1px)`;
    });
    card.addEventListener("mouseleave", () => { card.style.transform = ""; });
  }
  function scanTilt() {
    if (isTouch || prefersReduced) return;
    document.querySelectorAll(".card, .glass, .card-container, .screen-card, #chat-screen, .chatShell").forEach((el) => {
      if (el.dataset.fxTilt === "1") return;
      el.dataset.fxTilt = "1";
      tiltCard(el);
    });
  }
  scanTilt();
  new MutationObserver(scanTilt).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- Particles canvas ----------
  const canvas = layers.querySelector(".fx-particles");
  const ctx = canvas.getContext("2d", { alpha: true });

  let w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  const COUNT = isTouch ? 35 : 70;
  const pts = Array.from({ length: COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r: 1 + Math.random() * 1.6,
    a: 0.12 + Math.random() * 0.18,
  }));

  function drawParticles() {
    if (!perf.enabled || perf.lowPower || prefersReduced) {
      ctx.clearRect(0, 0, w, h);
      requestAnimationFrame(drawParticles);
      return;
    }

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.x += p.vx;
      p.y += p.vy;

      if (!isTouch) {
        const dx = (tx - p.x) * 0.0008;
        const dy = (ty - p.y) * 0.0008;
        p.vx += dx; p.vy += dy;
        p.vx *= 0.98; p.vy *= 0.98;
      }

      if (p.x < -20) p.x = w + 20;
      if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20;
      if (p.y > h + 20) p.y = -20;

      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.fill();

      for (let j = i + 1; j < pts.length; j++) {
        const q = pts[j];
        const dx2 = p.x - q.x;
        const dy2 = p.y - q.y;
        const dist = Math.hypot(dx2, dy2);
        if (dist < 120) {
          ctx.globalAlpha = (1 - dist / 120) * 0.08;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = "rgba(255,255,255,1)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(drawParticles);
  }
  requestAnimationFrame(drawParticles);
})();