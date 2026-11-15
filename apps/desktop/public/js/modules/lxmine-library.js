// LX sources and public catalogues share MineRadio's existing queue and visuals.
function lxMineSource(song) {
  if (!song || song.type === 'podcast' || song.type === 'local' || song.source === 'local') return '';
  return song.lxSource || ({ kuwo: 'kw', kugou: 'kg', netease: 'wy', qq: 'tx', migu: 'mg' })[song.provider || song.source] || '';
}

async function lxMineSearch(query, mode, previous) {
  var sources = ({ kuwo: ['kw'], netease: ['wy'], qq: ['tx'], kugou: ['kg'] })[mode] || ['kw', 'wy', 'tx', 'kg'];
  var state = Object.assign({}, previous || {});
  var active = sources.filter(function (source) { return !previous || !previous[source] || previous[source].hasMore; });
  var pages = await Promise.allSettled(active.map(function (source) {
    return window.lxMusic.search({ query: query, source: source, page: state[source] ? state[source].nextPage : 1, limit: 24 });
  }));
  var songs = [];
  var failed = [];
  active.forEach(function (source, index) {
    var result = pages[index];
    if (result.status !== 'fulfilled') {
      failed.push(source); state[source] = { hasMore: false, failed: true }; return;
    }
    var page = result.value;
    state[source] = { nextPage: page.page + 1, nextOffset: page.page * page.limit, total: page.total, hasMore: page.page * page.limit < page.total };
    songs.push.apply(songs, page.items);
  });
  if (failed.length === active.length && active.length) throw new Error('当前搜索平台不可用，请切换平台后重试');
  searchProviderNotice = failed.length ? '部分平台暂时不可用，已显示可用结果' : '';
  return { songs: songs, providerPages: state, hasMore: sources.some(function (source) { return state[source] && state[source].hasMore; }) };
}

function lxMineResolve(song, quality) { return window.lxMusic.resolve(song, quality); }

async function lxMineLyric(song) {
  var custom = null;
  try { custom = await window.lxMusic.lyric(song, '128k'); } catch (_) {}
  if (custom && (custom.lyric || custom.lxlyric || custom.yrc)) {
    return Object.assign({}, custom, { lyric: custom.lyric || '', yrc: custom.yrc || custom.lxlyric || '' });
  }
  if (lxMineSource(song) === 'kw') {
    var raw = await apiJson('/api/lxmine/kuwo/lyric?id=' + encodeURIComponent(song.id));
    return raw;
  }
  return apiJson(lyricEndpointForSong(song));
}

var lxMineLibraryBusy = false;
async function refreshLxMineSources() {
  if (!window.lxMusic) return;
  var snapshot = await window.lxMusic.sources();
  var select = document.getElementById('lxmine-search-source');
  if (select) {
    select.replaceChildren();
    if (!snapshot.sources.length) { var empty = document.createElement('option'); empty.value = ''; empty.textContent = '先添加音源'; select.appendChild(empty); }
    snapshot.sources.forEach(function (source) { var option = document.createElement('option'); option.value = source.id; option.textContent = source.name; option.selected = source.id === snapshot.activeId; select.appendChild(option); });
  }
  var list = document.getElementById('lxmine-source-list');
  list.replaceChildren();
  snapshot.sources.forEach(function (source) {
    var row = document.createElement('div'); row.className = 'lxmine-source-row';
    var label = document.createElement('div');
    var name = document.createElement('strong'); name.textContent = source.name;
    var detail = document.createElement('small'); detail.textContent = [source.version, source.author].filter(Boolean).join(' · ');
    label.append(name, detail); row.appendChild(label);
    var active = document.createElement('button'); active.textContent = source.id === snapshot.activeId ? '使用中' : '启用';
    active.disabled = source.id === snapshot.activeId;
    active.onclick = function () { lxMineLibraryAction(function () { return window.lxMusic.activateSource(source.id); }); };
    var remove = document.createElement('button'); remove.textContent = '删除';
    remove.onclick = function () { lxMineLibraryAction(function () { return window.lxMusic.removeSource(source.id); }); };
    row.append(active, remove); list.appendChild(row);
  });
  if (!snapshot.sources.length) list.textContent = '导入自己的 LX 音源脚本后即可解析播放地址。搜索和歌单导入无需平台账号。';
}

async function lxMineLibraryAction(action) {
  if (lxMineLibraryBusy) return;
  var status = document.getElementById('lxmine-library-status');
  lxMineLibraryBusy = true; status.textContent = '正在处理…';
  try { await action(); await refreshLxMineSources(); status.textContent = '已完成'; }
  catch (error) { status.textContent = String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /, ''); if (!document.getElementById('lxmine-library').open) showToast(status.textContent); }
  finally { lxMineLibraryBusy = false; }
}

function openLxMineLibrary() {
  if (!window.lxMusic) return;
  var dialog = document.getElementById('lxmine-library');
  if (!dialog.open) dialog.showModal();
  refreshLxMineSources().catch(function (error) { document.getElementById('lxmine-library-status').textContent = error.message; });
}

function importLxMineSourceFile() { return lxMineLibraryAction(function () { return window.lxMusic.importSourceFile(); }); }
function importLxMineSourceText() {
  return lxMineLibraryAction(async function () {
    var input = document.getElementById('lxmine-source-script');
    if (!input.value.trim()) throw new Error('请先粘贴音源脚本');
    await window.lxMusic.importSource(input.value); input.value = '';
  });
}
function importLxMinePlaylist() {
  return lxMineLibraryAction(async function () {
    var input = document.getElementById('lxmine-playlist-input');
    if (!input.value.trim()) throw new Error('请先输入歌单分享链接、ID 或 JSON');
    var result = await window.lxMusic.importPlaylist(input.value, document.getElementById('lxmine-playlist-source').value);
    applyBuiltInPlaylistSnapshot(result, { animate: true }); input.value = '';
    showToast('已导入 ' + result.importedLists + ' 个歌单，' + result.imported + ' 首歌曲');
  });
}

async function toggleLxMineSourcePicker(event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  var anchor = event && event.currentTarget;
  if (controlSourceSwitcherState.open && controlSourceSwitcherState.anchor === anchor) return closeControlSourceSwitcher();
  controlSourceSwitcherState.open = true; controlSourceSwitcherState.anchor = anchor;
  var serial = ++controlSourceSwitcherState.requestId;
  var panel = ensureControlSourceSwitcher(); panel.replaceChildren(); panel.classList.add('show');
  var head = document.createElement('div'); head.className = 'control-source-switcher-head'; head.textContent = '选择自定义音源'; panel.append(head);
  controlSourcePositionSwitcher(anchor);
  try {
    var state = await window.lxMusic.sources();
    if (serial !== controlSourceSwitcherState.requestId || !controlSourceSwitcherState.open) return;
    state.sources.forEach(function (source) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'control-source-option';
      button.textContent = source.name + (source.id === state.activeId ? ' · 使用中' : '');
      button.disabled = source.id === state.activeId;
      button.onclick = async function () {
        try {
          var resumeAt = audio ? audio.currentTime : 0;
          var resume = !!(audio && !audio.paused);
          await window.lxMusic.activateSource(source.id); closeControlSourceSwitcher();
          if (currentControlSong() && lxMineSource(currentControlSong())) {
            await playQueueAt(currentIdx, { resumeAt: resumeAt, qualitySwitch: true, preserveHomeState: true });
            if (!resume && audio) audio.pause();
          }
          await refreshLxMineSources();
        } catch (error) { showToast(error.message); }
      };
      panel.append(button);
    });
    var manage = document.createElement('button'); manage.className = 'control-source-option'; manage.textContent = '管理音源';
    manage.onclick = function () { closeControlSourceSwitcher(); openLxMineLibrary(); }; panel.append(manage);
  } catch (error) { head.textContent = error.message; }
}

function renderLxMineQuality() {
  var options = [{ key: 'standard', label: '128k', title: '标准 · 128 kbps' }, { key: 'exhigh', label: '320k', title: '高品质 · 320 kbps' },
    { key: 'lossless', label: 'FLAC', title: '无损 · FLAC' }, { key: 'hires', label: 'Hi-Res', title: '高解析 · 24 bit FLAC' }];
  var provider = currentPlaybackQualityProvider(), selected = getProviderPlaybackQuality(provider);
  var current = options.find(function (option) { return option.key === selected; }) || options[3];
  playbackQuality = current.key;
  var label = document.getElementById('quality-btn-label'); if (label) label.textContent = current.label;
  var button = document.getElementById('quality-btn'); if (button) button.title = '自定义音源音质 · ' + current.title;
  var list = document.getElementById('quality-option-list'); if (!list) return;
  list.replaceChildren();
  options.forEach(function (option) {
    var row = document.createElement('button'); row.className = 'quality-option' + (option.key === current.key ? ' active' : '');
    row.textContent = option.title; row.onclick = function () { setPlaybackQuality(option.key); }; list.append(row);
  });
}
