/* LxMine PC stage: a lightweight Three.js recreation of the tablet
   particle/terrain backdrop. It is intentionally independent from the old
   MineRadio engine so the new renderer stays small and predictable. */
(function () {
  'use strict';
  const stage = { ready: false, playing: false, style: 'mine-7', colors: ['#6f8f83', '#d8c07b', '#16252b'], intensity: 0 };
  let renderer, scene, camera, particles, hills, hillData = [], light, clock;
  let width = 1, height = 1, raf = 0, lastHill = 0;
  const COLORS = [
    ['#6f8f83', '#d8c07b', '#16252b'],
    ['#6a8fd8', '#e0b6ff', '#141a2d'],
    ['#d8a06a', '#f4d28a', '#2a1813'],
    ['#4fb7b2', '#c6f0e1', '#0c1d20'],
    ['#c27b9b', '#f2c7d8', '#24131a']
  ];

  function init(canvas) {
    if (!window.THREE || !canvas) return;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080a0c, 0.055);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 5.4, 14.2);
    camera.lookAt(0, -0.4, 0);
    clock = new THREE.Clock();

    scene.add(new THREE.HemisphereLight(0xb9d6d0, 0x0a0c10, 0.55));
    light = new THREE.PointLight(0xf4d28a, 1.6, 26, 2);
    light.position.set(0, 4.2, 2.4);
    scene.add(light);
    const back = new THREE.PointLight(0x6f9bd8, 0.9, 24, 2);
    back.position.set(-5, 2, -4);
    scene.add(back);

    buildParticles();
    buildHills();
    applyStyle(stage.style);
    resize();
    window.addEventListener('resize', resize);
    stage.ready = true;
    animate();
  }

  function resize() {
    if (!renderer) return;
    width = window.innerWidth; height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function buildParticles() {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = Math.random() * 12 - 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 22 - 3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xf4efe4, size: 0.055, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
    particles = new THREE.Points(geometry, material);
    scene.add(particles);
  }

  function buildHills() {
    const group = new THREE.Group();
    const size = 24, step = 1.15, geometry = new THREE.BoxGeometry(0.5, 1, 0.5);
    const count = Math.ceil(size / step) * Math.ceil(size / step);
    const material = new THREE.MeshStandardMaterial({ color: 0x5d746c, emissive: 0x172522, emissiveIntensity: 0.5, roughness: 0.46, metalness: 0.12, transparent: true, opacity: 0.88 });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let i = 0;
    for (let x = -size / 2; x < size / 2; x += step) {
      for (let z = -size / 2; z < size / 2; z += step) {
        const h = hillHeight(x, z);
        dummy.position.set(x, h / 2 - 2.35, z);
        dummy.scale.set(1, Math.max(0.15, h), 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        color.setHSL(0.38 + (h % 0.2) * 0.3, 0.25, 0.55 + (h % 0.1) * 0.9);
        mesh.setColorAt(i, color);
        hillData.push({ x, z, h, phase: Math.random() * Math.PI * 2 });
        i += 1;
      }
    }
    hills = { group, mesh, dummy, count };
    group.add(mesh);
    scene.add(group);
  }

  function hillHeight(x, z) {
    const r = Math.sqrt(x * x + z * z);
    const mound = Math.max(0, 1 - r / 7.2);
    const base = Math.sin(x * 0.36) * Math.cos(z * 0.31) * 0.4 + Math.sin((x + z) * 0.17) * 0.25;
    return Math.max(0.1, base * (0.3 + mound) + mound * mound * 1.15);
  }

  function applyStyle(style) {
    stage.style = style || 'mine-7';
    const index = parseInt(String(stage.style).replace('mine-', ''), 10) || 0;
    setColors(COLORS[index % COLORS.length]);
    if (!hills) return;
    const terrain = index === 7 || index === 8 || index === 9 || index === 0;
    hills.mesh.visible = true;
    hills.mesh.material.opacity = terrain ? 0.92 : 0.3;
    hills.mesh.material.emissiveIntensity = terrain ? 0.55 : 0.8;
    particles.material.size = index === 5 ? 0.085 : 0.055;
    particles.material.opacity = index === 3 ? 0.4 : 0.72;
  }

  function setColors(colors) {
    if (!colors || !colors.length) return;
    stage.colors = colors;
    const dim = (hex, factor) => {
      try {
        const value = String(hex || '').replace('#', '');
        const r = parseInt(value.slice(0, 2), 16), g = parseInt(value.slice(2, 4), 16), b = parseInt(value.slice(4, 6), 16);
        return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v * factor))).toString(16).padStart(2, '0')).join('');
      } catch (_) { return '#4c615a'; }
    };
    document.documentElement.style.setProperty('--stage-a', dim(colors[0], 0.55));
    document.documentElement.style.setProperty('--stage-b', dim(colors[1], 0.55));
    document.documentElement.style.setProperty('--stage-c', dim(colors[2] || '#16252b', 0.5));
    if (light) light.color.set(dim(colors[1], 0.8));
    if (hills) {
      hills.mesh.material.color.set(dim(colors[0], 0.78));
      hills.mesh.material.emissive.set(dim(colors[0], 0.34));
    }
    if (particles) particles.material.color.set(dim(colors[1], 0.85));
  }

  function setPlaying(value) {
    stage.playing = !!value;
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    if (!renderer || !scene) return;
    const t = clock.getElapsedTime();
    const energy = stage.playing ? 0.55 + Math.sin(t * 2.1) * 0.18 + Math.sin(t * 5.3) * 0.07 : 0.2;
    stage.intensity += (energy - stage.intensity) * 0.04;
    if (particles) {
      particles.rotation.y = t * 0.012;
      particles.rotation.x = Math.sin(t * 0.06) * 0.04;
      particles.position.y = Math.sin(t * 0.3) * 0.12;
      particles.material.opacity = (stage.style === 'mine-3' ? 0.4 : 0.72) * (0.8 + stage.intensity * 0.3);
    }
    if (hills) {
      hills.group.rotation.y = Math.sin(t * 0.045) * 0.05;
      if (performance.now() - lastHill > 90) {
        lastHill = performance.now();
        for (let i = 0; i < hillData.length; i += 1) {
          const d = hillData[i];
          const wave = Math.sin(t * 0.9 + d.phase) * 0.06 + Math.sin(t * 1.7 + d.x * 0.2) * 0.04;
          const h = Math.max(0.12, d.h * (0.85 + stage.intensity * 0.35) + wave);
          hills.dummy.position.set(d.x, h / 2 - 2.35, d.z);
          hills.dummy.scale.set(1, h, 1);
          hills.dummy.updateMatrix();
          hills.mesh.setMatrixAt(i, hills.dummy.matrix);
        }
        hills.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (camera) {
      camera.position.x = Math.sin(t * 0.08) * 0.45;
      camera.position.y = 5.4 + Math.sin(t * 0.12) * 0.12;
      camera.lookAt(0, -0.4, 0);
    }
    if (light) light.intensity = 1.0 + stage.intensity * 0.8;
    renderer.render(scene, camera);
  }

  window.LxStage = { init, setColors, setPlaying, setStyle: applyStyle };
})();
