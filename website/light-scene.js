// Original canvas preview for the website. No music is played by this demonstration.
export function createLightScene(canvas) {
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return null;

  const stage = canvas.parentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let width = 0;
  let height = 0;
  let phase = 0;
  let frame = 0;
  let previousTime = 0;
  let lastPaint = 0;
  let visible = true;
  let paused = reducedMotion.matches;
  let scene = 'flow';

  // Seeded stars keep the composition stable when the canvas is resized.
  let seed = 1028;
  function random() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  const stars = Array.from({ length: 260 }, () => ({
    x: random(), y: random(), size: random() * 1.15 + .25, depth: random(),
  }));

  function paint() {
    context.clearRect(0, 0, width, height);

    // The lighting is part of the particle scene and follows the same pointer.
    const lightX = width * (.59 + pointer.x * .08);
    const lightY = height * (.55 + pointer.y * .06);
    const light = context.createRadialGradient(lightX, lightY, 0, lightX, lightY, width * .69);
    light.addColorStop(0, scene === 'flow' ? '#9f947025' : '#77776f16');
    light.addColorStop(.52, '#5d584018');
    light.addColorStop(1, '#07070700');
    context.fillStyle = light;
    context.fillRect(0, 0, width, height);

    for (const star of stars) {
      const twinkle = .16 + (Math.sin(phase * .4 + star.x * 45) + 1) * .16;
      const x = star.x * width + pointer.x * star.depth * 13;
      const y = star.y * height + pointer.y * star.depth * 9;
      context.fillStyle = `rgba(228,226,217,${twinkle})`;
      context.beginPath();
      context.arc(x, y, star.size, 0, Math.PI * 2);
      context.fill();
    }

    const columns = width < 450 ? 68 : 88;
    const rows = 36;
    context.globalCompositeOperation = 'lighter';
    for (let row = rows; row >= 0; row--) {
      const depth = row / rows;
      const perspective = .3 + depth * 1.1;
      for (let column = 0; column < columns; column++) {
        const u = (column / (columns - 1) - .5) * 2;
        const wave = Math.sin(u * 3.2 + depth * 4.7 - phase * .48)
          * Math.cos(depth * 3.1 + phase * .22);
        const ripple = Math.sin(u * 6.2 - depth * 5 + phase * .38) * .15;
        const x = width * .5 + u * width * .62 * perspective + pointer.x * (depth * 13 + 5);
        let y = height * .48 + depth * height * .30 + (wave + ripple) * height * .13 * perspective;
        if (scene === 'stars') {
          const angle = u * 2.3 + phase * .08;
          y = height * .57 + Math.sin(angle + depth * 3.7) * height * .19 * perspective;
        }
        y += pointer.y * 11 * depth;
        const edge = Math.max(0, 1 - Math.pow(Math.abs(u), 2));
        const alpha = (.19 + depth * .52) * edge;
        const radius = .45 + depth * .95;
        const warm = Math.sin(u * 2.4 + depth * 2.2 + phase * .1) > .45;
        context.fillStyle = warm && scene === 'flow'
          ? `rgba(240,217,169,${alpha * .85})`
          : `rgba(210,212,208,${alpha})`;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalCompositeOperation = 'source-over';
    stage.classList.add('is-rendered');
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
  }

  function tick(time) {
    frame = 0;
    if (paused || !visible || document.hidden) return;
    const delta = previousTime ? Math.min((time - previousTime) / 1000, .05) : 0;
    previousTime = time;
    phase += delta;
    pointer.x += (pointer.targetX - pointer.x) * .055;
    pointer.y += (pointer.targetY - pointer.y) * .055;
    // A capped paint rate keeps the preview economical on mobile screens.
    if (time - lastPaint >= 1000 / 30) {
      paint();
      lastPaint = time;
    }
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (!frame && !paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function resize() {
    const bounds = stage.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint();
  }

  new ResizeObserver(resize).observe(stage);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start(); else stop();
    }).observe(stage);
  }
  stage.addEventListener('pointermove', (event) => {
    const bounds = stage.getBoundingClientRect();
    pointer.targetX = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    pointer.targetY = (event.clientY - bounds.top) / bounds.height * 2 - 1;
  }, { passive: true });
  stage.addEventListener('pointerleave', () => {
    pointer.targetX = 0;
    pointer.targetY = 0;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
  reducedMotion.addEventListener('change', (event) => {
    if (event.matches) setPaused(true);
  });

  function setPaused(value) {
    paused = value;
    if (paused) stop(); else start();
    stage.dispatchEvent(new CustomEvent('motionchange', { detail: { paused } }));
  }

  resize();
  start();
  return {
    get paused() { return paused; },
    setPaused,
    setScene(value) {
      scene = value === 'stars' ? 'stars' : 'flow';
      paint();
    },
  };
}
