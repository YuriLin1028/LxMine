import {
  releaseApi,
  platforms,
  normalizeRelease,
  selectAsset,
  makeDownloadUrl,
  formatSize,
} from './releases.js';

const el = (id) => document.getElementById(id);

let currentRelease = null;
let currentPlatform = detectPlatform();
let currentVariant = 'setup';
let currentSource = 'gh-proxy';

function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/HarmonyOS|OpenHarmony/i.test(ua)) return 'harmony';
  if (/Android/i.test(ua)) return 'android';
  return 'windows';
}

function updateHeroCta() {
  const label = el('hero-download-label');
  if (!label) return;
  if (currentPlatform === 'android') label.textContent = '下载 Android 版';
  else if (currentPlatform === 'harmony') label.textContent = '获取 HarmonyOS 版';
  else label.textContent = '下载 Windows 版';
}

function renderDownloadConsole() {
  const meta = platforms[currentPlatform] || platforms.windows;
  el('platform-name').textContent = meta.name;
  el('platform-req').textContent = meta.requirements;
  el('platform-note').textContent = meta.note;

  document.querySelectorAll('.platform-tab').forEach((btn) => {
    const active = btn.dataset.platform === currentPlatform;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  const variantsEl = el('windows-variants');
  variantsEl.classList.toggle('is-hidden', currentPlatform !== 'windows');
  document.querySelectorAll('.variant-chip').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.variant === currentVariant);
  });

  document.querySelectorAll('.mirror-pill').forEach((btn) => {
    const active = btn.dataset.source === currentSource;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', String(active));
  });

  if (!currentRelease) return;

  const asset = selectAsset(currentRelease, currentPlatform, currentVariant);
  const btn = el('download-button');
  const btnLabel = el('download-button-label');
  const sizeEl = el('asset-size');
  const nameEl = el('asset-name');
  const digestEl = el('asset-digest');

  if (asset) {
    btn.href = makeDownloadUrl(asset, currentSource);
    const actionLabel = currentPlatform === 'windows' && currentVariant === 'portable'
      ? '下载 Windows 便携版'
      : meta.action;
    btnLabel.textContent = actionLabel;
    sizeEl.textContent = formatSize(asset.size);
    nameEl.textContent = asset.name;
    digestEl.textContent = asset.digest || '未提供校验值';
  } else {
    btn.href = currentRelease.url;
    btnLabel.textContent = '前往 GitHub Releases';
    sizeEl.textContent = '—';
    nameEl.textContent = '—';
    digestEl.textContent = '—';
  }
}

async function loadRelease() {
  try {
    const res = await fetch('./release.json', { cache: 'no-cache' });
    if (res.ok) {
      currentRelease = normalizeRelease(await res.json());
      applyReleaseHeader();
      renderDownloadConsole();
    }
  } catch (_) {}

  try {
    const res = await fetch(releaseApi, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.ok) {
      const live = normalizeRelease(await res.json());
      currentRelease = live;
      applyReleaseHeader();
      renderDownloadConsole();
    }
  } catch (_) {}
}

function applyReleaseHeader() {
  if (!currentRelease) return;
  const tag = currentRelease.tag;
  el('hero-version').textContent = tag;
  el('topbar-cta').textContent = `获取 ${tag}`;
  el('release-tag').textContent = tag;
  el('release-date').textContent = String(currentRelease.publishedAt || '').slice(0, 10) || '—';
  el('release-page-link').href = currentRelease.url;
}

function bindEvents() {
  const topbar = el('topbar');
  const onScroll = () => topbar.classList.toggle('is-scrolled', window.scrollY > 12);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  document.querySelectorAll('.platform-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentPlatform = btn.dataset.platform;
      renderDownloadConsole();
    });
  });

  document.querySelectorAll('.variant-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentVariant = btn.dataset.variant;
      renderDownloadConsole();
    });
  });

  document.querySelectorAll('.mirror-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSource = btn.dataset.source;
      renderDownloadConsole();
    });
  });

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.winTheme;
      document.querySelectorAll('.theme-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      el('win-preview-dark').classList.toggle('is-visible', mode === 'dark');
      el('win-preview-light').classList.toggle('is-visible', mode === 'light');
    });
  });

  const video = el('product-demo');
  const toggleBtn = el('demo-toggle');
  if (video && toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (video.paused) {
        video.play().catch(() => {});
        toggleBtn.textContent = '暂停';
      } else {
        video.pause();
        toggleBtn.textContent = '播放';
      }
    });
  }

  const copyBtn = el('copy-digest');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const text = el('asset-digest').textContent.trim();
      if (!text || text === '—' || text.includes('未提供')) return;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = '已复制';
        setTimeout(() => { copyBtn.textContent = '复制 SHA-256'; }, 1800);
      } catch (_) {}
    });
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach((node) => observer.observe(node));
}

updateHeroCta();
bindEvents();
renderDownloadConsole();
loadRelease();
