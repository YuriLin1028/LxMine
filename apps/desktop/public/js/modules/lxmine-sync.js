(function () {
  if (window.__LXMINE_NATIVE_STAGE || !window.lxMusic) return;
  var panel = document.createElement('dialog'); panel.className = 'lxmine-downloads'; panel.id = 'lxmine-sync';
  panel.innerHTML = '<div class="lxmine-download-head"><h2>局域网双向同步</h2><button type="button">关闭</button></div><p>任意电脑、手机或平板均可发送与接收。接收方确认后覆盖歌单、音源及设置。</p><p id="lxmine-sync-status" role="status"></p><div id="lxmine-sync-devices"></div>';
  panel.querySelector('button').onclick = function () { panel.close(); }; document.body.append(panel);
  var busy = new Set(), activeIncoming = '';
  function status(text) { document.getElementById('lxmine-sync-status').textContent = text; }
  function devices(items) {
    var root = document.getElementById('lxmine-sync-devices'); root.replaceChildren();
    if (!items.length) { root.textContent = '同一局域网中打开另一台设备的 LxMine 后，会显示在这里。'; return; }
    items.forEach(function (device) {
      var row = document.createElement('div'); row.className = 'lxmine-download-row';
      var copy = document.createElement('span'), name = document.createElement('strong'), detail = document.createElement('small');
      name.textContent = device.name; detail.textContent = device.platform + ' · ' + device.address; copy.append(name, detail);
      var send = document.createElement('button'); send.textContent = busy.has(device.id) ? '等待对方确认…' : '发送本机数据'; send.disabled = busy.has(device.id);
      send.onclick = async function () {
        busy.add(device.id); send.disabled = true; send.textContent = '等待对方确认…';
        try {
          var result = await window.lxMusic.syncSend(device.id);
          status(result.accepted ? '已保存到「' + device.name + '」' : '对方未接受：' + (result.message || '已拒绝'));
        } catch (error) { status('同步失败：' + error.message); }
        finally { busy.delete(device.id); devices(await window.lxMusic.syncDevices()); }
      };
      row.append(copy, send); root.append(row);
    });
  }
  window.openLxMineSync = async function () {
    if (!panel.open) panel.showModal();
    try { var state = await window.lxMusic.syncStatus(); status('本机：' + state.deviceName); devices(await window.lxMusic.syncDevices()); }
    catch (error) { status(error.message); }
    checkIncoming();
  };
  var entry = document.createElement('button'); entry.className = 'fx-mini-btn ghost'; entry.textContent = '局域网同步'; entry.onclick = window.openLxMineSync;
  document.getElementById('lxmine-library').append(entry);
  async function checkIncoming() {
    if (activeIncoming) return;
    var pending = await window.lxMusic.syncPending(); if (!pending.length) return;
    var incoming = pending[0]; activeIncoming = incoming.pendingId;
    var dialog = document.createElement('dialog'); dialog.className = 'lxmine-downloads';
    var title = document.createElement('h2'); title.textContent = '接收同步';
    var message = document.createElement('p'); var summary = incoming.summary || {};
    message.textContent = '「' + incoming.peer.name + '」将发送 ' + (summary.playlists || 0) + ' 个歌单、' + (summary.sources || 0) + ' 个音源及设置，覆盖本机对应数据。';
    var result = document.createElement('p'); result.setAttribute('role', 'status');
    var reject = document.createElement('button'), accept = document.createElement('button'); reject.textContent = '拒绝'; accept.textContent = '接收并覆盖';
    async function respond(accepted) {
      reject.disabled = accept.disabled = true; result.textContent = accepted ? '正在保存…' : '正在拒绝…';
      try {
        var response = await window.lxMusic.syncRespond(incoming.pendingId, accepted);
        if (!response.ok) throw Error('未能保存同步数据，发送方不会收到成功回执');
        dialog.close(); dialog.remove(); activeIncoming = ''; checkIncoming();
      } catch (error) { result.textContent = error.message; accept.remove(); reject.textContent = '关闭'; reject.disabled = false; reject.onclick = function () { dialog.close(); dialog.remove(); activeIncoming = ''; checkIncoming(); }; }
    }
    reject.onclick = function () { respond(false); }; accept.onclick = function () { respond(true); };
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); });
    dialog.append(title, message, result, reject, accept); document.body.append(dialog); dialog.showModal();
  }
  window.lxMusic.onSyncEvent('devices-changed', devices);
  window.lxMusic.onSyncEvent('incoming', checkIncoming);
  window.lxMusic.onSyncEvent('applied', function (data) {
    applyBuiltInPlaylistSnapshot(data.library, { animate: true });
    refreshLxMineSources().catch(function (error) { showToast(error.message); });
    var settings = data.settings || {};
    if (settings.lxmine_pc_visuals) applyFxArchiveSnapshot(settings.lxmine_pc_visuals);
    if (/^mine-\d+$/.test(settings.lxlia_native_style || '')) setPreset(Number(settings.lxlia_native_style.slice(5)));
    showToast('同步数据已保存');
  });
  checkIncoming().catch(function () {});
})();
