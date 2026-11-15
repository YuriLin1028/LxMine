var lxMineSearchKind = 'music';
var lxMineEntityResults = [];
var lxMineEntityPage = 1;
var lxMineEntityHasMore = false;
var lxMineEntitySerial = 0;
var lxMineQueryTimer = 0;
function openLxMineSearch(query) {
  document.body.classList.add('lxmine-search-open');
  document.getElementById('lxmine-search-page').hidden = false;
  $input = document.getElementById('lxmine-query');
  $results = document.getElementById('lxmine-search-results');
  if (typeof query === 'string') $input.value = query;
  refreshLxMineSources().catch(function () {});
  $input.focus();
  if ($input.value.trim()) runLxMineSearch();
  else { renderSearchHistory(); document.getElementById('lxmine-search-count').textContent = '从歌名、歌手或歌单开始'; }
}
function closeLxMineSearch() {
  document.body.classList.remove('lxmine-search-open');
  document.getElementById('lxmine-search-page').hidden = true;
}
function setLxMineSearchKind(type) {
  lxMineSearchKind = type; ++lxMineEntitySerial; ++searchRequestSeq;
  document.querySelectorAll('[data-lxmine-search-kind]').forEach(function (button) {
    var selected = button.dataset.lxmineSearchKind === type;
    button.classList.toggle('active', selected); button.setAttribute('aria-selected', String(selected));
  });
  var provider = document.getElementById('lxmine-catalogue');
  var specialised = type !== 'music' && type !== 'songlist';
  Array.from(provider.options).forEach(function (option) { option.disabled = specialised && option.value !== 'song' && option.value !== 'netease'; });
  if (provider.selectedOptions[0].disabled) provider.value = 'song';
  searchMode = provider.value;
  if ($input.value.trim()) runLxMineSearch();
}
async function runLxMineSearch(more) {
  var query = $input.value.trim(); if (!query) { renderSearchHistory(); return; }
  var counter = document.getElementById('lxmine-search-count');
  searchMode = document.getElementById('lxmine-catalogue').value;
  counter.textContent = more ? '正在加载更多…' : '正在搜索…';
  if (lxMineSearchKind === 'music') {
    var musicSerial = ++lxMineEntitySerial;
    await doSearch(query);
    if (musicSerial !== lxMineEntitySerial || lxMineSearchKind !== 'music' || query !== $input.value.trim()) return;
    counter.textContent = playlist.length ? '已找到 ' + playlist.length + ' 首 · 可直接播放或加入队列' : (searchProviderNotice || '没有找到相关歌曲');
    return;
  }
  var serial = ++lxMineEntitySerial;
  var type = lxMineSearchKind;
  var providers = searchMode === 'song' ? (type === 'songlist' ? ['kw', 'wy', 'tx', 'kg'] : ['wy']) : [({kuwo:'kw',netease:'wy',qq:'tx',kugou:'kg'})[searchMode]];
  var page = more ? lxMineEntityPage + 1 : 1;
  var results = await Promise.allSettled(providers.map(function (source) { return window.lxMusic.search({query:query, source:source, type:type, page:page, limit:20}); }));
  if (serial !== lxMineEntitySerial || type !== lxMineSearchKind || query !== $input.value.trim()) return;
  var items = [], errors = [], hasMore = false;
  results.forEach(function (result) {
    if (result.status === 'rejected') { errors.push(result.reason.message); return; }
    items.push.apply(items, result.value.items); hasMore = hasMore || result.value.page * result.value.limit < result.value.total;
  });
  lxMineEntityResults = more ? lxMineEntityResults.concat(items) : items;
  lxMineEntityPage = page; lxMineEntityHasMore = hasMore;
  counter.textContent = lxMineEntityResults.length + ' 条结果' + (errors.length ? ' · 部分检索源暂时不可用' : '');
  $results.replaceChildren();
  if (!lxMineEntityResults.length) {
    var empty = document.createElement('p'); empty.className = 'search-empty'; empty.textContent = errors.length ? errors[0] : '没有找到相关结果'; $results.appendChild(empty); return;
  }
  lxMineEntityResults.forEach(function (item) {
    var row = document.createElement('button'); row.type = 'button'; row.className = 'lxmine-entity-row';
    var image = document.createElement('img'); image.loading='lazy'; image.alt=''; if(item.cover)image.src=coverProxySrc(item.cover);
    var title = document.createElement('strong'); title.textContent = item.name;
    var meta = document.createElement('small'); meta.textContent = [item.artist, item.count ? item.count+' 首歌曲' : ''].filter(Boolean).join(' · ');
    var copy = document.createElement('span'); copy.append(title,meta);
    var action = document.createElement('span'); action.className='lxmine-entity-action'; action.textContent=item.kind==='songlist'?'导入歌单':'查看';
    row.append(image,copy,action);
    row.onclick = function () { openLxMineEntity(item); }; $results.appendChild(row);
  });
  if(hasMore){var next=document.createElement('button');next.type='button';next.className='lxmine-more';next.textContent='加载更多';next.onclick=function(){runLxMineSearch(true)};$results.appendChild(next);}
}
function openLxMineEntity(item) {
  if(item.kind==='songlist') {
    return lxMineLibraryAction(async function(){
      var result=await window.lxMusic.importPlaylist(item.id,item.source);applyBuiltInPlaylistSnapshot(result,{animate:true});showToast('已保存到我的歌单');
    });
  }
  closeLxMineSearch();
  var song={id:item.id,provider:'netease',source:'netease',name:item.name,artist:item.artist||item.name};
  if(item.kind==='artist'){song.artistId=item.id;openTrackDetailModal('artist',song);}
  else if(item.kind==='album'){song.albumId=item.id;song.album=item.name;openTrackDetailModal('album',song);}
  else if(item.kind==='podcast'){searchMode='podcast';podcastResults=[{id:item.id,name:item.name,cover:item.cover}];openPodcastPrograms(0);}
  else {openLxMineSearch(item.name);setLxMineSearchKind('music');}
}
if (!window.__LXMINE_NATIVE_STAGE) {
  var newInput=document.getElementById('lxmine-query');
  newInput.addEventListener('keydown',function(event){if(event.key==='Enter'){event.preventDefault();clearTimeout(lxMineQueryTimer);runLxMineSearch();}});
  newInput.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();closeLxMineSearch();}});
  newInput.addEventListener('input',function(){clearTimeout(lxMineQueryTimer);++lxMineEntitySerial;++searchRequestSeq;lxMineQueryTimer=setTimeout(function(){runLxMineSearch();},400);});
  document.getElementById('lxmine-catalogue').addEventListener('change',function(){searchMode=this.value;runLxMineSearch();});
  document.getElementById('lxmine-search-source').addEventListener('change',function(){var id=this.value;if(id)lxMineLibraryAction(function(){return window.lxMusic.activateSource(id)});});
  document.getElementById('search-input').addEventListener('focus',function(){openLxMineSearch(this.value)});
  document.getElementById('lxmine-search-results').addEventListener('scroll',function(){if(lxMineSearchKind==='music'&&this.scrollTop+this.clientHeight>=this.scrollHeight-96)appendNextSearchResults();},{passive:true});
  document.getElementById('lxmine-search-results').addEventListener('click',function(event){
    if(event.target.closest('[data-search-load-more]')){event.stopPropagation();appendNextSearchResults();}
    if(event.target.closest('[data-clear-history]')){event.stopPropagation();clearSearchHistory();}
    var history=event.target.closest('[data-history-query]');if(history){event.stopPropagation();newInput.value=history.getAttribute('data-history-query');runLxMineSearch();}
  });
}
