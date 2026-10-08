// Movement reveals a fine red pixel screen that fades back to the background.
export function initHeroTrail(hero, distortion) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(any-pointer: fine)');
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-trail';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  hero.append(canvas);
  const color = getComputedStyle(hero).getPropertyValue('--red').trim() || '#e71938';
  const spacing = 8;
  const pixels = [[0, 3], [2, 1], [0, 1], [3, 0], [2, 2], [1, 0], [0, 2]];
  let width, height, columns, rows, vx, vy;
  let previous = null;
  let frame = 0;
  let lastTime = 0;
  let lastMove = 0;

  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = null;
    distortion?.reset();
    vx?.fill(0);
    vy?.fill(0);
    ctx.clearRect(0, 0, width, height);
  }
  function resize() {
    reset();
    width = hero.clientWidth;
    height = hero.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Math.ceil(width / spacing);
    rows = Math.ceil(height / spacing);
    vx = new Float32Array(columns * rows);
    vy = new Float32Array(columns * rows);
  }
  function decay(time) {
    const fade = Math.exp(-(time - lastTime) / 250);
    for (let i = 0; i < vx.length; i++) {
      vx[i] *= fade;
      vy[i] *= fade;
    }
    lastTime = time;
  }
  function draw(time) {
    frame = 0;
    decay(time);
    ctx.clearRect(0, 0, width, height);
    distortion?.renderField(vx, vy, columns, rows);
    ctx.fillStyle = color;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const i = row * columns + col;
        const count = Math.floor(Math.min(1, Math.hypot(vx[i], vy[i])) * 7);
        for (let p = 0; p < count; p++) {
          ctx.fillRect(col * spacing + pixels[6 - p][0] * 2,
            row * spacing + pixels[6 - p][1] * 2, 1.25, 1.25);
        }
      }
    }
    if (time - lastMove < 1500) frame = requestAnimationFrame(draw);
    else reset();
  }
  function move(event) {
    if (event.pointerType === 'touch' || motion.matches || !pointer.matches) return;
    const bounds = hero.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const time = performance.now();
    if (!previous) { previous = { x, y }; return; }
    const dx = x - previous.x;
    const dy = y - previous.y;
    previous = { x, y };
    if (!dx && !dy) return;
    if (frame) decay(time);
    else lastTime = time;
    const radius = height * 0.04;
    const reach = radius * 3;
    const left = Math.max(0, Math.floor((x - reach) / spacing));
    const right = Math.min(columns - 1, Math.ceil((x + reach) / spacing));
    const top = Math.max(0, Math.floor((y - reach) / spacing));
    const bottom = Math.min(rows - 1, Math.ceil((y + reach) / spacing));
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        const distance = (col * spacing - x) ** 2 + (row * spacing - y) ** 2;
        const influence = Math.exp(-distance / (radius * radius)) * 0.04;
        const i = row * columns + col;
        vx[i] += dx * influence;
        vy[i] += dy * influence;
      }
    }
    lastMove = time;
    if (!frame) frame = requestAnimationFrame(draw);
  }
  hero.addEventListener('pointermove', move, { passive: true });
  hero.addEventListener('pointerleave', () => { previous = null; });
  window.addEventListener('blur', reset);
  window.addEventListener('scroll', reset, { passive: true });
  document.addEventListener('visibilitychange', reset);
  motion.addEventListener('change', reset);
  pointer.addEventListener('change', reset);
  new ResizeObserver(resize).observe(hero);
  resize();
}
