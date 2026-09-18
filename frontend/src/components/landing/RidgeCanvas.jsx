import { useEffect, useRef } from "react";

/**
 * The slow-drifting mountain ridgelines behind the landing hero, ported from
 * the Himovation festival site. Nine sine-summed polylines in the accent
 * colour, redrawn at ~30fps only while the hero is on screen and the tab is
 * visible; a single static frame when the visitor prefers reduced motion.
 *
 * Fills its parent, which must be `position: relative`. Shared by the landing
 * hero, every in-app PageHero and the sign-in panel. The colour is read from
 * the parent, so on a dark band (.hv-band-dark) the ridges take that band's
 * accent rather than the page's.
 */
export default function RidgeCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !host || !ctx) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const readAccent = () =>
      (getComputedStyle(host).getPropertyValue("--c-accent").trim() || "3 105 161")
        .split(/\s+/)
        .join(",");

    let accent = readAccent();
    let w = 0;
    let h = 0;
    let lines = [];
    let raf = 0;
    let last = 0;
    let visible = true;
    let running = false;

    const build = () => {
      const count = w < 640 ? 6 : 9;
      lines = Array.from({ length: count }, (_, i) => {
        const k = i / (count - 1);
        return {
          base: 0.34 + 0.62 * k,
          amp: [30, 15, 6].map((a) => a * (0.8 + k)),
          freq: [0.0032, 0.0071, 0.0158],
          speed: [0.00011, 0.00019, 0.00033].map((s) => s * (1 + 0.15 * i)),
          phase: [0, 1, 2].map(() => Math.random() * Math.PI * 2),
          alpha: 0.07 + 0.16 * k,
          fill: i % 2 === 0,
        };
      });
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      const step = 8;
      for (const ln of lines) {
        ctx.beginPath();
        for (let x = 0; x <= w + step; x += step) {
          let y = h * ln.base;
          for (let k = 0; k < 3; k++) {
            y += ln.amp[k] * Math.sin(x * ln.freq[k] + t * ln.speed[k] + ln.phase[k]);
          }
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${accent},${ln.alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (ln.fill) {
          ctx.lineTo(w + step, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          ctx.fillStyle = `rgba(${accent},0.02)`;
          ctx.fill();
        }
      }
    };

    const frame = (now) => {
      raf = 0;
      if (!running) return;
      if (now - last >= 33) {
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(frame);
    };

    const sync = () => {
      const should = visible && !document.hidden && !reduced;
      if (should && !running) {
        running = true;
        if (!raf) raf = requestAnimationFrame(frame);
      } else if (!should && running) {
        running = false;
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      }
    };

    const resize = () => {
      const r = host.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      draw(reduced ? 0 : performance.now());
    };

    let resizeTimer;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    };

    // The theme toggle flips data-theme on <html>; the accent changes with it.
    const themeWatcher = new MutationObserver(() => {
      accent = readAccent();
      draw(reduced ? 0 : performance.now());
    });
    themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              visible = entries[0].isIntersecting;
              sync();
            },
            { threshold: 0 }
          )
        : null;
    io?.observe(host);

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", sync);
    resize();
    sync();

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", sync);
      themeWatcher.disconnect();
      io?.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="ridge-canvas" aria-hidden="true" />;
}
