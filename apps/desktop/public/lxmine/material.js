/* LxMine optical surfaces. Original implementation; no captured screen textures.
   One backdrop pass samples the real Chromium backdrop, including live video/canvas.
   R/G encode the contour normal; B weights the separately sampled environmental rim.
   Defaults are fitted to EXQUISITE native on/off captures in qa/material. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const states = new Map(), cache = new Map();
  let serial = 0, resizeFrame = 0, motionFrame = 0, lastTime = 0, pointer = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // CSS-pixel units, fitted jointly to the grid and text references. The native
  // normal-field measurements are retained in qa/material/artifacts/inferred-*.
  let optical = { sigma: 1.9, edgeSigma: 1.9, amplitude: 4, amplitudeCap: 90, decay: 2.5, tangentGain: .12, tangentCap: 8, tangentDecay: 2.5, resultSigma: .75, alpha: .15, saturation: 1.25, envWeight: 1, envStart: .25, envWidth: 2, envOffset: 0, envLift: 0, envSlope: 1, menu: { alpha: .88, color: [26,28,31] }, sheet: { sigma: 4, alpha: .88, color: [26,28,31] }, popup: {sigma:5,edgeSigma:5,alpha:.71,color:[30,30,30]} };
  const defs = document.querySelector('.glass-filter-defs defs');
  const svg = (name, attributes, parent) => {
    const n = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([k, v]) => n.setAttribute(k, v));
    parent.append(n); return n;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function materialProfile(kind) {
    const {menu,sheet,popup,...base}=optical;
    return Object.assign(base, kind === 'popup'?popup:kind === 'menu' ? menu : kind === 'sheet' ? sheet : {});
  }
  function lens(width, height, radii, kind) {
    const profile=materialProfile(kind);
    // Quantization keeps a resizing window from retaining hundreds of GPU filters.
    const w = Math.max(2, Math.round(width / 2) * 2), h = Math.max(2, Math.round(height / 2) * 2);
    const corners = radii.map(r => Math.round(Math.min(r, w / 2, h / 2)));
    const key = [w, h, ...corners, kind, JSON.stringify(profile)].join(':');
    if (cache.has(key)) return cache.get(key);
    const resolution = Math.min(profile.mapDensity || 1, 2048 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(w * resolution));
    canvas.height = Math.max(2, Math.round(h * resolution));
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(canvas.width, canvas.height);
    const environmentCanvas = document.createElement('canvas');
    environmentCanvas.width=canvas.width;environmentCanvas.height=canvas.height;
    const environmentContext=environmentCanvas.getContext('2d'),environmentPixels=environmentContext.createImageData(canvas.width,canvas.height);
    const displacementScale=Math.min(profile.amplitudeCap,h*profile.amplitude),environmentScale=64;
    // Deep inside the shape all encoded channels already round to their neutral
    // bytes. Bound each contribution below 1/8 of a byte; skipping its math is
    // byte-identical, rather than lowering map resolution or optical strength.
    const cutoff=(decay,gain)=>decay*Math.log(Math.max(1,gain*8));
    const neutralDepth=Math.max(cutoff(profile.decay,116),cutoff(profile.tangentDecay,profile.tangentCap*255/displacementScale),
      cutoff(profile.decay,Math.abs(profile.envOffset)*116/environmentScale),cutoff(profile.tangentDecay,profile.tangentCap*255/environmentScale),
      (profile.envStart||0)+profile.envWidth,profile.tintWidth||.75);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const px = (x + .5) / canvas.width * w - w / 2;
      const py = (y + .5) / canvas.height * h - h / 2;
      const r = corners[py < 0 ? (px < 0 ? 0 : 1) : (px < 0 ? 3 : 2)];
      const edgeX=w/2-Math.abs(px),edgeY=h/2-Math.abs(py);
      if((edgeX>=r||edgeY>=r)&&Math.min(edgeX,edgeY)>neutralDepth){
        const i=(y*canvas.width+x)*4;
        pixels.data[i]=128;pixels.data[i+1]=128;pixels.data[i+2]=0;pixels.data[i+3]=255;
        environmentPixels.data[i]=128;environmentPixels.data[i+1]=128;environmentPixels.data[i+2]=kind==='popup'?255:128;environmentPixels.data[i+3]=255;
        continue;
      }
      const qx = Math.abs(px) - (w / 2 - r), qy = Math.abs(py) - (h / 2 - r);
      const ax = Math.max(qx, 0), ay = Math.max(qy, 0), len = Math.hypot(ax, ay);
      const distance = r - (len + Math.min(Math.max(qx, qy), 0));
      let nx = 0, ny = 0;
      if (len > .001) { nx = ax / len * Math.sign(px); ny = ay / len * Math.sign(py); }
      else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
      // Measured convex shoulder: refraction decays before readable content.
      // No turbulence or animated noise is used to suggest a liquid surface.
      const bend = Math.exp(-Math.max(0, distance) / profile.decay);
      // Native straight shoulders also contract toward the control's centre.
      // A pure SDF normal leaves vertical stripes ruler-straight at top/bottom.
      // This measured tangential field decays inward and vanishes for circles;
      // both optical samples need it, including the otherwise clear outer rim.
      const tangentBend=Math.exp(-Math.max(0,distance)/profile.tangentDecay);
      const tx=-clamp(px*profile.tangentGain,-profile.tangentCap,profile.tangentCap)*(1-Math.abs(nx))*clamp((w-2*r)/Math.max(r,1),0,1)*tangentBend;
      const ty=-clamp(py*profile.tangentGain,-profile.tangentCap,profile.tangentCap)*(1-Math.abs(ny))*clamp((h-2*r)/Math.max(r,1),0,1)*tangentBend;
      const et = clamp((distance - (profile.envStart || 0)) / profile.envWidth, 0, 1);
      const clear = 1 - et * et * (3 - 2 * et);
      const i = (y * canvas.width + x) * 4;
      pixels.data[i] = Math.round(128 - nx * bend * 116 + tx/displacementScale*255);
      pixels.data[i + 1] = Math.round(128 - ny * bend * 116 + ty/displacementScale*255);
      pixels.data[i + 2] = Math.round(clear * 255);
      pixels.data[i + 3] = 255;
      environmentPixels.data[i]=Math.round(128+(tx+nx*bend*116/255*profile.envOffset)/environmentScale*255);
      environmentPixels.data[i+1]=Math.round(128+(ty+ny*bend*116/255*profile.envOffset)/environmentScale*255);
      const tintT=clamp(distance/(profile.tintWidth||.75),0,1);
      environmentPixels.data[i+2]=kind==='popup'?Math.round(tintT*tintT*(3-2*tintT)*255):128;environmentPixels.data[i+3]=255;
    }
    ctx.putImageData(pixels, 0, 0);
    environmentContext.putImageData(environmentPixels,0,0);
    const id = 'lm-lens-' + (++serial);
    const filter = svg('filter', { id, x: '0%', y: '0%', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' }, defs);
    svg('feImage', { href: canvas.toDataURL(), x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'lens' }, filter);
    // A small vector-field blur removes 8-bit contour steps without blurring
    // the source image. The rim mask still samples the unsmoothed lens B channel.
    const neutral = svg('feComponentTransfer', { in: 'lens', result: 'vectors' }, filter);
    for (const channel of ['R', 'G']) svg('feFunc' + channel, { type: 'linear', slope: 1, intercept: -1 / 510 }, neutral);
    svg('feImage',{href:environmentCanvas.toDataURL(),x:0,y:0,width:w,height:h,preserveAspectRatio:'none',result:'environmentLens'},filter);
    const environmentNeutral=svg('feComponentTransfer',{in:'environmentLens',result:'environmentVectors'},filter);
    for(const channel of ['R','G'])svg('feFunc'+channel,{type:'linear',slope:1,intercept:-1/510},environmentNeutral);
    svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: profile.sigma, result: 'diffuse' }, filter);
    svg('feDisplacementMap', { in: 'diffuse', in2: 'vectors', scale: displacementScale, xChannelSelector: 'R', yChannelSelector: 'G', result: 'refracted' }, filter);
    // 8-bit normal maps leave iso-value contour steps after displacement.
    // Native EXQUISITE has a smoother optical field; this small post-displacement
    // blur removes those steps while the rim mask remains independently sharp.
    let refractedResult = 'refracted';
    if (profile.resultSigma > 0) {
      svg('feGaussianBlur', { in: 'refracted', stdDeviation: profile.resultSigma, result: 'refractedSmooth' }, filter);
      refractedResult = 'refractedSmooth';
    }
    // Independently sampled environmental rim, mixed only in the narrow edge
    // band. Its direction and strength are fitted against native on/off pixels.
    const baseSigma = profile.sigma;
    const separateEdge = profile.edgeSigma !== baseSigma;
    if (separateEdge) svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: profile.edgeSigma, result: 'edgeDiffuse' }, filter);
    svg('feDisplacementMap', { in: separateEdge ? 'edgeDiffuse' : 'diffuse', in2: 'environmentVectors', scale: environmentScale, xChannelSelector: 'R', yChannelSelector: 'G', result: 'environment' }, filter);
    const lift = svg('feComponentTransfer', { in: 'environment', result: 'lit' }, filter);
    for (const channel of ['R', 'G', 'B']) svg('feFunc' + channel, { type: 'linear', slope: profile.envSlope, intercept: profile.envLift }, lift);
    svg('feColorMatrix', { in: 'lens', type: 'matrix', values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 ${profile.envWeight} 0 0`, result: 'rimMask' }, filter);
    svg('feComposite', { in: 'lit', in2: 'rimMask', operator: 'in', result: 'litRim' }, filter);
    svg('feComposite', { in: refractedResult, in2: 'rimMask', operator: 'out', result: 'inner' }, filter);
    svg('feComposite', { in: 'inner', in2: 'litRim', operator: 'arithmetic', k2: 1, k3: 1, result: 'optical' }, filter);
    svg('feColorMatrix', { in: 'optical', type: 'saturate', values: profile.saturation,result:'saturated' }, filter);
    if(kind==='popup') {
      // System Menu keeps its meniscus translucent instead of tinting the rim
      // with the same opacity as the readable centre.
      svg('feFlood',{'flood-color':`rgb(${(profile.color||[26,28,31]).join(',')})`,'flood-opacity':profile.alpha,result:'popupTint'},filter);
      svg('feColorMatrix',{in:'environmentLens',type:'matrix',values:'0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0',result:'popupTintMask'},filter);
      svg('feComposite',{in:'popupTint',in2:'popupTintMask',operator:'in',result:'popupInnerTint'},filter);
      svg('feComposite',{in:'popupInnerTint',in2:'saturated',operator:'over'},filter);
    }
    const entry = { id, filter, key };
    cache.set(key, entry);
    // Filters currently in use must survive cache pressure.
    if (cache.size > 96) for (const [k, e] of cache) {
      if (k !== key && ![...states.values()].some(s => s.key === k)) { e.filter.remove(); cache.delete(k); }
      if (cache.size <= 72) break;
    }
    return entry;
  }
  function measure(host) {
    if (!host.isConnected) return null;
    const w = host.offsetWidth, h = host.offsetHeight;
    if (w < 2 || h < 2) return null;
    const css = getComputedStyle(host);
    // Absolute children normally fill the padding box. The optical skin must
    // instead cover the entire border box, including transparent button borders.
    const inset = [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth]
      .map(value => -(parseFloat(value) || 0) + 'px').join(' ');
    const radii = [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomRightRadius, css.borderBottomLeftRadius]
      .map(raw => raw.includes('%') ? Math.min(w, h) * parseFloat(raw) / 100 : parseFloat(raw) || 0);
    const kind=host.matches('.modal') ? 'sheet' : host.matches('.anchored-menu')?'popup':host.matches('.popover') ? 'menu' : 'control';
    return {w,h,inset,radii,kind,borderRadius:css.borderRadius,panel:host.matches('.modal,.popover')};
  }
  function refresh(host, state, measured = measure(host)) {
    if(!measured)return;
    const {w,h,inset,radii,kind,borderRadius,panel}=measured;
    const profile=materialProfile(kind);
    const entry = lens(w, h, radii, kind);
    const signature=entry.id+'|'+inset+'|'+borderRadius;
    if(state.appliedSignature===signature)return;
    state.appliedSignature=signature;
    state.key = entry.key;
    state.surface.style.inset=inset;
    state.surface.style.setProperty('--lens-filter', `url(#${entry.id})`);
    const tint=`rgba(${(profile.color || [10,12,14]).join(',')},${profile.alpha})`;
    state.surface.style.backgroundColor = tint;
    if (kind !== 'control') host.style.backgroundColor = kind==='popup'?'transparent':tint;
    if (panel) host.style.setProperty('--lens-filter', `url(#${entry.id})`);
    state.surface.style.borderRadius = borderRadius;
    host.dataset.material = 'contour-lens';
  }
  const pending = new Set();
  function flushSkins() {
      resizeFrame = 0;
      // Snapshot every geometry before writing skins or SVG filters. Interleaved
      // reads/writes forced a new layout for each control during window resize.
      const updates=[...pending].map(el=>({el,state:states.get(el),measured:measure(el)}));
      pending.clear();
      const started=performance.now();
      for(let i=0;i<updates.length;i++){
        if(i>0&&performance.now()-started>=4){for(const update of updates.slice(i))pending.add(update.el);break;}
        const {el,state,measured}=updates[i];if(state)refresh(el,state,measured);
      }
      if(pending.size)resizeFrame=requestAnimationFrame(flushSkins);
  }
  function queue(host) {
    pending.add(host);
    if(!resizeFrame)resizeFrame=requestAnimationFrame(flushSkins);
  }
  const sizes = new ResizeObserver(entries => entries.forEach(e => queue(e.target)));
  function decorate(host) {
    if (states.has(host)) return;
    const surface = document.createElement('span');
    surface.className = 'glass-surface'; surface.setAttribute('aria-hidden', 'true');
    host.append(surface);
    states.set(host, { surface, key: '', x: 0, y: 0, sx: 1, sy: 1, vx: 0, vy: 0, vsx: 0, vsy: 0, target: [0, 0, 1, 1] });
    sizes.observe(host); queue(host);
  }
  function tree(root) {
    if (root.nodeType !== 1) return;
    if (root.matches('.glass')) decorate(root);
    root.querySelectorAll('.glass').forEach(decorate);
  }
  function install() {
    document.documentElement.style.setProperty('--hairline',`${1/devicePixelRatio}px`);
    tree(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) tree(node);
        const state = states.get(record.target);
        if (state && state.surface.parentNode !== record.target) record.target.append(state.surface);
      }
      for (const [el] of states) if (!el.isConnected) { sizes.unobserve(el); states.delete(el); }
    }).observe(document.body, { childList: true, subtree: true });
  }
  function animate(t) {
    motionFrame = 0;
    const dt = Math.min(.032, Math.max(.001, (t - (lastTime || t - 16)) / 1000)); lastTime = t;
    let moving = false;
    for (const s of states.values()) {
      const keys = ['x', 'y', 'sx', 'sy'], velocities = ['vx', 'vy', 'vsx', 'vsy'];
      keys.forEach((key, i) => {
        const vk = velocities[i], delta = s.target[i] - s[key];
        s[vk] += (380 * delta - 32 * s[vk]) * dt;
        s[key] += s[vk] * dt;
        if (Math.abs(delta) < .00015 && Math.abs(s[vk]) < .001) { s[key] = s.target[i]; s[vk] = 0; }
        else moving = true;
      });
      // Only the optical skin moves. Hit testing and readable content stay put.
      s.surface.style.transform = `translate(${s.x}px,${s.y}px) scale(${s.sx},${s.sy})`;
    }
    if (moving) motionFrame = requestAnimationFrame(animate); else lastTime = 0;
  }
  function target(state, values) {
    state.target = values;
    if (reduced.matches) { state.surface.style.transform = ''; return; }
    if (!motionFrame) motionFrame = requestAnimationFrame(animate);
  }
  function light(host, event) {
    const rect = host.getBoundingClientRect();
    host.style.setProperty('--mx', (event.clientX - rect.left) + 'px');
    host.style.setProperty('--my', (event.clientY - rect.top) + 'px');
  }
  function resetLight(host) {
    if (!host) return;
    host.style.removeProperty('--mx');
    host.style.removeProperty('--my');
  }
  function release(event) {
    // A synthetic blur or a pointer capture change can leave a stale pressed
    // class even when the original pointer id never reaches us. Always clear
    // the visual state; only the active pointer owns the spring target.
    if (!pointer) {
      document.querySelectorAll('.material-dragging,.light-active').forEach(el => el.classList.remove('material-dragging','light-active'));
      return;
    }
    if (event?.pointerId != null && event.pointerId !== pointer.id) {
      document.querySelectorAll('.material-dragging,.light-active').forEach(el => el.classList.remove('material-dragging','light-active'));
      pointer = null;
      return;
    }
    const { host, state } = pointer;
    host.classList.remove('light-active', 'material-dragging');
    target(state, [0, 0, 1, 1]); pointer = null;
  }
  function bindInteractions() {
    document.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.isPrimary === false || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
      const host = event.target.closest('.glass');
      if (!host || !states.has(host)) return;
      release();
      const state = states.get(host);
      pointer = { id: event.pointerId, host, state, x: event.clientX, y: event.clientY };
      light(host, event); host.classList.add('light-active', 'material-dragging');
      target(state, [0, 0, .997, .967]);
      // Deliberately don't capture: navigation scrub and range sliders retain
      // native pointer targets/click behaviour. Window-level release cleans up.
    }, { passive: true });
    document.addEventListener('pointermove', event => {
      const hover = event.target.closest('.glass.light');
      if (hover) light(hover, event);
      if (!pointer || pointer.id !== event.pointerId) return;
      light(pointer.host, event);
      const dx = clamp(event.clientX - pointer.x, -100, 100), dy = clamp(event.clientY - pointer.y, -70, 70);
      target(pointer.state, [dx * .025, dy * .025, .997 + Math.abs(dx) * .00003, .967 + Math.abs(dy) * .00012]);
    }, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release, { passive: true });
    window.addEventListener('blur', () => release());
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    document.addEventListener('pointerout', event => {
      const host = event.target.closest && event.target.closest('.glass.light');
      if (!host) return;
      const next = event.relatedTarget;
      if (next && host.contains(next)) return;
      resetLight(host);
    }, { passive: true });
    window.addEventListener('pointerleave', () => {
      document.querySelectorAll('.glass.light').forEach(resetLight);
    }, { passive: true });
  }
  window.LxGlass = { install, bindInteractions, prepare(host) {
    decorate(host);const state=states.get(host);if(state)refresh(host,state);
  } };
  // Only the isolated calibration page enables parameter sweeps. Normal app
  // windows cannot switch models through this interface.
  if (new URLSearchParams(location.search).has('materialLab')) {
    window.LxGlass.calibrate = values => {
      const previous = optical;
      optical = Object.assign({}, optical, values);
      for (const kind of ['menu', 'sheet','popup']) if (values[kind]) optical[kind] = Object.assign({}, previous[kind], values[kind]);
      for (const [host, state] of states) refresh(host, state);
    };
  }
})();
