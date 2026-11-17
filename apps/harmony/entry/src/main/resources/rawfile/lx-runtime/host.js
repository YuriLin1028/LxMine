/* Native bridge entry points for isolated source activation and playlist metadata import. */
window.__lxRunSource = function (script, info) {
  window.__lxReset();
  window.__lxScriptInfo = info;
  new Function(script)();
};
window.__lxImportPlaylist = function (id, input, source) {
  window.LxPlaylists.importPlaylist(input, source, {
    page: function (url) {
      return new Promise(function (resolve, reject) {
        window.lx.request(url, {}, function (error, response, body) {
          if (error) return reject(error);
          const headers = response.headers || {};
          resolve({ body: body, location: headers.location || headers.Location });
        });
      });
    },
    md5: function (text) { return CryptoJS.MD5(text).toString(); },
    json: function (url, options) {
      return new Promise(function (resolve, reject) {
        window.lx.request(url, options || {}, function (error, response, body) {
          if (error) { reject(error); return; }
          if (response.statusCode !== 200) { reject(new Error('HTTP ' + response.statusCode)); return; }
          try {
            const data = typeof body === 'string' ? JSON.parse(body) : body;
            window.__lxNative.onResult(id, JSON.stringify({ progress: true }));
            resolve(data);
          } catch (e) { reject(e); }
        });
      });
    },
    linuxEncrypt: function (payload) {
      return CryptoJS.AES.encrypt(JSON.stringify(payload), CryptoJS.enc.Utf8.parse('rFgB&h#%2?^eDg:Q'), {
        mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7
      }).ciphertext.toString(CryptoJS.enc.Hex).toUpperCase();
    }
  }).then(function (data) {
    window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data }));
  }).catch(function (error) {
    window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message }));
  });
};

window.__lxCatalogue = function (id, operation, params) {
  if (operation === 'song-assets') {
    const io = { json: function (url, options) { return new Promise(function (resolve, reject) {
      window.lx.request(url, Object.assign({ timeout: 6000 }, options), function (error, response, body) {
        if (error) return reject(error);
        if (response.statusCode !== 200) return reject(new Error('HTTP ' + response.statusCode));
        try { resolve(typeof body === 'string' ? JSON5.parse(body) : body); } catch (error) { reject(error); }
      });
    }); } };
    window.LxSongAssets.get(params, io, window.LxPlaylists)
      .then(function (data) { window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data })); })
      .catch(function (error) { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message })); });
    return;
  }
  if (operation === 'match-song') {
    window.LxPlaylists.matchSong(params, { json: function (url, options) {
      return new Promise(function (resolve, reject) {
        window.lx.request(url, options || {}, function (error, response, body) {
          if (error) return reject(error);
          if (response.statusCode !== 200) return reject(new Error('HTTP ' + response.statusCode));
          try { resolve(typeof body === 'string' ? JSON.parse(body) : body); } catch (error) { reject(error); }
        });
      });
    } }).then(function (data) { window.__lxNative.onResult(id, JSON.stringify({ ok: true, data: data })); })
      .catch(function (error) { window.__lxNative.onResult(id, JSON.stringify({ ok: false, error: error.message })); });
    return;
  }
  if(['home','home-lite','home-section','feed-tracks'].includes(operation))return window.__lxDiscover(id,operation,params);
  const catalogue = window.LxCatalogue.createCatalogue({ json: function (url, options) {
    return new Promise(function (resolve, reject) {
      window.lx.request(url, options || {}, function(error, response, body) {
        if (error) return reject(error);
        if (response.statusCode !== 200) return reject(new Error('HTTP ' + response.statusCode));
        try { resolve(typeof body === 'string' ? JSON5.parse(body) : body); } catch(e) { reject(e); }
      });
    });
  }});
  Promise.resolve().then(function(){ return operation === 'tracks' ? catalogue.entityTracks(params) : catalogue.searchEntities(params); })
    .then(function(data){window.__lxNative.onResult(id,JSON.stringify({ok:true,data}));})
    .catch(function(error){window.__lxNative.onResult(id,JSON.stringify({ok:false,error:error.message}));});
};

window.__lxDiscover=function(id,operation,params){
  const io={json:function(url,options){return new Promise(function(resolve,reject){window.lx.request(url,options||{},function(error,response,body){if(error)return reject(error);if(response.statusCode!==200)return reject(Error('HTTP '+response.statusCode));try{resolve(typeof body==='string'?JSON5.parse(body):body);}catch(e){reject(e);}});});},
    normalizeSong:window.LxPlaylists.normalizeSong,collectAll:window.LxPagination.collectAll,
    linuxEncrypt:function(payload){return CryptoJS.AES.encrypt(JSON.stringify(payload),CryptoJS.enc.Utf8.parse('rFgB&h#%2?^eDg:Q'),{mode:CryptoJS.mode.ECB,padding:CryptoJS.pad.Pkcs7}).ciphertext.toString(CryptoJS.enc.Hex).toUpperCase();}};
  io.importPlaylist=function(input,source){return window.LxPlaylists.importPlaylist(input,source,io);};
  const discovery=window.LxDiscovery.createDiscovery(io);
  Promise.resolve().then(function(){return operation==='home'?discovery.home(params.source):operation==='home-lite'?discovery.homeLite(params.source):operation==='home-section'?discovery.section(params):discovery.tracks(params);})
    .then(function(data){window.__lxNative.onResult(id,JSON.stringify({ok:true,data}));})
    .catch(function(error){window.__lxNative.onResult(id,JSON.stringify({ok:false,error:error.message}));});
};
