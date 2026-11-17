import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Import the browser's dependency-free release logic without changing the repo's module type.
const source = await readFile(resolve(root, 'website/releases.js'), 'utf8');
const { normalizeRelease, selectAsset, makeDownloadUrl, validateAssetUrl } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const snapshot = JSON.parse(await readFile(resolve(root, 'website/release.json'), 'utf8'));
const release = normalizeRelease(snapshot);

for (const [platform, variant, extension] of [
  ['windows', 'setup', '-Setup.exe'],
  ['windows', 'portable', '-Portable.exe'],
  ['android', 'setup', '-Android.apk'],
  ['harmony', 'setup', '-HiCar-unsigned.hap'],
]) {
  const asset = selectAsset(release, platform, variant);
  assert.ok(asset?.name.endsWith(extension), `Correct package for ${platform}/${variant}`);
  assert.match(asset.digest, /^[a-f\d]{64}$/);
  assert.equal(makeDownloadUrl(asset, 'github'), asset.browser_download_url);
  assert.equal(makeDownloadUrl(asset, 'gh-proxy'), `https://gh-proxy.org/${asset.browser_download_url}`);
  assert.equal(makeDownloadUrl(asset, 'ghfast'), `https://ghfast.top/${asset.browser_download_url}`);
}

assert.equal(selectAsset({ assets: [] }, 'android'), null);
assert.equal(validateAssetUrl('https://github.com.evil.test/YuriLin1028/LxMine/releases/download/v1.1.0/file.apk'), false);
assert.equal(validateAssetUrl('https://github.com/someone/Other/releases/download/v1.1.0/file.apk'), false);
assert.equal(validateAssetUrl('javascript:alert(1)'), false);
assert.equal(validateAssetUrl('https://github.com/YuriLin1028/LxMine/releases/download/v1.1.0/%XX.apk'), false);
assert.throws(() => normalizeRelease({ ...snapshot, draft: true }));
assert.throws(() => normalizeRelease({ ...snapshot, prerelease: true }));
assert.throws(() => normalizeRelease({ ...snapshot, html_url: 'https://example.com/release' }));
const mismatched = structuredClone(snapshot);
mismatched.assets[0].browser_download_url = mismatched.assets[0].browser_download_url.replace('/v1.1.0/', '/v0.0.1/');
assert.equal(normalizeRelease(mismatched).assets.length, release.assets.length - 1);
assert.equal(normalizeRelease({ ...snapshot, assets: [null, ...snapshot.assets] }).assets.length, release.assets.length);
const legacyAssets = snapshot.assets.map(({ digest, ...asset }) => asset);
assert.ok(normalizeRelease({ ...snapshot, assets: legacyAssets }).assets.every((asset) => asset.digest === null));
const unsupportedArchitecture = { ...release, assets: [{ ...selectAsset(release, 'windows'), name: 'LxMine-1.1.0-arm64-Setup.exe' }] };
assert.equal(selectAsset(unsupportedArchitecture, 'windows'), null);

const html = await readFile(resolve(root, 'website/index.html'), 'utf8');
const websiteMark = await readFile(resolve(root, 'website/assets/lm-mark.svg'), 'utf8');
const officialMark = await readFile(resolve(root, 'apps/desktop/build/lm-mark.svg'), 'utf8');
assert.equal(websiteMark.trim(), officialMark.trim(), 'The website must use the official LxMine LM mark');
assert.deepEqual(await readFile(resolve(root, 'website/assets/icon.png')), await readFile(resolve(root, 'apps/desktop/build/icon.png')));
for (const match of html.matchAll(/(?:src|href|poster)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)) {
  await readFile(resolve(root, 'website', match[1]));
}
assert.ok(html.includes('https://github.com/YuriLin1028/LxMine'));
assert.ok(html.includes('© 2026 咩霸与贡献者 · GPL-3.0-only'));
assert.ok(html.includes('id="product-demo" src="./assets/stage-demo.mp4"'));
assert.ok(html.includes('./assets/android-lyrics.webp'));
assert.ok(!html.includes('phone-player.jpeg'));
console.log(`Website checks passed. ${release.assets.length} release assets, four platform/variant routes, two mirrors, release validation and local assets.`);
