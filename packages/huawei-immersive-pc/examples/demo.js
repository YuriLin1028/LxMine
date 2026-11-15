/* Interactive showcase. No build step, no network. */
(function () {
  'use strict';

  var $ = function (selector, scope) { return (scope || document).querySelector(selector); };
  var $$ = function (selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); };

  /* ---------------------------------------------------------------------
     Live backdrop: the canvas is a real Chromium backdrop, not a texture.
     The grid and the oversized type give the optical filter something legible
     to refract.
     --------------------------------------------------------------------- */
  var canvas = $('#aurora');
  var ctx = canvas.getContext('2d');
  var dpr = 1;
  var width = 0;
  var height = 0;
  var lastPaint = 0;

  function resizeScene() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.max(2, Math.round(width * dpr));
    canvas.height = Math.max(2, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function blob(x, y, radius, color) {
    var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function paintScene(time) {
    var t = time / 1000;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    blob(width * (0.28 + Math.sin(t * 0.13) * 0.07), height * (0.34 + Math.cos(t * 0.11) * 0.06),
      Math.max(width, height) * 0.36, 'rgba(42, 128, 126, 0.34)');
    blob(width * (0.72 + Math.cos(t * 0.09) * 0.08), height * (0.42 + Math.sin(t * 0.17) * 0.07),
      Math.max(width, height) * 0.32, 'rgba(207, 157, 78, 0.25)');
    blob(width * (0.54 + Math.sin(t * 0.07 + 1.4) * 0.1), height * (0.76 + Math.cos(t * 0.12) * 0.04),
      Math.max(width, height) * 0.4, 'rgba(39, 74, 143, 0.28)');
    blob(width * (0.18 + Math.cos(t * 0.16) * 0.04), height * (0.72 + Math.sin(t * 0.08) * 0.05),
      Math.max(width, height) * 0.22, 'rgba(104, 55, 129, 0.18)');
    ctx.globalCompositeOperation = 'source-over';
  }

  window.addEventListener('resize', resizeScene, { passive: true });
  resizeScene();

  /* ---------------------------------------------------------------------
     Frame meter. The standard's hard budget is P95 < 33.5 ms, max < 50 ms,
     long tasks 0. This demo reports; CI uses tools/smoke.cjs for assertions.
     --------------------------------------------------------------------- */
  var intervals = [];
  var lastFrame = 0;
  var lastHud = 0;
  var longTasks = 0;

  if (window.PerformanceObserver) {
    try {
      new PerformanceObserver(function (list) {
        longTasks += list.getEntries().length;
      }).observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  }

  function updateHud(p95) {
    var stats = window.HxMaterial ? window.HxMaterial.stats : { hosts: 0, filters: 0 };
    $('#hud-fps').textContent = p95 ? p95.toFixed(1) + ' ms' : '—';
    $('#hud-long').textContent = String(longTasks);
    $('#hud-hosts').textContent = stats.hosts + ' / ' + stats.filters;
    $('#hud-hosts').title = 'surface / cached filters';
  }

  function frameLoop(time) {
    requestAnimationFrame(frameLoop);
    if (document.hidden) { lastFrame = time; return; }
    if (lastFrame) {
      intervals.push(time - lastFrame);
      if (intervals.length > 180) intervals.shift();
    }
    lastFrame = time;

    if (time - lastPaint > 33) {
      paintScene(time);
      lastPaint = time;
    }
    if (time - lastHud > 500) {
      var sorted = intervals.slice().sort(function (a, b) { return a - b; });
      var p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
      updateHud(p95);
      lastHud = time;
    }
  }
  requestAnimationFrame(frameLoop);

  /* ---------------------------------------------------------------------
     Shared feedback
     --------------------------------------------------------------------- */
  var toastTimer = 0;
  function toast(message) {
    var node = $('#toast');
    node.textContent = message;
    node.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('is-show'); }, 2400);
  }

  $('#grid-toggle').addEventListener('click', function () {
    var on = document.body.classList.toggle('show-grid');
    this.setAttribute('aria-pressed', String(on));
  });
  document.body.classList.add('show-grid');

  $$('[data-fake]').forEach(function (button) {
    button.addEventListener('click', function () {
      var action = button.getAttribute('data-fake');
      if (action === 'maximize') {
        document.body.classList.toggle('hx-maximized');
        toast(document.body.classList.contains('hx-maximized') ? '最大化：移除窗口圆角' : '还原：恢复 20px 窗口圆角');
      } else {
        toast('演示页面不控制真实窗口；Electron 中调用 win.' +
          (action === 'close' ? 'close()' : 'minimize()') + '()');
      }
    });
  });

  /* ---------------------------------------------------------------------
     Anchored menus
     --------------------------------------------------------------------- */
  var quality = '320k';
  var qualities = [
    ['128k', '标准 128k'],
    ['320k', '高品质 320k'],
    ['flac', '无损 FLAC']
  ];

  function qualityItems() {
    return qualities.map(function (entry) {
      return {
        label: entry[1],
        checked: quality === entry[0],
        action: function () {
          quality = entry[0];
          $('#quality-value').textContent = entry[1];
          toast('音质切换为 ' + entry[1]);
        }
      };
    });
  }

  var queueAction = function () { openQueueSheet(); };
  var downloadAction = function () { toast('已加入下载队列（演示）'); };

  $('#quality-btn').addEventListener('click', function () {
    window.HxPopup.openMenu(this, qualityItems(), { ariaLabel: '选择音质' });
  });

  function openMoreMenu(anchor) {
    window.HxPopup.openMenu(anchor, [
      { label: '播放队列', action: queueAction },
      { label: '歌曲信息', action: function () { toast('Night Walk · 03:42 · FLAC 48kHz'); } },
      { label: '下载', action: downloadAction },
      { separator: true },
      { label: '添加到歌单', action: function () { toast('已添加到「Night Drive」'); } }
    ], { ariaLabel: '歌曲更多操作' });
  }

  $('#bottom-menu-btn').addEventListener('click', function () {
    openMoreMenu(this);
  });
  var dockMore = $('#demo-dock [aria-label="更多"]');
  if (dockMore) dockMore.addEventListener('click', function () { openMoreMenu(this); });

  /* ---------------------------------------------------------------------
     Modal + bottom sheet
     --------------------------------------------------------------------- */
  function openModalDemo() {
    var content = [
      '<div class="demo-modal">',
      '<h2>新建歌单</h2>',
      '<p>浮层使用 30px 圆角、520ms 弹入。焦点进入第一个可操作元素，Esc 关闭并返回触发器。</p>',
      '<input type="text" placeholder="歌单名称" value="Night Drive" aria-label="歌单名称">',
      '<div class="demo-actions">',
      '<button class="demo-button hx-glass hx-light" type="button" data-close>取消</button>',
      '<button class="demo-button hx-glass hx-light is-primary" type="button" data-confirm>创建</button>',
      '</div></div>'
    ].join('');
    var session = window.HxSurfaces.openModal({ content: content, ariaLabel: '新建歌单' });
    $('[data-close]', session.node).addEventListener('click', function () { session.close(); });
    $('[data-confirm]', session.node).addEventListener('click', function () {
      session.close();
      toast('歌单已创建（演示）');
    });
  }

  function openQueueSheet() {
    var tracks = [
      ['Night Walk', 'LxMine · Immersive Mix'],
      ['Glass Horizon', 'LxMine · Immersive Mix'],
      ['Slow Reflection', 'LxMine · Immersive Mix']
    ];
    var rows = tracks.map(function (track) {
      return '<button type="button"><span class="art"></span><span><strong>' +
        track[0] + '</strong><small>' + track[1] + '</small></span></button>';
    }).join('');
    var content = '<div class="demo-sheet"><h2>播放队列</h2><p>底部抽屉：540ms 弹入、240ms 收起，顶部 32px 圆角与 38×4px 抓取条。</p>' +
      '<div class="demo-queue">' + rows + '</div></div>';
    var session = window.HxSurfaces.openSheet({ content: content, ariaLabel: '播放队列', className: 'demo-sheet' });
    $$('.demo-queue button', session.node).forEach(function (row) {
      row.addEventListener('click', function () {
        session.close();
        toast('已切换到「' + $('strong', row).textContent + '」');
      });
    });
  }

  $('#modal-btn').addEventListener('click', openModalDemo);
  $('#sheet-btn').addEventListener('click', openQueueSheet);

  $('#help-btn').addEventListener('click', function () {
    var content = [
      '<div class="demo-modal"><h2>这个示例验证什么</h2>',
      '<p>材质采样实时 backdrop，文字层独立；指针追光在离开控件时归零；胶囊上下沿有横向肩部位移；气泡菜单以触发器中点为原点；弹出 740ms、收起 150ms；所有浮层有键盘路径。</p>',
      '<p style="margin-top:12px">运行 <code>npm run validate</code> 检查文件与规范常量，运行 <code>npm run smoke</code> 用 Chromium 实际点击、截图并检查几何与时序。</p>',
      '<div class="demo-actions"><button class="demo-button hx-glass hx-light" type="button" data-close>知道了</button></div></div>'
    ].join('');
    var session = window.HxSurfaces.openModal({ content: content, ariaLabel: '关于示例' });
    $('[data-close]', session.node).addEventListener('click', function () { session.close(); });
  });

  /* ---------------------------------------------------------------------
     Search: one node morphs from pill to centered field and back.
     --------------------------------------------------------------------- */
  var searchOpen = false;
  var searchClosing = false;
  var searchAnimation = null;

  function openSearch() {
    if (searchOpen || searchClosing) return;
    searchOpen = true;
    var node = $('#demo-search');
    var from = node.getBoundingClientRect();
    node.classList.add('is-overlay-search');
    $('#search-overlay-host').appendChild(node);
    var overlay = $('#search-overlay');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    void node.offsetWidth;
    var to = node.getBoundingClientRect();
    searchAnimation = window.HxSurfaces.morph(node, from, {
      toRect: to,
      radiusFrom: '25px',
      radiusTo: '29px',
      duration: 460,
      fromOpacity: 0.9
    });
    function focusSearch() {
      if (!searchOpen) return;
      var input = $('#demo-search-input');
      input.focus({ preventScroll: true });
      input.select();
    }
    setTimeout(focusSearch, 40);
    // A late overlay close or window focus restoration must not leave the
    // expanded search without a caret.
    setTimeout(focusSearch, 220);
  }

  function closeSearch() {
    if (!searchOpen || searchClosing) return;
    searchOpen = false;
    searchClosing = true;
    var node = $('#demo-search');
    var slot = $('#search-slot');
    var from = node.getBoundingClientRect();

    // Lift the node out of the fading overlay so the reverse morph stays fully
    // opaque while the backdrop dissolves underneath it.
    document.body.appendChild(node);
    node.style.position = 'fixed';
    node.style.left = from.left + 'px';
    node.style.top = from.top + 'px';
    node.style.width = from.width + 'px';
    node.style.height = from.height + 'px';
    node.style.margin = '0';
    node.style.zIndex = '65';

    var overlay = $('#search-overlay');
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    var to = slot.getBoundingClientRect();
    var animation = window.HxSurfaces.morph(node, from, {
      toRect: to,
      direction: 'close',
      radiusFrom: '29px',
      radiusTo: '25px',
      duration: 460,
      fromOpacity: 0.35
    });

    var finish = function () {
      slot.appendChild(node);
      node.removeAttribute('style');
      node.classList.remove('is-overlay-search');
      if (animation) { try { animation.cancel(); } catch (_) {} }
      searchAnimation = null;
      searchClosing = false;
      var input = $('#demo-search-input');
      input.value = '';
      input.blur();
    };
    if (animation) animation.finished.then(finish).catch(finish);
    else finish();
  }

  $('#demo-search').addEventListener('click', function (event) {
    if (event.target.tagName !== 'INPUT') openSearch();
  });
  $('#demo-search-input').addEventListener('focusin', openSearch);
  $('#demo-search-input').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      openSearch();
      toast('搜索「' + (this.value || '歌曲') + '」（演示）');
    }
  });
  $('#search-overlay').addEventListener('click', function (event) {
    if (event.target === this) closeSearch();
  });
  $$('.search-results button').forEach(function (button) {
    button.addEventListener('click', function () {
      var text = this.firstChild.textContent.trim();
      closeSearch();
      toast('打开「' + text + '」（演示）');
    });
  });

  /* ---------------------------------------------------------------------
     Stage choreography: dock first, background reveal after 620 ms,
     exit hold 140 ms then 620 ms return.
     --------------------------------------------------------------------- */
  var stageOpen = false;
  var stageTimers = [];
  function clearStageTimers() {
    stageTimers.forEach(clearTimeout);
    stageTimers = [];
  }

  function openStage() {
    if (stageOpen) return;
    if (searchOpen) closeSearch();
    stageOpen = true;
    clearStageTimers();
    var stage = $('#demo-stage');
    document.body.classList.remove('is-stage-leaving');
    document.body.classList.add('is-stage-open', 'is-stage-entering');
    stage.setAttribute('aria-hidden', 'false');
    stageTimers.push(setTimeout(function () {
      document.body.classList.remove('is-stage-entering');
    }, 620));
  }

  function closeStage() {
    if (!stageOpen) return;
    stageOpen = false;
    clearStageTimers();
    document.body.classList.remove('is-stage-entering');
    stageTimers.push(setTimeout(function () {
      document.body.classList.add('is-stage-leaving');
    }, 140));
    stageTimers.push(setTimeout(function () {
      document.body.classList.remove('is-stage-open', 'is-stage-leaving');
      $('#demo-stage').setAttribute('aria-hidden', 'true');
    }, 620));
  }

  $('#stage-btn').addEventListener('click', openStage);
  $('#stage-back').addEventListener('click', closeStage);
  $('#demo-dock .hx-dock__cover').addEventListener('click', openStage);
  $('#demo-dock .hx-dock__copy').addEventListener('click', openStage);

  /* ---------------------------------------------------------------------
     Playback toggle
     --------------------------------------------------------------------- */
  $('#play-btn').addEventListener('click', function () {
    var playing = document.body.classList.toggle('is-playing');
    $('#play-icon').style.display = playing ? 'none' : '';
    $('#pause-icon').style.display = playing ? '' : 'none';
    this.setAttribute('aria-label', playing ? '暂停' : '播放');
  });

  /* ---------------------------------------------------------------------
     Global Escape layering. Popup/modal handlers are installed in capture
     phase and stop propagation, so they win before this handler.
     --------------------------------------------------------------------- */
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (stageOpen) { closeStage(); return; }
    if (searchOpen) { closeSearch(); }
  });

  /* Initial HUD after auto-install has decorated the page. Startup includes
     one-time filter rasterization; the meter reports steady state afterwards. */
  setTimeout(function () {
    if (window.HxMaterial) {
      window.HxMaterial.refreshAll();
      updateHud(0);
    }
  }, 120);
  setTimeout(function () {
    intervals.length = 0;
    longTasks = 0;
    lastFrame = 0;
  }, 1500);
})();
