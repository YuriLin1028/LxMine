export const releaseApi = 'https://api.github.com/repos/YuriLin1028/LxMine/releases/latest';

export const downloadSources = Object.freeze({
  'gh-proxy': 'https://gh-proxy.org/',
  ghfast: 'https://ghfast.top/',
  github: '',
});

export const platforms = Object.freeze({
  windows: {
    name: 'LxMine for Windows',
    requirements: 'Windows 10 / 11 · x64',
    note: '安装包尚未进行商业代码签名，Windows 可能显示“未知发布者”。',
    action: '下载 Windows 安装版',
  },
  android: {
    name: 'LxMine for Android',
    requirements: 'Android 8.0 及以上 · APK',
    note: '首次安装时，请允许浏览器安装应用。Android 13 及以上支持液态玻璃交互。',
    action: '下载 Android 版',
  },
  harmony: {
    name: 'LxMine for HarmonyOS',
    requirements: '手机 / 平板 / 车机 · HiCar HAP',
    note: '此 HAP 为未签名车机兼容包，需先自行签名安装；手机与平板用户推荐直接使用上方华为应用市场邀请测试。',
    action: '下载未签名 HAP',
  },
});

export function validateAssetUrl(value) {
  try {
    const url = new URL(value);
    decodeURIComponent(url.pathname);
    return url.origin === 'https://github.com'
      && url.pathname.startsWith('/YuriLin1028/LxMine/releases/download/')
      && url.pathname.split('/').length === 7
      && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function normalizeRelease(data) {
  if (!data || data.draft || data.prerelease || !Array.isArray(data.assets)) {
    throw new Error('Invalid stable release');
  }
  if (typeof data.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?$/.test(data.tag_name)) {
    throw new Error('Invalid release version');
  }
  const baseTagMatch = data.tag_name.match(/^v?(\d+\.\d+\.\d+)/i);
  const baseTag = baseTagMatch ? `v${baseTagMatch[1]}` : data.tag_name;
  const releaseUrl = new URL(data.html_url);
  if (releaseUrl.origin !== 'https://github.com'
      || (releaseUrl.pathname !== `/YuriLin1028/LxMine/releases/tag/${data.tag_name}` && releaseUrl.pathname !== `/YuriLin1028/LxMine/releases/tag/${baseTag}`)
      || releaseUrl.username || releaseUrl.password || releaseUrl.search || releaseUrl.hash) {
    throw new Error('Invalid release page');
  }
  const assets = data.assets.filter((asset) => {
    if (typeof asset?.name !== 'string' || !validateAssetUrl(asset.browser_download_url)) return false;
    const url = new URL(asset.browser_download_url);
    const urlTag = decodeURIComponent(url.pathname.split('/').at(-2));
    return decodeURIComponent(url.pathname.split('/').at(-1)) === asset.name
      && (urlTag === data.tag_name || urlTag === baseTag)
      && Number.isSafeInteger(asset.size) && asset.size > 0;
  }).map((asset) => ({
    name: asset.name,
    size: asset.size,
    browser_download_url: asset.browser_download_url,
    digest: /^sha256:[a-f\d]{64}$/i.test(asset.digest || '') ? asset.digest.slice(7).toLowerCase() : null,
  }));
  return { tag: baseTag, url: releaseUrl.href, publishedAt: data.published_at, assets };
}

export function selectAsset(release, platform, variant = 'setup') {
  const suffixes = {
    windows: variant === 'portable' ? 'Portable.exe' : 'Setup.exe',
    android: 'Android.apk',
    harmony: 'HiCar-unsigned.hap',
  };
  const suffix = suffixes[platform];
  if (!suffix || !release.tag) return null;
  const version = release.tag.replace(/^v/, '');
  const filename = `LxMine-${version}-${suffix}`.toLowerCase();
  return release.assets.find((asset) => asset.name.toLowerCase() === filename) ?? null;
}

export function makeDownloadUrl(asset, source) {
  if (!validateAssetUrl(asset?.browser_download_url)) throw new Error('Invalid download URL');
  if (!Object.hasOwn(downloadSources, source)) throw new Error('Unknown download source');
  return downloadSources[source] + asset.browser_download_url;
}

export function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
