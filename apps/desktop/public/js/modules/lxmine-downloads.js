var lxMineDownloadIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>';
async function downloadLxMineSong(song) {
  song = song || currentCoverSong();
  if (!song) { showToast('先选择一首歌曲'); return; }
  try {
    var result = await window.lxMusic.download(song, getPlaybackQualityForSong(song));
    if (result) { showToast('已加入下载：' + song.name); openLxMineDownloads(); }
  } catch (error) { showToast('下载失败：' + error.message); }
}
function renderLxMineDownloads(jobs) {
  var list = document.getElementById('lxmine-download-list'); if (!list) return;
  list.replaceChildren();
  if (!jobs.length) { list.textContent = '下载的音乐会显示在这里。'; return; }
  jobs.forEach(function (job) {
    var row = document.createElement('div'); row.className = 'lxmine-download-row';
    var name = document.createElement('strong'); name.textContent = job.name;
    var status = document.createElement('small');
    status.textContent = job.state === 'complete' ? '已保存 · ' + job.filePath : job.state === 'downloading'
      ? (job.received / 1048576).toFixed(1) + ' MB' + (job.total ? ' / ' + (job.total / 1048576).toFixed(1) + ' MB' : '') : job.error || job.state;
    var copy = document.createElement('span'); copy.append(name, status); row.append(copy);
    if (job.state === 'downloading') {
      var progress = document.createElement('progress'); progress.max = job.total || 1; progress.value = job.received; row.append(progress);
      var cancel = document.createElement('button'); cancel.textContent = '取消'; cancel.onclick = function () { window.lxMusic.cancelDownload(job.id); }; row.append(cancel);
    }
    list.append(row);
  });
}
async function openLxMineDownloads() {
  var panel = document.getElementById('lxmine-downloads');
  if (!panel.open) panel.showModal();
  renderLxMineDownloads(await window.lxMusic.downloads());
}
function addLxMineDetailDownload() {
  var body = document.getElementById('track-detail-body');
  if (!body || body.querySelector('[data-lxmine-detail-download]')) return;
  var row = document.createElement('div'); row.className = 'detail-chip-row';
  var download = document.createElement('button'); download.className = 'fx-mini-btn'; download.dataset.lxmineDetailDownload = '1'; download.innerHTML = lxMineDownloadIcon + ' 下载歌曲';
  download.onclick = function () { downloadLxMineSong(detailCommentSong || currentCoverSong()); };
  var mode = document.createElement('button'); mode.className = 'fx-mini-btn ghost'; mode.textContent = '随机 / 顺序'; mode.onclick = function () { cyclePlayMode(); };
  row.append(mode, download); body.prepend(row);
}
if (!window.__LXMINE_NATIVE_STAGE && window.lxMusic) {
  var button = document.createElement('button'); button.id = 'lxmine-download-current'; button.className = 'ctrl-btn'; button.title = '下载歌曲'; button.setAttribute('aria-label', '下载歌曲');
  button.innerHTML = lxMineDownloadIcon; button.onclick = function () { downloadLxMineSong(); };
  document.querySelector('#controls .control-cluster.transport').append(button);
  var panel = document.createElement('dialog'); panel.id = 'lxmine-downloads'; panel.className = 'lxmine-downloads';
  panel.innerHTML = '<div class="lxmine-download-head"><h2>下载管理</h2><button type="button">关闭</button></div><div id="lxmine-download-list"></div>';
  panel.querySelector('button').onclick = function () { panel.close(); }; document.body.append(panel);
  var styles = document.createElement('style'); styles.textContent = '.lxmine-downloads{margin:auto;width:min(680px,90vw);max-height:80vh;overflow:auto;padding:24px;border:1px solid #ffffff20;border-radius:24px;color:#f4f4f4;background:#17191bf5;box-shadow:0 24px 80px #0008}.lxmine-downloads::backdrop{background:#0007;backdrop-filter:blur(14px)}.lxmine-download-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.lxmine-download-row{display:flex;align-items:center;gap:16px;padding:16px 0;border-bottom:1px solid #ffffff0c}.lxmine-download-row span{min-width:0;flex:1}.lxmine-download-row strong,.lxmine-download-row small{display:block;overflow-wrap:anywhere}.lxmine-download-row small{color:#aaadb2;margin-top:6px}.lxmine-downloads button{background:transparent;border:0;color:white;padding:10px;border-radius:18px;cursor:pointer}.lxmine-download-row progress{width:100px;accent-color:white}'; document.head.append(styles);
  window.lxMusic.onDownloadsChanged(renderLxMineDownloads);
  var manage = document.createElement('button'); manage.type = 'button'; manage.className = 'fx-mini-btn ghost'; manage.textContent = '下载管理'; manage.onclick = openLxMineDownloads;
  document.getElementById('lxmine-library').append(manage);
}
