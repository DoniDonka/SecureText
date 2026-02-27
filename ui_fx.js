// ui_fx.js — lightweight “cool website” FX (no libraries)
// Works on GitHub Pages. Respects .fx-off on <html>.

(function () {
  const root = document.documentElement;

  // Respect reduced motion
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Cursor glow
  const glow = document.createElement("div");
  glow.id = "stCursorGlow";
  glow.style.position = "fixed";
  glow.style.left = "0";
  glow.style.top = "0";
  glow.style.width = "18px";
  glow.style.height = "18px";
  glow.style.borderRadius = "999px";
  glow.style.pointerEvents = "none";
  glow.style.zIndex = "999997";
  glow.style.background = "rgba(138,180,255,.22)";
  glow.style.filter = "blur(14px)";
  glow.style.transform = "translate(-100px,-100px)";
  glow.style.transition = prefersReduced ? "none" : "transform 40ms linear";
  document.body.appendChild(glow);

  // Ambient grid overlay (CSS-driven)
  root.classList.add("st-fx");

  let mx = -100, my = -100;
  let gx = -100, gy = -100;

  function tick() {
    if (root.classList.contains("fx-off")) {
      glow.style.opacity = "0";
    } else {
      glow.style.opacity = "1";
      gx += (mx - gx) * 0.18;
      gy += (my - gy) * 0.18;
      glow.style.transform = `translate(${gx - 9}px,${gy - 9}px)`;
      root.style.setProperty("--st-mx", gx + "px");
      root.style.setProperty("--st-my", gy + "px");
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.addEventListener("pointermove", (e) => {
    mx = e.clientX;
    my = e.clientY;
  }, { passive: true });

  // Magnetic buttons (subtle)
  function magnetize(el) {
    const strength = 10;
    let rect = null;

    function onMove(e) {
      if (root.classList.contains("fx-off") || prefersReduced) return;
      rect = rect || el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);

      const maxDist = Math.max(80, rect.width);
      if (dist < maxDist) {
        const pull = (1 - dist / maxDist);
        el.style.transform = `translate(${(dx / maxDist) * strength * pull}px, ${(dy / maxDist) * strength * pull}px)`;
      } else {
        el.style.transform = "";
        rect = null;
      }
    }
    function onLeave() {
      el.style.transform = "";
      rect = null;
    }

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
  }

  function wireMagnetButtons() {
    document.querySelectorAll("button").forEach((b) => {
      if (b.dataset.stMagnet === "1") return;
      b.dataset.stMagnet = "1";
      magnetize(b);
    });
  }

  // Re-wire when DOM changes (your app dynamically injects)
  const mo = new MutationObserver(() => wireMagnetButtons());
  mo.observe(document.documentElement, { subtree: true, childList: true });
  wireMagnetButtons();

  // Tiny “status spark” helper (optional)
  window.ST_FX = {
    ping(el) {
      try {
        if (!el) return;
        el.classList.add("st-ping");
        setTimeout(() => el.classList.remove("st-ping"), 650);
      } catch {}
    }
  };
})();
