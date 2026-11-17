import { releaseApi, platforms, normalizeRelease, selectAsset, makeDownloadUrl, formatSize } from './releases.js?v=20261118';

const element = (id) => document.getElementById(id);
const tabs = [...document.querySelectorAll('[data-platform]')];
const variants = [...document.querySelectorAll('[data-variant]')];
const sourceSelect = element('download-source');
const downloadButton = element('download-button');
let release = null;
let currentAsset = null;
let platform = /Android/i.test(navigator.userAgent) ? 'android' : 'windows';
if (/HarmonyOS|OpenHarmony/i.test(navigator.userAgent)) platform = 'harmony';
let variant = 'setup';

function renderDownload() {
  const info = platforms[platform];
  element('platform-name').textContent = info.name;
  element('platform-requirements').textContent = info.requirements;
  element('platform-note').textContent = info.note;
  element('variant-options').hidden = platform !== 'windows';
  element('download-content').setAttribute('aria-labelledby', `tab-${platform}`);
  element('harmony-invite').hidden = platform !== 'harmony' || Date.now() > Date.parse('2026-12-16T12:46:00+08:00');
  tabs.forEach((tab) => {
    const active = tab.dataset.platform === platform;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  variants.forEach((button) => {
    const active = button.dataset.variant === variant;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('is-selected', active);
  });
  if (!release) {
    downloadButton.removeAttribute('href');
    downloadButton.setAttribute('aria-disabled', 'true');
    downloadButton.textContent = '正在获取下载信息';
    element('file-name').textContent = '正在连接 GitHub Releases';
    element('file-size').textContent = '';
    element('direct-link').href = 'https://github.com/YuriLin1028/LxMine/releases/latest';
    element('direct-link').textContent = '前往 GitHub Releases ↗';
    element('file-checksum').textContent = '等待文件信息';
    element('copy-checksum').disabled = true;
    return;
  }

  currentAsset = selectAsset(release, platform, variant);
  element('copy-status').textContent = '';
  downloadButton.replaceChildren();
  if (!currentAsset) {
    downloadButton.textContent = '此版本暂无对应安装包';
    downloadButton.removeAttribute('href');
    downloadButton.setAttribute('aria-disabled', 'true');
    element('file-name').textContent = '请到 GitHub Releases 查看其他版本';
    element('file-size').textContent = '';
    element('direct-link').href = release.url;
    element('direct-link').textContent = '查看 GitHub Releases ↗';
    element('file-checksum').textContent = '此版本暂无对应文件';
    element('copy-checksum').disabled = true;
    return;
  }

  downloadButton.removeAttribute('aria-disabled');
  downloadButton.href = makeDownloadUrl(currentAsset, sourceSelect.value);
  const label = platform === 'windows' && variant === 'portable' ? '下载 Windows 便携版' : info.action;
  downloadButton.append(document.createTextNode(label));
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '↓';
  downloadButton.append(arrow);
  element('file-name').textContent = currentAsset.name;
  element('file-size').textContent = formatSize(currentAsset.size);
  element('direct-link').href = currentAsset.browser_download_url;
  element('direct-link').textContent = sourceSelect.value === 'github' ? '在 GitHub 查看此版本 ↗' : '使用 GitHub 直连 ↗';
  if (sourceSelect.value === 'github') element('direct-link').href = release.url;
  element('file-checksum').textContent = currentAsset.digest || '此文件尚未提供 SHA-256，请从 GitHub Release 获取校验文件。';
  element('copy-checksum').disabled = !currentAsset.digest;
}

function useRelease(data, live = false) {
  release = normalizeRelease(data);
  document.querySelectorAll('[data-release-version]').forEach((node) => { node.textContent = release.tag; });
  document.querySelectorAll('[data-release-link]').forEach((node) => { node.href = release.url; });
  const date = new Date(release.publishedAt);
  const dateText = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
  }).format(date);
  element('release-status').textContent = `${release.tag} · ${dateText} ${live ? '已同步 GitHub Releases' : '发布快照'}`;
  renderDownload();
}

async function fetchJson(url, timeout = 6500) {
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
  // The bundled snapshot makes downloads work even when GitHub's API is unreachable.
  try {
    useRelease(await fetchJson(new URL('./release.json', import.meta.url), 4000));
  } catch {
    element('release-status').textContent = '正在连接 GitHub Releases';
  }
  for (const url of [releaseApi, `https://gh-proxy.org/${releaseApi}`]) {
    try {
      useRelease(await fetchJson(url), true);
      return;
    } catch {
      // Keep a coherent published snapshot while trying the next public source.
    }
  }
  if (release) {
    element('release-status').textContent = `${release.tag} · 发布快照，可前往 GitHub 检查最新版本`;
  } else {
    element('release-status').textContent = '更新信息暂不可用，可直接前往 GitHub Releases';
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
    platform = tab.dataset.platform;
    renderDownload();
  });
  tab.addEventListener('keydown', (event) => {
    const positions = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (!Object.hasOwn(positions, event.key)) return;
    event.preventDefault();
    const next = tabs[positions[event.key]];
    next.focus();
    next.click();
  });
});
variants.forEach((button) => button.addEventListener('click', () => {
  variant = button.dataset.variant;
  renderDownload();
}));
sourceSelect.addEventListener('change', renderDownload);
element('copy-checksum').addEventListener('click', async () => {
  if (!currentAsset?.digest) return;
  try {
    await navigator.clipboard.writeText(currentAsset.digest);
    element('copy-status').textContent = '已复制';
  } catch {
    element('copy-status').textContent = '可选中上方校验值复制';
  }
});

renderDownload();
refreshRelease();

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.remove('awaiting');
      entry.target.classList.add('in-view');
      observer.unobserve(entry.target);
    }
  }, { threshold: .08 });
  document.querySelectorAll('.section .reveal, .site-footer .reveal').forEach((node) => {
    node.classList.add('awaiting');
    observer.observe(node);
  });
}

const productVideo = element('product-demo');
const enlargedVideo = element('stage-recording');
const motionButton = element('motion-toggle');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const recordings = {
  stage: { src: './assets/windows-stage-1.1.0.mp4', poster: './assets/windows-stage-1.1.0.webp', label: '粒子舞台', description: 'Windows 1.1.0 播放录屏，展示粒子舞台与逐字歌词' },
  lyrics: { src: './assets/windows-lyrics-1.1.0.mp4', poster: './assets/windows-lyrics-1.1.0.webp', label: '逐字歌词', description: 'Windows 1.1.0 播放录屏，展示歌词随播放逐字亮起' },
};
let userPaused = motionPreference.matches;
let recordingVisible = !('IntersectionObserver' in window);
let playbackRequest = 0;

function updateRecordingControls() {
  document.querySelector('.hero').dataset.motionPaused = String(userPaused || !recordingVisible || document.hidden);
  motionButton.textContent = userPaused ? '播放演示' : '暂停演示';
  motionButton.setAttribute('aria-pressed', String(userPaused));
  motionButton.setAttribute('aria-label', userPaused ? '播放实际录屏' : '暂停实际录屏');
}

function applyRecordingPlayback() {
  const request = ++playbackRequest;
  updateRecordingControls();
  if (userPaused || !recordingVisible || document.hidden) {
    productVideo.pause();
    return;
  }
  productVideo.play().catch(() => {
    if (request !== playbackRequest) return;
    userPaused = true;
    updateRecordingControls();
  });
}

motionButton.addEventListener('click', () => {
  userPaused = !userPaused;
  applyRecordingPlayback();
});
document.querySelectorAll('[data-scene]').forEach((button) => button.addEventListener('click', () => {
  const recording = recordings[button.dataset.scene];
  productVideo.poster = recording.poster;
  productVideo.src = recording.src;
  productVideo.setAttribute('aria-label', recording.description);
  productVideo.load();
  element('recording-link').href = recording.src;
  element('scene-name').textContent = recording.label;
  document.querySelectorAll('[data-scene]').forEach((option) => {
    const selected = option === button;
    option.classList.toggle('is-selected', selected);
    option.setAttribute('aria-pressed', String(selected));
  });
  applyRecordingPlayback();
}));
motionPreference.addEventListener('change', (event) => {
  if (event.matches) {
    userPaused = true;
    enlargedVideo.pause();
    applyRecordingPlayback();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) enlargedVideo.pause();
  applyRecordingPlayback();
});
if ('IntersectionObserver' in window) {
  const videoObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === productVideo) {
        recordingVisible = entry.isIntersecting;
        applyRecordingPlayback();
      } else if (!entry.isIntersecting) {
        enlargedVideo.pause();
      }
    }
  }, { threshold: .15 });
  videoObserver.observe(productVideo);
  videoObserver.observe(enlargedVideo);
}
applyRecordingPlayback();
