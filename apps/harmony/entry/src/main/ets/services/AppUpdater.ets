import { http } from '@kit.NetworkKit';
import { fileIo, picker } from '@kit.CoreFileKit';
import { bundleManager, common, Want } from '@kit.AbilityKit';
import { PRODUCT_NAME, VERSION_NAME } from 'BuildProfile';

export const UPDATE_REPO: string = 'YuriLin1028/LxMine';
export const HARMONY_INVITE_URL: string =
  'https://appgallery.huawei.com/link/invite-test-wap?taskId=7181c9f3cfda4854dc2f0d8fec00ab40&invitationCode=1Klp9jEJXOp';

export function isStoreEdition(): boolean {
  return PRODUCT_NAME.toString() === 'store';
}

export function currentHarmonyVersion(): string {
  return VERSION_NAME.toString().replace(/^v/i, '');
}

export interface UpdateAsset {
  name: string;
  size: number;
  downloadUrl: string;
  digest: string;
}

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  tagName: string;
  hasUpdate: boolean;
  publishedAt: string;
  notes: string;
  releaseUrl: string;
  asset: UpdateAsset | null;
}

export interface UpdateProgress {
  mirror: string;
  received: number;
  total: number;
  percent: number;
}

interface MirrorEntry {
  name: string;
  prefix: string;
}

interface RawReleaseAsset {
  name?: string;
  size?: number;
  browser_download_url?: string;
  digest?: string;
  updated_at?: string;
}

interface RawReleasePayload {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: RawReleaseAsset[];
}

interface ReleaseResult {
  idx: number;
  data: RawReleasePayload;
}

const RELEASE_ENDPOINTS: string[] = [
  `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`,
  `https://gh-proxy.org/https://raw.githubusercontent.com/${UPDATE_REPO}/gh-pages/release.json`,
  `https://ghfast.top/https://raw.githubusercontent.com/${UPDATE_REPO}/gh-pages/release.json`,
  'https://yurilin1028.github.io/LxMine/release.json',
];

const DOWNLOAD_MIRRORS: MirrorEntry[] = [
  { name: 'GH-Proxy', prefix: 'https://gh-proxy.org/' },
  { name: 'GHFast', prefix: 'https://ghfast.top/' },
  { name: 'GitHub', prefix: '' },
];

export function compareVersions(a: string, b: string): number {
  const parse = (raw: string): number[] => {
    const core = raw.trim().replace(/^v/i, '').split(/[-+]/)[0];
    return core.split('.').map((part: string) => {
      const n = parseInt(part, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function validateAssetUrl(url: string): boolean {
  return url.startsWith(`https://github.com/${UPDATE_REPO}/releases/download/`) &&
    !url.includes('?') && !url.includes('#');
}

async function fetchReleaseEndpoint(url: string): Promise<RawReleasePayload | null> {
  const client = http.createHttp();
  try {
    const res = await client.request(url, {
      method: http.RequestMethod.GET,
      header: {
        'User-Agent': 'LxMine-Updater/1.1',
        'Accept': 'application/vnd.github+json, application/json',
      },
      connectTimeout: 8000,
      readTimeout: 8500,
      expectDataType: http.HttpDataType.STRING,
    });
    if (res.responseCode !== 200 || typeof res.result !== 'string') return null;
    const parsed = JSON.parse(res.result) as RawReleasePayload;
    if (!parsed || parsed.draft || parsed.prerelease) return null;
    if (!parsed.tag_name || !Array.isArray(parsed.assets)) return null;
    return parsed;
  } catch (_) {
    return null;
  } finally {
    client.destroy();
  }
}

export async function checkHarmonyUpdate(): Promise<AppUpdateInfo> {
  const current = currentHarmonyVersion();
  const tasks = RELEASE_ENDPOINTS.map(async (endpoint: string, idx: number): Promise<ReleaseResult | null> => {
    const data = await fetchReleaseEndpoint(endpoint);
    return data ? { idx, data } : null;
  });
  const settled = await Promise.all(tasks);
  const valid: ReleaseResult[] = [];
  for (const item of settled) {
    if (item !== null) valid.push(item);
  }
  if (!valid.length) {
    throw new Error('无法连接更新服务器，请检查网络');
  }
  valid.sort((a: ReleaseResult, b: ReleaseResult) => {
    const cmp = compareVersions(b.data.tag_name ?? '', a.data.tag_name ?? '');
    if (cmp !== 0) return cmp;
    return a.idx - b.idx;
  });
  const best = valid[0].data;
  const tagName = best.tag_name ?? '';
  const latest = tagName.replace(/^v/i, '');
  const assets: UpdateAsset[] = [];
  for (const raw of (best.assets ?? [])) {
    const name = raw.name ?? '';
    const url = raw.browser_download_url ?? '';
    if (!name || !validateAssetUrl(url)) continue;
    const rawDigest = raw.digest ?? '';
    const digest = /^sha256:[a-f\d]{64}$/i.test(rawDigest) ? rawDigest.slice(7).toLowerCase() : '';
    assets.push({ name, size: Number(raw.size) || 0, downloadUrl: url, digest });
  }
  const exactName = `lxmine-${latest}-hicar-unsigned.hap`;
  const picked = assets.find((a: UpdateAsset) => a.name.toLowerCase() === exactName)
    ?? assets.find((a: UpdateAsset) => a.name.toLowerCase().endsWith('.hap'))
    ?? null;
  const pickedRaw = picked ? (best.assets ?? []).find((r: RawReleaseAsset) => (r.name ?? '') === picked.name) : undefined;
  const cmp = compareVersions(latest, current);
  let sameVersionNewer = false;
  if (cmp === 0 && picked) {
    try {
      const selfInfo = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT);
      const remoteMs = Date.parse((pickedRaw?.updated_at ?? '') || (best.published_at ?? '')) || 0;
      if (remoteMs > 0 && selfInfo.updateTime > 0 && remoteMs > selfInfo.updateTime + 120000) {
        sameVersionNewer = true;
      }
    } catch (_) {}
  }

  return {
    currentVersion: current,
    latestVersion: latest,
    tagName,
    hasUpdate: cmp > 0 || sameVersionNewer,
    publishedAt: best.published_at ?? '',
    notes: (best.body ?? '').trim(),
    releaseUrl: best.html_url ?? `https://github.com/${UPDATE_REPO}/releases/tag/${tagName}`,
    asset: picked,
  };
}

let activeUpdateClient: http.HttpRequest | null = null;
let updateDownloadCancelled: boolean = false;

export function cancelHarmonyUpdateDownload(): void {
  updateDownloadCancelled = true;
  if (activeUpdateClient) {
    try { activeUpdateClient.destroy(); } catch (_) {}
    activeUpdateClient = null;
  }
}

async function streamDownloadToTemp(
  url: string,
  tempPath: string,
  mirrorName: string,
  expectedSize: number,
  onProgress: (p: UpdateProgress) => void
): Promise<number> {
  try { if (fileIo.accessSync(tempPath)) fileIo.unlinkSync(tempPath); } catch (_) {}
  const file = fileIo.openSync(tempPath, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
  const client = http.createHttp();
  activeUpdateClient = client;
  let received = 0;
  let total = expectedSize;
  let lastEmit = 0;
  let streamErr: Error | null = null;

  const ended = new Promise<void>((resolve, reject) => {
    client.on('dataEnd', () => resolve());
    client.on('headersReceive', (raw: Object) => {
      const headers = raw as Record<string, string>;
      const cl = Number(headers['content-length'] || headers['Content-Length']) || 0;
      if (cl > 0) total = cl;
    });
    client.on('dataReceive', (bytes: ArrayBuffer) => {
      if (updateDownloadCancelled) return;
      try {
        fileIo.writeSync(file.fd, bytes);
        received += bytes.byteLength;
        const now = Date.now();
        if (now - lastEmit > 160) {
          lastEmit = now;
          const percent = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0;
          onProgress({ mirror: mirrorName, received, total, percent });
        }
      } catch (err) {
        streamErr = err as Error;
        reject(streamErr);
        client.destroy();
      }
    });
  });
  ended.catch(() => {});

  try {
    const code = await client.requestInStream(url, {
      method: http.RequestMethod.GET,
      header: { 'User-Agent': 'LxMine-Updater/1.1', 'Accept-Encoding': 'identity' },
      usingCache: false,
      connectTimeout: 20000,
      readTimeout: 120000,
    });
    if (updateDownloadCancelled) throw new Error('已取消下载');
    if (code !== 200 && code !== 206) throw new Error(`HTTP ${code}`);
    await ended;
    if (streamErr !== null) throw new Error((streamErr as Error).message || '写入文件失败');
    if (updateDownloadCancelled) throw new Error('已取消下载');
    if (received <= 0 || (total > 0 && received < total)) throw new Error('安装包下载不完整');
    fileIo.fsyncSync(file.fd);
  } finally {
    try { fileIo.closeSync(file.fd); } catch (_) {}
    client.destroy();
    if (activeUpdateClient === client) activeUpdateClient = null;
  }

  // Reject HTML error pages masquerading as HAP
  const probe = fileIo.openSync(tempPath, fileIo.OpenMode.READ_ONLY);
  const head = new ArrayBuffer(Math.min(64, received));
  try { fileIo.readSync(probe.fd, head); } finally { fileIo.closeSync(probe.fd); }
  const prefix = Array.from(new Uint8Array(head)).map((b: number) => String.fromCharCode(b)).join('').trim().toLowerCase();
  if (prefix.startsWith('<!doctype') || prefix.startsWith('<html') || prefix.startsWith('{')) {
    try { fileIo.unlinkSync(tempPath); } catch (_) {}
    throw new Error('镜像返回了非安装包内容');
  }
  onProgress({ mirror: mirrorName, received, total: received, percent: 100 });
  return received;
}

export async function downloadHapToCache(
  context: common.UIAbilityContext,
  asset: UpdateAsset,
  onProgress: (p: UpdateProgress) => void
): Promise<string> {
  if (!validateAssetUrl(asset.downloadUrl)) {
    throw new Error('无效的安装包地址');
  }
  updateDownloadCancelled = false;
  const safeName = asset.name.replace(/[^\w.\-]/g, '_');
  const tempPath = `${context.cacheDir}/${safeName}`;
  let lastError: Error | null = null;

  for (const mirror of DOWNLOAD_MIRRORS) {
    if (updateDownloadCancelled) throw new Error('已取消下载');
    onProgress({ mirror: mirror.name, received: 0, total: asset.size, percent: 0 });
    try {
      await streamDownloadToTemp(mirror.prefix + asset.downloadUrl, tempPath, mirror.name, asset.size, onProgress);
      return tempPath;
    } catch (err) {
      lastError = err as Error;
      if (updateDownloadCancelled) throw new Error('已取消下载');
    }
  }
  throw new Error(`下载失败：${lastError ? lastError.message : '所有镜像源均不可用'}`);
}

export async function saveCachedHapToUserLocation(
  context: common.UIAbilityContext,
  cachedPath: string,
  suggestedName: string
): Promise<boolean> {
  const uris = await new picker.DocumentViewPicker(context).save({ newFileNames: [suggestedName] });
  if (!uris.length) return false;
  let src: fileIo.File | null = null;
  let dst: fileIo.File | null = null;
  try {
    src = await fileIo.open(cachedPath, fileIo.OpenMode.READ_ONLY);
    dst = await fileIo.open(uris[0], fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
    await fileIo.copyFile(src.fd, dst.fd);
    await fileIo.fsync(dst.fd);
    return true;
  } finally {
    if (src) try { fileIo.closeSync(src.fd); } catch (_) {}
    if (dst) try { fileIo.closeSync(dst.fd); } catch (_) {}
  }
}

export async function openAppGalleryInviteTest(context: common.UIAbilityContext, targetUrl?: string): Promise<void> {
  const url = (targetUrl && targetUrl.startsWith('https://appgallery.huawei.com/')) ? targetUrl : HARMONY_INVITE_URL;
  try {
    await context.openLink(url, { appLinkingOnly: false });
    return;
  } catch (_) {}
  const want: Want = {
    action: 'ohos.want.action.viewData',
    entities: ['entity.system.browsable'],
    uri: url,
  };
  await context.startAbility(want);
}
