import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harmony = path.resolve(desktop, '../harmony');
const stage = path.join(desktop, 'public/mine-stage');
const output = path.join(harmony, 'entry/src/main/resources/rawfile/mine-stage');
fs.mkdirSync(output, { recursive: true });
const loader = fs.readFileSync(path.join(stage, 'js/index-loader.js'), 'utf8');
const match = loader.match(/const modulePaths = (\[[\s\S]*?\]);/);
if (!match) throw new Error('Cannot find MineRadio module list');
const paths = vm.runInNewContext(match[1]);
const modules = paths.map(name => fs.readFileSync(path.join(stage, name), 'utf8'));
fs.cpSync(stage, output, { recursive: true });
fs.writeFileSync(path.join(output, 'mine-stage-engine.js'), modules.join('\n;\n'));
let html = fs.readFileSync(path.join(stage, 'index.html'), 'utf8');
if (!html.includes('id="canvas-container"') || !html.includes('js/index-loader.js')) throw new Error('MineRadio stage entry is missing its canvas or engine loader');
html = html.replace(/<link\s+href="https:\/\/fonts\.googleapis\.com[^>]+>/, '');
html = html.replace('<script src="js/preload-mode.js"></script>', `<script>window.__LXMINE_NATIVE_STAGE=true;window.lxMusic={};window.__lxmineFetch=window.fetch.bind(window);window.fetch=function(url,options){if(new URL(typeof url==='string'?url:url.url,location.href).pathname.startsWith('/api/'))return Promise.resolve({ok:false,status:503,json:async function(){return {}},text:async function(){return ''}});return window.__lxmineFetch(url,options)};</script>`);
html = html.replace('<script src="js/index-loader.js"></script>', '<script src="mine-stage-engine.js"></script><script src="mine-stage-bridge.js"></script><script src="mine-stage-touch.js"></script>');
html = html.replace('</head>', `<style>
html,body,#desktop-window-shell,#canvas-container{width:100%;height:100%;margin:0;overflow:hidden;background:#0C0E14}
body>:not(#desktop-window-shell){display:none!important}
#desktop-window-shell>:not(#canvas-container):not(#album-bg):not(#album-bg-next):not(#custom-bg):not(#wallpaper-engine-layer){display:none!important}
#canvas-container{position:fixed!important;inset:0!important;opacity:1!important;visibility:visible!important;transform:none!important}
</style></head>`);
fs.writeFileSync(path.join(output, 'harmony-stage.html'), html);
fs.copyFileSync(path.join(stage, 'mine-stage-bridge.js'), path.join(output, 'mine-stage-bridge.js'));
fs.copyFileSync(path.join(stage, 'mine-stage-touch.js'), path.join(output, 'mine-stage-touch.js'));
for (const name of ['LICENSE', 'NOTICE.md']) fs.copyFileSync(path.join(desktop, name), path.join(output, name));
const presetSource = fs.readFileSync(path.join(stage, 'js/modules/07-fx/00-preset-archive-data.js'), 'utf8');
const presets = vm.runInNewContext(presetSource.match(/var presetMeta = (\[[\s\S]*?\]);/)[1]);
const modes = presets.map((preset, index) => ({ id: `mine-${index}`, label: preset.name + (index === 7 ? ' · 地形' : index === 8 ? ' · 工坊' : '') }));
fs.writeFileSync(path.join(harmony, 'entry/src/main/ets/model/MineRadioModes.ets'), `// Generated from MineRadio's actual preset registry.\nexport interface MineRadioMode { id: string; label: string; }\nexport const MINE_RADIO_MODES: MineRadioMode[] = ${JSON.stringify(modes, null, 2)};\n`);
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ engine: 'MineRadio', upstreamCommit: 'd43de565acabfdc1a9c9820a27e81a98ccbebcef', modules: paths.length, presets: modes, sha256: crypto.createHash('sha256').update(modules.join('\n;\n')).digest('hex') }, null, 2));
console.log(`LxMine Harmony stage: ${paths.length} shared MineRadio modules, ${modes.length} presets`);

const runtime = path.join(harmony, 'entry/src/main/resources/rawfile/lx-runtime');
fs.copyFileSync(path.join(desktop, 'shared/lx-discovery.cjs'), path.join(runtime, 'lx-discovery.js'));
fs.copyFileSync(path.join(desktop, 'shared/lx-catalogue.cjs'), path.join(runtime, 'lx-catalogue.js'));
fs.copyFileSync(path.join(desktop, 'public/lxmine/pagination.js'), path.join(runtime, 'lx-pagination.js'));
fs.copyFileSync(path.join(desktop, 'shared/lx-playlists.cjs'), path.join(runtime, 'lx-playlists.js'));
fs.copyFileSync(path.join(desktop, 'node_modules/json5/dist/index.min.js'), path.join(runtime, 'vendor/json5.min.js'));

// Native launch uses the desktop's actual shader, particles, typography and timeline.
const splashDocument = fs.readFileSync(path.join(stage, 'index.html'), 'utf8');
const splashStart = splashDocument.indexOf('<div id="splash">');
const splashEnd = splashDocument.indexOf('<div id="hint"', splashStart);
if (splashStart < 0 || splashEnd <= splashStart) throw new Error('MineRadio startup markup is missing');
const splashMarkup = splashDocument.slice(splashStart, splashEnd);
const splashCss = fs.readFileSync(path.join(stage, 'css/index.css'), 'utf8');
const splashScript = fs.readFileSync(path.join(stage, 'js/modules/10-shell/03-splash.js'), 'utf8');
const startupHtml = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>LxMine</title><style>' + splashCss + 'html,body{width:100%;height:100%;margin:0;background:#000;overflow:hidden}#splash{position:fixed;inset:0}</style></head><body>' + splashMarkup + '<script>var startupFastSkipPreference=false;function markAppPerf(){} function prewarmHomeWallpaperPreview(){} function revealIdleParticles(){} function shouldUseIdleWallpaperPreview(){return false}</script><script>' + splashScript + '</script><script>finishSplashReveal=function(){if(window.__lxStartup)window.__lxStartup.done()};setTimeout(function(){if(!splashReadyToEnter)markSplashReadyToEnter();dismissSplash()},5200);</script></body></html>';
fs.writeFileSync(path.join(output, 'harmony-startup.html'), startupHtml);
