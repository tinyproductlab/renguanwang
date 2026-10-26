/* Canvas weather particles for the homepage hero background (#wxBg).
   Replaces the flat CSS ::after streaks with layered, depth-aware motion:
   rain (far/mid/near drops + splashes), storm (+ lightning), snow (swaying
   flakes), drifting cloud blobs, fog bands, clear-day dust, night stars.
   Degrades gracefully: if canvas or animation is unavailable, or the user
   prefers reduced motion, it does nothing and the CSS background stays. */
(function () {
  if (typeof module !== 'undefined' && module.exports) { module.exports = {}; return; }
  const bg = document.getElementById('wxBg');
  if (!bg || !window.HTMLCanvasElement) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'wxFx';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  bg.insertBefore(canvas, bg.firstChild);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let W = 0, H = 0, raf = 0, running = false;
  let mode = 'clear', phase = 'day';
  let parts = [], clouds = [], stars = [], splashes = [];
  let nextBolt = 0, boltUntil = 0, boltPath = null;
  let lastT = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const r = bg.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(bg);
  else window.addEventListener('resize', resize);
  resize();

  const rnd = (a, b) => a + Math.random() * (b - a);
  const night = () => phase === 'night';

  function build() {
    parts = []; clouds = []; stars = []; splashes = [];
    const area = W * H;
    if (mode === 'rain' || mode === 'storm') {
      const n = Math.min(mode === 'storm' ? 240 : 200, Math.round(area / 8500));
      for (let i = 0; i < n; i++) {
        const layer = i % 3; // 0 far, 1 mid, 2 near
        parts.push({
          x: rnd(0, W), y: rnd(-H, 0), layer,
          len: [10, 16, 24][layer], speed: [9, 14, 20][layer],
          alpha: [0.25, 0.45, 0.7][layer], width: layer === 2 ? 1.6 : 1,
        });
      }
    } else if (mode === 'snow') {
      const n = Math.min(170, Math.round(area / 11000));
      for (let i = 0; i < n; i++) {
        parts.push({
          x: rnd(0, W), y: rnd(-H, 0), r: rnd(1, 3.4),
          speed: rnd(0.5, 1.6), sway: rnd(0.4, 1.4), ph: rnd(0, Math.PI * 2),
          alpha: rnd(0.4, 0.95),
        });
      }
    } else if (mode === 'cloud') {
      for (let i = 0; i < 8; i++) {
        clouds.push({
          x: rnd(-200, W), y: rnd(0, H * 0.55), rx: rnd(90, 220), ry: rnd(28, 60),
          speed: rnd(0.08, 0.35), alpha: rnd(0.10, 0.22),
          warm: phase === 'dawn' || phase === 'dusk',
        });
      }
    } else if (mode === 'fog') {
      for (let i = 0; i < 6; i++) {
        clouds.push({
          x: rnd(-300, W), y: rnd(0, H * 0.8), rx: rnd(220, 420), ry: rnd(18, 34),
          speed: rnd(0.05, 0.16), alpha: rnd(0.08, 0.16), warm: false,
        });
      }
    } else if (mode === 'clear') {
      if (night()) {
        for (let i = 0; i < 90; i++) {
          stars.push({ x: rnd(0, W), y: rnd(0, H * 0.7), r: rnd(0.5, 1.6), ph: rnd(0, Math.PI * 2), sp: rnd(0.5, 1.8) });
        }
      } else {
        for (let i = 0; i < 26; i++) {
          parts.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.8, 2), speed: rnd(0.05, 0.2), ph: rnd(0, Math.PI * 2), alpha: rnd(0.15, 0.4) });
        }
      }
    }
    nextBolt = performance.now() + rnd(4000, 9000);
  }

  function bolt() {
    const x0 = rnd(W * 0.15, W * 0.85);
    const pts = [[x0, -10]];
    let x = x0, y = -10;
    while (y < H * 0.55) { y += rnd(18, 42); x += rnd(-26, 26); pts.push([x, y]); }
    boltPath = pts;
    boltUntil = performance.now() + 260;
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(50, now - (lastT || now));
    lastT = now;
    ctx.clearRect(0, 0, W, H);
    const t = now / 1000;

    if (mode === 'rain' || mode === 'storm') {
      ctx.lineCap = 'round';
      for (const p of parts) {
        p.y += p.speed * (dt / 16.7);
        p.x += p.speed * 0.22 * (dt / 16.7);
        if (p.y > H) {
          if (p.layer === 2 && splashes.length < 40 && Math.random() < 0.6) {
            splashes.push({ x: p.x, y: H - 2, r: 1, alpha: 0.5 });
          }
          p.y = rnd(-80, -10); p.x = rnd(0, W);
        }
        ctx.strokeStyle = `rgba(255,255,255,${p.alpha})`;
        ctx.lineWidth = p.width;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.len * 0.22, p.y + p.len);
        ctx.stroke();
      }
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.r += 0.5; s.alpha -= 0.05;
        if (s.alpha <= 0) { splashes.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(255,255,255,${s.alpha})`;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r * 1.8, s.r * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (mode === 'storm') {
        if (now >= nextBolt) { bolt(); nextBolt = now + rnd(4000, 9500); }
        if (boltPath && now < boltUntil) {
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          boltPath.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
          ctx.stroke();
        } else boltPath = null;
      }
    } else if (mode === 'snow') {
      for (const p of parts) {
        p.y += p.speed * (dt / 16.7);
        p.x += Math.sin(t * p.sway + p.ph) * 0.4;
        if (p.y > H + 4) { p.y = rnd(-20, -4); p.x = rnd(0, W); }
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (mode === 'cloud' || mode === 'fog') {
      for (const c of clouds) {
        c.x += c.speed * (dt / 16.7);
        if (c.x - c.rx > W) { c.x = -c.rx * 2; c.y = rnd(0, H * (mode === 'fog' ? 0.8 : 0.55)); }
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.rx);
        const col = c.warm ? '255,190,130' : '255,255,255';
        g.addColorStop(0, `rgba(${col},${c.alpha})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (mode === 'clear') {
      if (night()) {
        for (const s of stars) {
          const a = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        for (const p of parts) {
          p.y -= p.speed * (dt / 16.7);
          p.x += Math.sin(t * 0.5 + p.ph) * 0.15;
          if (p.y < -4) { p.y = H + 4; p.x = rnd(0, W); }
          ctx.fillStyle = `rgba(255,240,190,${p.alpha})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastT = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, W, H);
  }

  window.RGWWeatherFx = {
    set(nextMode, nextPhase) {
      const m = ['rain', 'storm', 'snow', 'cloud', 'fog'].includes(nextMode) ? nextMode : 'clear';
      const p = ['night', 'dawn', 'dusk'].includes(nextPhase) ? nextPhase : 'day';
      if (m === mode && p === phase && running) return;
      mode = m; phase = p;
      build();
      bg.classList.add('wx-fx');
      start();
    },
    stop() { bg.classList.remove('wx-fx'); stop(); },
  };
})();
