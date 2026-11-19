import {
  releaseApi,
  platforms,
  normalizeRelease,
  selectAsset,
  makeDownloadUrl,
  formatSize,
} from './releases.js?v=20261118-pro2';

const element = (id) => document.getElementById(id);
const tabs = [...document.querySelectorAll('[data-platform]')];
const variants = [...document.querySelectorAll('[data-variant]')];
const mirrorCards = [...document.querySelectorAll('[data-source-card]')];
const sourceSelect = element('download-source');
const downloadButton = element('download-button');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');

let release = null;
let currentAsset = null;
let platform = /Android/i.test(navigator.userAgent) ? 'android' : 'windows';
if (/HarmonyOS|OpenHarmony/i.test(navigator.userAgent)) platform = 'harmony';
let variant = 'setup';

const INVITE_URL = 'https://appgallery.huawei.com/link/invite-test-wap?taskId=7181c9f3cfda4854dc2f0d8fec00ab40&invitationCode=1Klp9jEJXOp';
const INVITE_DEADLINE = Date.parse('2026-12-16T12:46:00+08:00');

/* ==========================================================================
   1. Hero OS-Aware CTA & Mainland China Mirror Download Console
   ========================================================================== */

function updateHeroCta() {
  const heroLabel = element('hero-cta-label');
  if (!heroLabel) return;
  const labels = {
    windows: '立即下载 Windows 版',
    android: '立即下载 Android 版',
    harmony: '获取 HarmonyOS 版本',
  };
  heroLabel.textContent = labels[platform] || '立即免费下载';
}

function syncMirrorCards(selectedSource) {
  mirrorCards.forEach((card) => {
    const active = card.dataset.sourceCard === selectedSource;
    card.classList.toggle('is-selected', active);
    card.setAttribute('aria-checked', String(active));
  });
}

function setButtonContent(labelText, arrowText = '↓') {
  downloadButton.replaceChildren();
  const labelSpan = document.createElement('span');
  labelSpan.className = 'download-cta__label';
  labelSpan.textContent = labelText;
  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'download-cta__arrow';
  arrowSpan.setAttribute('aria-hidden', 'true');
  arrowSpan.textContent = arrowText;
  downloadButton.append(labelSpan, arrowSpan);
}

function renderDownload() {
  const info = platforms[platform];
  element('platform-name').textContent = info.name;
  element('platform-requirements').textContent = info.requirements;
  element('platform-note').textContent = info.note;
  element('variant-options').hidden = platform !== 'windows';
  element('download-content').setAttribute('aria-labelledby', `tab-${platform}`);

  const inviteCard = element('harmony-invite-card');
  if (inviteCard) {
    inviteCard.hidden = platform !== 'harmony' || Date.now() > INVITE_DEADLINE;
  }

  tabs.forEach((tab) => {
    const active = tab.dataset.platform === platform;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  variants.forEach((btn) => {
    const active = btn.dataset.variant === variant;
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('is-selected', active);
  });

  syncMirrorCards(sourceSelect.value);

  if (!release) {
    downloadButton.removeAttribute('href');
    downloadButton.setAttribute('aria-disabled', 'true');
    setButtonContent('正在获取下载信息…', '···');
    element('file-name').textContent = '正在连接 GitHub Releases';
    element('file-size').textContent = '';
    element('direct-link').href = 'https://github.com/YuriLin1028/LxMine/releases/latest';
    element('file-checksum').textContent = '等待文件信息…';
    element('copy-checksum').disabled = true;
    return;
  }

  currentAsset = selectAsset(release, platform, variant);
  element('copy-status').textContent = '';

  if (!currentAsset) {
    downloadButton.removeAttribute('href');
    downloadButton.setAttribute('aria-disabled', 'true');
    setButtonContent('此版本暂无对应安装包', '—');
    element('file-name').textContent = '请前往 GitHub Releases 查看全部文件';
    element('file-size').textContent = '';
    element('direct-link').href = release.url;
    element('file-checksum').textContent = '此版本暂无对应文件';
    element('copy-checksum').disabled = true;
    return;
  }

  const activeUrl = makeDownloadUrl(currentAsset, sourceSelect.value);
  const ghProxyUrl = makeDownloadUrl(currentAsset, 'gh-proxy');
  const ghFastUrl = makeDownloadUrl(currentAsset, 'ghfast');
  const githubDirectUrl = makeDownloadUrl(currentAsset, 'github');

  const actionLabel =
    platform === 'windows' && variant === 'portable'
      ? '下载 Windows 便携版'
      : info.action;

  const sourceSuffix = {
    'gh-proxy': '（大陆 GH-Proxy 极速）',
    ghfast: '（大陆 GHFast 备用）',
    github: '（GitHub 官方直连）',
  }[sourceSelect.value] || '';

  downloadButton.removeAttribute('aria-disabled');
  downloadButton.href = activeUrl;
  setButtonContent(`${actionLabel} ${sourceSuffix}`);

  element('file-name').textContent = currentAsset.name;
  element('file-size').textContent = formatSize(currentAsset.size);

  const ghProxyLink = element('mirror-ghproxy-link');
  const ghFastLink = element('mirror-ghfast-link');
  if (ghProxyLink) ghProxyLink.href = ghProxyUrl;
  if (ghFastLink) ghFastLink.href = ghFastUrl;

  element('direct-link').href = githubDirectUrl;
  element('direct-link').textContent = 'GitHub 直连 ↗';

  element('file-checksum').textContent =
    currentAsset.digest || '此文件尚未提供 SHA-256，请从 GitHub Release 获取校验文件。';
  element('copy-checksum').disabled = !currentAsset.digest;
}

function useRelease(data, live = false) {
  release = normalizeRelease(data);
  document.querySelectorAll('[data-release-version]').forEach((node) => {
    node.textContent = release.tag;
  });
  document.querySelectorAll('[data-release-link]').forEach((node) => {
    node.href = release.url;
  });
  const date = new Date(release.publishedAt);
  const dateText = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Shanghai',
      }).format(date);
  element('release-status').textContent = `${release.tag} · ${dateText} ${
    live ? '已实时同步 GitHub Releases' : '本地核验快照（可直接下载）'
  }`;
  renderDownload();
}

async function fetchJson(url, timeout = 6000) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function refreshRelease() {
  try {
    useRelease(await fetchJson(new URL('./release.json', import.meta.url), 3500));
  } catch {
    element('release-status').textContent = '正在同步 GitHub Releases…';
  }
  try {
    useRelease(await fetchJson(releaseApi, 5000), true);
  } catch {
    // Keep bundled verified release.json snapshot when GitHub API is rate-limited or unreachable
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
    platform = tab.dataset.platform;
    updateHeroCta();
    renderDownload();
  });
  tab.addEventListener('keydown', (event) => {
    const positions = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!Object.hasOwn(positions, event.key)) return;
    event.preventDefault();
    const next = tabs[positions[event.key]];
    next.focus();
    next.click();
  });
});

variants.forEach((btn) =>
  btn.addEventListener('click', () => {
    variant = btn.dataset.variant;
    renderDownload();
  }),
);

mirrorCards.forEach((card) =>
  card.addEventListener('click', () => {
    sourceSelect.value = card.dataset.sourceCard;
    renderDownload();
  }),
);

sourceSelect.addEventListener('change', renderDownload);

document.querySelectorAll('[data-jump-platform]').forEach((link) => {
  link.addEventListener('click', () => {
    const targetPlatform = link.dataset.jumpPlatform;
    if (platforms[targetPlatform]) {
      platform = targetPlatform;
      updateHeroCta();
      renderDownload();
    }
  });
});

element('copy-checksum')?.addEventListener('click', async () => {
  if (!currentAsset?.digest) return;
  try {
    await navigator.clipboard.writeText(currentAsset.digest);
    element('copy-status').textContent = '✓ 已复制 SHA-256 指纹到剪贴板';
  } catch {
    element('copy-status').textContent = '请长按或双击上方哈希值复制';
  }
});

element('copy-invite-link')?.addEventListener('click', async () => {
  const feedback = element('invite-copy-status');
  try {
    await navigator.clipboard.writeText(INVITE_URL);
    if (feedback) feedback.textContent = '✓ 已复制完整邀请链接，请粘贴至鸿蒙系统自带浏览器打开';
  } catch {
    if (feedback) feedback.textContent = '复制失败，请右键或长按左侧按钮复制链接';
  }
});

updateHeroCta();
renderDownload();
refreshRelease();

/* ==========================================================================
   2. 3D Cinema Product Showcase & Scene Switcher
   ========================================================================== */

const productVideo = element('product-demo');
const productShot = element('product-shot');
const motionButton = element('motion-toggle');
const cinemaRig = element('cinema-rig');

const scenes = {
  stage: {
    kind: 'video',
    src: './assets/windows-stage-1.1.0.mp4',
    poster: './assets/windows-stage-1.1.0.webp',
    badge: '3D 粒子地形舞台',
    description: 'Windows 1.1.0 播放录屏，展示粒子舞台与逐字歌词',
  },
  lyrics: {
    kind: 'video',
    src: './assets/windows-lyrics-1.1.0.mp4',
    poster: './assets/windows-lyrics-1.1.0.webp',
    badge: '逐字流光歌词',
    description: 'Windows 1.1.0 播放录屏，展示歌词随播放逐字亮起',
  },
  homeDark: {
    kind: 'image',
    src: './assets/windows-home-1.1.0.webp',
    badge: '四平台融合首页 · 深色外观',
    description: 'LxMine Windows 1.1.0 深色四平台融合首页截图',
  },
  homeLight: {
    kind: 'image',
    src: './assets/windows-light-1.1.0.webp',
    badge: '四平台融合首页 · 浅色外观',
    description: 'LxMine Windows 1.1.0 浅色四平台融合首页截图',
  },
};

let activeSceneKey = 'stage';
let userPaused = motionPreference.matches;
let recordingVisible = !('IntersectionObserver' in window);
let playbackRequest = 0;

function updateRecordingControls() {
  const isVideo = scenes[activeSceneKey]?.kind === 'video';
  motionButton.hidden = !isVideo;
  motionButton.textContent = userPaused ? '播放演示' : '暂停演示';
  motionButton.setAttribute('aria-pressed', String(userPaused));
  motionButton.setAttribute('aria-label', userPaused ? '播放实际录屏' : '暂停实际录屏');
}

function applyRecordingPlayback() {
  const request = ++playbackRequest;
  updateRecordingControls();
  if (scenes[activeSceneKey]?.kind !== 'video' || userPaused || !recordingVisible || document.hidden) {
    productVideo.pause();
    return;
  }
  productVideo.play().catch(() => {
    if (request !== playbackRequest) return;
    userPaused = true;
    updateRecordingControls();
  });
}

motionButton?.addEventListener('click', () => {
  userPaused = !userPaused;
  applyRecordingPlayback();
});

document.querySelectorAll('[data-scene]').forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.scene;
    const scene = scenes[key];
    if (!scene) return;
    activeSceneKey = key;

    element('scene-badge').textContent = scene.badge;
    element('recording-link').href = scene.src;

    document.querySelectorAll('[data-scene]').forEach((opt) => {
      const selected = opt === button;
      opt.classList.toggle('is-selected', selected);
      opt.setAttribute('aria-pressed', String(selected));
    });

    if (scene.kind === 'video') {
      productShot.hidden = true;
      productVideo.hidden = false;
      if (productVideo.getAttribute('src') !== scene.src) {
        productVideo.poster = scene.poster;
        productVideo.src = scene.src;
        productVideo.setAttribute('aria-label', scene.description);
        productVideo.load();
      }
    } else {
      productVideo.pause();
      productVideo.hidden = true;
      productShot.src = scene.src;
      productShot.alt = scene.description;
      productShot.hidden = false;
    }

    applyRecordingPlayback();
  });
});

if (cinemaRig && !motionPreference.matches) {
  cinemaRig.addEventListener('pointermove', (e) => {
    const rect = cinemaRig.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    cinemaRig.style.setProperty('--rx', `${(-ny * 4.5 + 1.8).toFixed(2)}deg`);
    cinemaRig.style.setProperty('--ry', `${(nx * 5.2).toFixed(2)}deg`);
  });
  cinemaRig.addEventListener('pointerleave', () => {
    cinemaRig.style.setProperty('--rx', '2.5deg');
    cinemaRig.style.setProperty('--ry', '0deg');
  });
}

if ('IntersectionObserver' in window && productVideo) {
  const videoObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target === productVideo) {
          recordingVisible = entry.isIntersecting;
          applyRecordingPlayback();
        }
      }
    },
    { threshold: 0.15 },
  );
  videoObserver.observe(productVideo);
}

applyRecordingPlayback();

/* ==========================================================================
   3. Interactive Word-by-Word Karaoke & Optical Dock Lab
   ========================================================================== */

const karaokeStage = element('karaoke-stage');
const lyricLines = [...document.querySelectorAll('.lyric-line')];
const progressRing = element('lab-progress-ring');
const playBtn = element('lab-play-btn');
const playIcon = element('lab-play-icon');

let karaokePlaying = !motionPreference.matches;
let activeLineIndex = 2;
let charProgress = 0;
let lastKaraokeTick = performance.now();

function renderKaraokeState() {
  lyricLines.forEach((line, idx) => {
    const isActive = idx === activeLineIndex;
    line.classList.toggle('is-active', isActive);
    const chars = [...line.querySelectorAll('span')];
    const litCount = isActive ? Math.floor(charProgress * (chars.length + 1)) : 0;
    chars.forEach((ch, cIdx) => {
      ch.classList.toggle('is-lit', isActive && cIdx < litCount);
    });
  });

  if (progressRing) {
    const totalPct = ((activeLineIndex + charProgress) / lyricLines.length) * 100;
    progressRing.style.setProperty('--hx-progress', `${totalPct.toFixed(1)}%`);
  }

  if (karaokeStage) {
    karaokeStage.dataset.paused = String(!karaokePlaying);
  }

  if (playIcon) {
    playIcon.innerHTML = karaokePlaying
      ? '<path d="M9 6v12M15 6v12"/>'
      : '<path d="M8 6l10 6-10 6V6z"/>';
  }
  playBtn?.setAttribute('aria-label', karaokePlaying ? '暂停歌词律动' : '播放歌词律动');
}

function stepKaraoke(now) {
  const dt = Math.min(0.1, (now - lastKaraokeTick) / 1000);
  lastKaraokeTick = now;
  if (karaokePlaying && !document.hidden) {
    charProgress += dt * 0.36;
    if (charProgress >= 1.12) {
      charProgress = 0;
      activeLineIndex = (activeLineIndex + 1) % lyricLines.length;
    }
    renderKaraokeState();
  }
  requestAnimationFrame(stepKaraoke);
}

lyricLines.forEach((line, idx) => {
  line.addEventListener('click', () => {
    activeLineIndex = idx;
    charProgress = 0.25;
    renderKaraokeState();
    triggerStageShockwave(0.8);
  });
});

function toggleKaraokePlay() {
  karaokePlaying = !karaokePlaying;
  renderKaraokeState();
}

playBtn?.addEventListener('click', toggleKaraokePlay);
element('lab-cover-btn')?.addEventListener('click', toggleKaraokePlay);

element('lab-prev-btn')?.addEventListener('click', () => {
  activeLineIndex = (activeLineIndex - 1 + lyricLines.length) % lyricLines.length;
  charProgress = 0.2;
  renderKaraokeState();
});

element('lab-next-btn')?.addEventListener('click', () => {
  activeLineIndex = (activeLineIndex + 1) % lyricLines.length;
  charProgress = 0.2;
  renderKaraokeState();
});

element('lab-like-btn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const next = !btn.classList.contains('is-active');
  btn.classList.toggle('is-active', next);
  btn.setAttribute('aria-pressed', String(next));
  if (next) triggerStageShockwave(1.1);
});

element('toggle-stage-fx')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const isOn = karaokeStage.dataset.stageFx !== 'off';
  karaokeStage.dataset.stageFx = isOn ? 'off' : 'on';
  btn.classList.toggle('is-fx-on', !isOn);
  btn.setAttribute('aria-pressed', String(!isOn));
});

renderKaraokeState();
if (!motionPreference.matches) {
  requestAnimationFrame(stepKaraoke);
}

/* ==========================================================================
   4. Cross-Device Ecosystem Switcher & Spotlight Cards
   ========================================================================== */

const ecoTabs = [...document.querySelectorAll('[data-eco]')];
const ecoPanes = [...document.querySelectorAll('[data-eco-pane]')];

ecoTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.eco;
    ecoTabs.forEach((t) => {
      const active = t === tab;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    ecoPanes.forEach((pane) => {
      const active = pane.dataset.ecoPane === target;
      pane.hidden = !active;
      pane.classList.toggle('is-active', active);
    });
  });
});

document.querySelectorAll('.spotlight-card').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--spot-x', `${(e.clientX - rect.left).toFixed(0)}px`);
    card.style.setProperty('--spot-y', `${(e.clientY - rect.top).toFixed(0)}px`);
  });
});

/* Scroll Reveal */
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove('awaiting');
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.08 },
  );
  document.querySelectorAll('.section .reveal, .metrics-strip.reveal').forEach((node) => {
    node.classList.add('awaiting');
    revealObserver.observe(node);
  });
}

/* ==========================================================================
   5. Live 3D Particle Terrain & Acoustic Shockwave Canvas (#stage-canvas)
   ========================================================================== */

const canvas = element('stage-canvas');
let shockwaveEnergy = 0.6;
let shockwaveRadius = 0;

function triggerStageShockwave(strength = 1.25) {
  shockwaveEnergy = Math.min(2.2, shockwaveEnergy + strength);
  shockwaveRadius = 0.05;
}

element('soundwave-burst')?.addEventListener('click', () => {
  triggerStageShockwave(1.65);
});

if (canvas && canvas.getContext) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;
  let pointerX = 0;
  let pointerY = 0;
  let targetPX = 0;
  let targetPY = 0;

  // Build radial 3D particle ring + floating light motes inspired by LxMine's Mineradio stage
  const ringNodes = [];
  const rings = 9;
  for (let r = 1; r <= rings; r++) {
    const radius = r * 42;
    const count = r * 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + r * 0.19;
      ringNodes.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        dist: radius,
        angle,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  const dustMotes = Array.from({ length: 64 }, () => ({
    x: (Math.random() - 0.5) * 1100,
    y: -Math.random() * 460 - 20,
    z: (Math.random() - 0.5) * 900,
    size: 1.4 + Math.random() * 2.8,
    speed: 12 + Math.random() * 22,
    warm: Math.random() > 0.32,
  }));

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener(
    'pointermove',
    (e) => {
      targetPX = (e.clientX / Math.max(1, width) - 0.5) * 2;
      targetPY = (e.clientY / Math.max(1, height) - 0.5) * 2;
    },
    { passive: true },
  );

  resizeCanvas();

  let lastFrame = performance.now();

  function drawStage(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (!document.hidden && !motionPreference.matches) {
      const t = now * 0.0014;
      pointerX += (targetPX - pointerX) * 0.05;
      pointerY += (targetPY - pointerY) * 0.05;

      if (shockwaveEnergy > 0.01) {
        shockwaveRadius += dt * 420;
        shockwaveEnergy *= Math.pow(0.28, dt);
      }

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5 + pointerX * 28;
      const cy = height * 0.62 + pointerY * 18;
      const fov = 560;
      const rotY = t * 0.22 + pointerX * 0.28;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const tiltX = 0.52 + pointerY * 0.06;
      const cosX = Math.cos(tiltX);
      const sinX = Math.sin(tiltX);

      // Project & render terrain ring nodes
      for (let i = 0; i < ringNodes.length; i++) {
        const n = ringNodes[i];
        const wave =
          Math.sin(n.dist * 0.032 - t * 2.6) * 18 +
          Math.cos(n.angle * 3 + t * 1.7) * 8;
        const shockDiff = Math.abs(n.dist - shockwaveRadius);
        const shockLift =
          shockwaveEnergy > 0.02 && shockDiff < 95
            ? Math.cos((shockDiff / 95) * (Math.PI * 0.5)) * 46 * shockwaveEnergy
            : 0;
        const yWorld = 95 - wave - shockLift;

        const rx = n.x * cosY - n.z * sinY;
        const rz = n.x * sinY + n.z * cosY;
        const ry = yWorld * cosX - rz * sinX;
        const tz = yWorld * sinX + rz * cosX + 540;

        if (tz < 80) continue;
        const scale = fov / tz;
        const sx = cx + rx * scale;
        const sy = cy + ry * scale;
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;

        const normCore = Math.max(0, 1 - n.dist / 390);
        const alpha = Math.min(0.72, (0.12 + normCore * 0.36 + shockLift * 0.008) * scale);
        const size = Math.max(1.3, (2.6 + normCore * 2.2) * scale);

        ctx.fillStyle =
          normCore > 0.52
            ? `rgba(244, 210, 138, ${alpha.toFixed(3)})`
            : `rgba(218, 230, 255, ${(alpha * 0.78).toFixed(3)})`;
        ctx.fillRect(sx - size * 0.5, sy - size * 0.5, size, size);
      }

      // Floating glowing stardust cubes
      for (let i = 0; i < dustMotes.length; i++) {
        const m = dustMotes[i];
        m.y -= m.speed * dt * (1 + shockwaveEnergy * 0.9);
        if (m.y < -480) m.y = 60;

        const rx = m.x * cosY - m.z * sinY;
        const rz = m.x * sinY + m.z * cosY + 520;
        if (rz < 90) continue;
        const scale = fov / rz;
        const sx = cx + rx * scale;
        const sy = cy + m.y * scale;
        const sz = m.size * scale;
        const fade = Math.min(1, Math.max(0, (m.y + 480) / 140)) * 0.55;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(t * 0.8 + i);
        ctx.fillStyle = m.warm
          ? `rgba(255, 226, 168, ${fade.toFixed(3)})`
          : `rgba(235, 244, 255, ${(fade * 0.85).toFixed(3)})`;
        ctx.fillRect(-sz * 0.5, -sz * 0.5, sz, sz);
        ctx.restore();
      }
    }

    requestAnimationFrame(drawStage);
  }

  if (!motionPreference.matches) {
    requestAnimationFrame(drawStage);
  }
}

document.addEventListener('visibilitychange', () => {
  applyRecordingPlayback();
});
motionPreference.addEventListener('change', (event) => {
  if (event.matches) {
    userPaused = true;
    karaokePlaying = false;
    renderKaraokeState();
    applyRecordingPlayback();
  }
});
