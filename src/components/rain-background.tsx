"use client";

import { useEffect, useRef } from "react";

type Drop = { x: number; y: number; len: number; speed: number; alpha: number; hue: number };
type Splash = { x: number; y: number; r: number; alpha: number };

/**
 * Subtle animated rain behind the storefront.
 * - Canvas based (one element, GPU friendly), pointer-events disabled
 * - Density scales with screen size, capped for low-end phones
 * - Pauses when the tab is hidden; disabled for "reduce motion" users
 */
export function RainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let drops: Drop[] = [];
    let splashes: Splash[] = [];
    let frame = 0;
    let last = performance.now();
    const wind = 0.18; // horizontal drift per unit of fall

    const newDrop = (randomY: boolean): Drop => ({
      x: Math.random() * (width + 100) - 50,
      y: randomY ? Math.random() * height : -20 - Math.random() * height * 0.3,
      len: 7 + Math.random() * 9,
      speed: 380 + Math.random() * 320, // px per second
      alpha: 0.12 + Math.random() * 0.28,
      // indigo → violet → pink, matching the brand colours
      hue: 235 + Math.random() * 90,
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(160, Math.round((width * height) / 9000));
      drops = Array.from({ length: target }, () => newDrop(true));
      splashes = [];
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineWidth = 1.2;

      for (const d of drops) {
        const dy = d.speed * dt;
        d.y += dy;
        d.x += dy * wind;
        ctx.strokeStyle = `hsla(${d.hue}, 85%, 60%, ${d.alpha})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * wind, d.y - d.len);
        ctx.stroke();

        if (d.y > height) {
          if (Math.random() < 0.35) splashes.push({ x: d.x, y: height - 2, r: 1, alpha: d.alpha });
          Object.assign(d, newDrop(false));
        }
      }

      // tiny ripples where drops land
      for (const s of splashes) {
        s.r += 22 * dt;
        s.alpha -= 0.9 * dt;
        if (s.alpha <= 0) continue;
        ctx.strokeStyle = `hsla(250, 80%, 65%, ${s.alpha})`;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.r * 2, s.r * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      splashes = splashes.filter((s) => s.alpha > 0);

      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : start());

    resize();
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-dvh w-screen"
    />
  );
}
