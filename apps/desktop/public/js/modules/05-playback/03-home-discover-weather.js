function fallbackHomeTiles() {
  return [
    { kind: 'login', title: '登录同步歌单', sub: '网易云 / QQ / 酷狗 / 汽水' },
    { kind: 'search', title: '搜索一首歌', sub: '原唱优先', query: '' },
    { kind: 'local', title: '导入本地音乐', sub: '本地文件也能可视化' },
    { kind: 'podcastSearch', title: '搜索播客', sub: '长内容 / 电台' },
    { kind: 'guide', title: '看看视觉舞台', sub: '粒子 / 歌词 / 封面' },
  ];
}
function homeTileCover(item) {
  if (!item) return '';
  if (item.kind === 'song') return songCoverSrc(item.song, 220);
  return item.cover ? coverUrlWithSize(item.cover, 220) : '';
}
function homeToneForItem(item, index) {
  if (!item) return 'daily';
  if (item.kind === 'recent') return 'search';
  if (item.kind === 'profile') return 'local';
  if (item.tone) return item.tone;
  if (item.kind === 'song') return index % 2 ? 'search' : 'daily';
  if (item.kind === 'playlist') return 'playlist';
  if (item.kind === 'podcast' || item.kind === 'podcastSearch') return 'podcast';
  if (item.kind === 'local') return 'local';
  if (item.kind === 'guide') return 'guide';
  if (item.kind === 'login') return 'library';
  if (item.kind === 'search') return 'search';
  return ['daily', 'playlist', 'local', 'guide', 'search'][index % 5];
}
function renderHomeMosaic(items) {
  var cells = document.querySelectorAll('#home-mosaic .home-mosaic-cell');
  if (!cells.length) return;
  var covers = [];
  (items || []).forEach(function (item) {
    var cover = homeTileCover(item);
    if (cover) covers.push(cover);
  });
  for (var i = 0; i < cells.length; i++) {
    var src = covers[i] || covers[(i + 1) % Math.max(1, covers.length)] || '';
    cells[i].style.backgroundImage = src ? 'url("' + cssImageUrl(src) + '")' : '';
    cells[i].classList.toggle('has-cover', !!src);
    cells[i].classList.toggle('home-skeleton', !src && homeDiscoverState.loading);
  }
}
function renderHomeTiles() {
  var row = document.getElementById('home-tile-row');
  var title = document.getElementById('home-rail-title');
  var note = document.getElementById('home-rail-note');
  if (!row) return;
  var tiles = [];
  var loggedOutHome = !homeDiscoverState.loggedIn && !hasAnyPlatformLogin();
  var summary = homeListenSummary();
  if (summary.recent && tiles.length < 5) {
    tiles.push({ kind: 'recent', title: summary.recent.name || '继续听', sub: summary.recent.artist || summary.recent.source || '', cover: summary.recent.cover, record: summary.recent });
  }
  if (summary.topArtist && tiles.length < 5) {
    tiles.push({ kind: 'profile', title: summary.topArtist.name, sub: '常听歌手 · ' + summary.topArtist.plays + ' 次', query: summary.topArtist.name });
  }
  if (!loggedOutHome) {
    homeDiscoverState.songs.slice(0, Math.max(0, 4 - tiles.length)).forEach(function (song, i) {
      tiles.push({ kind: 'song', index: i, song: song, title: song.name || '今日歌曲', sub: song.artist || songSourceLabel(song) });
    });
    homeDiscoverState.playlists.slice(0, Math.max(0, 5 - tiles.length)).forEach(function (pl, i) {
      tiles.push({ kind: 'playlist', index: i, title: pl.name || '推荐歌单', sub: (pl.trackCount ? pl.trackCount + ' 首' : 'Playlist') + (pl.playCount ? ' · ' + compactHomeCount(pl.playCount) + ' 播放' : ''), cover: pl.cover });
    });
    if (tiles.length < 5) {
      homeDiscoverState.podcasts.slice(0, 5 - tiles.length).forEach(function (p, i) {
        tiles.push({ kind: 'podcast', index: i, title: p.name || '热门播客', sub: p.djName || p.category || 'Podcast', cover: p.cover });
      });
    }
  }
  if (!tiles.length) tiles = fallbackHomeTiles();
  tiles = tiles.slice(0, 5);
  if (title) title.textContent = summary.recent ? '接着听' : (loggedOutHome ? '先从这里开始' : '你的歌单与推荐');
  if (note) {
    var liveNote = homeDiscoverState.updatedAt ? '刚刚更新 · 点击即可播放' : '点击即可播放';
    note.textContent = homeDiscoverState.loading ? '正在整理推荐' : (loggedOutHome ? '登录平台后显示个人推荐' : (homeDiscoverState.error ? '离线精选' : liveNote));
  }
  row.innerHTML = tiles.map(function (item, i) {
    var cover = homeTileCover(item);
    var tone = homeToneForItem(item, i);
    var coverClass = 'home-tile-cover' + (cover ? ' has-cover' : '');
    return '<button class="home-tile' + (!cover && homeDiscoverState.loading ? ' home-skeleton' : '') + '" data-home-tone="' + escHtml(tone) + '" type="button" onclick="handleHomeTileClick(' + i + ')">' +
      '<div class="' + coverClass + '" style="' + (cover ? 'background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)' : '') + '"></div>' +
      '<div class="home-tile-title">' + escHtml(item.title || '') + '</div>' +
      '<div class="home-tile-sub">' + escHtml(item.sub || '') + '</div>' +
      '</button>';
  }).join('');
  row._homeTiles = tiles;
  renderHomeMosaic(tiles);
  renderHomeFeedSections();
}
function renderHomeDiscover() {
  var sub = document.getElementById('home-subtitle');
  var loggedOutHome = !homeDiscoverState.loggedIn && !hasAnyPlatformLogin();
  var weatherTitle = document.getElementById('home-weather-title');
  var weatherKicker = document.getElementById('home-weather-kicker');
  var weatherMeta = document.getElementById('home-weather-meta');
  if (weatherTitle) weatherTitle.textContent = '我的音乐库';
  if (weatherKicker) weatherKicker.textContent = 'LxMine · Your Library';
  if (sub) {
    if (loggedOutHome) sub.textContent = '登录后会把你的歌单、常听歌手和最近播放放在这里；也可以直接搜索或导入本地音乐。';
    else sub.textContent = '从你的歌单、最近播放、平台推荐和常听歌手开始。';
  }
  if (weatherMeta) {
    var meta = loggedOutHome ? ['跨平台搜索', '本地音乐', '热门电台'] : ['个人推荐', '平台歌单', '热门电台'];
    weatherMeta.innerHTML = meta.map(function (text) { return '<span class="home-weather-pill">' + escHtml(text) + '</span>'; }).join('');
  }
  var daily = homeDiscoverState.songs[0] || null;
  var cardSongB = homeDiscoverState.songs[1] || null;
  var cardSongC = homeDiscoverState.songs[2] || null;
  var playlistItem = homeDiscoverState.playlists[0] || null;
  var podcastItem = homeDiscoverState.podcasts[0] || null;
  var summary = homeListenSummary();
  var weatherCardTitle = document.getElementById('home-weather-card-title');
  var weatherCardSub = document.getElementById('home-weather-card-sub');
  var dailyTitle = document.getElementById('home-daily-title');
  var dailySub = document.getElementById('home-daily-sub');
  var privateTitle = document.getElementById('home-private-title');
  var privateSub = document.getElementById('home-private-sub');
  var continueTitle = document.getElementById('home-continue-title');
  var continueSub = document.getElementById('home-continue-sub');
  var profileTitle = document.getElementById('home-profile-title');
  var profileSub = document.getElementById('home-profile-sub');
  var libTitle = document.getElementById('home-library-title');
  var libSub = document.getElementById('home-library-sub');
  if (weatherCardTitle) weatherCardTitle.textContent = '我的歌单';
  if (weatherCardSub) {
    weatherCardSub.textContent = playlistItem ? (((playlistItem.trackCount || 0) ? playlistItem.trackCount + ' 首 · ' : '') + (playlistItem.creator || '打开左侧歌单库')) : '打开左侧歌单库';
  }
  if (continueTitle) continueTitle.textContent = summary.recent ? summary.recent.name : '继续听';
  if (continueSub) continueSub.textContent = summary.recent ? (summary.recent.artist || summary.recent.source || '最近播放') : '最近播放会出现在这里';
  if (profileTitle) profileTitle.textContent = summary.topArtist ? summary.topArtist.name : (summary.topSong ? summary.topSong.name : '听歌画像');
  if (profileSub) profileSub.textContent = summary.topArtist ? ('常听歌手 · ' + summary.topArtist.plays + ' 次') : (summary.totalPlays ? summary.totalPlays + ' 次有效播放' : '播放几首后生成偏好');
  if (loggedOutHome) {
    if (dailyTitle) dailyTitle.textContent = '每日推荐';
    if (dailySub) dailySub.textContent = '登录后同步你的今日歌曲';
    if (privateTitle) privateTitle.textContent = '推荐歌曲';
    if (privateSub) privateSub.textContent = '登录后同步更多歌曲';
    if (libTitle) libTitle.textContent = '更多歌曲';
    if (libSub) libSub.textContent = '播放后会继续补全推荐';
    setHomeArt('home-weather-art', '', 280);
    setHomeArt('home-daily-art', '', 280);
    setHomeArt('home-private-art', '', 280);
    setHomeArt('home-continue-art', summary.recent && summary.recent.cover, 280);
    setHomeArt('home-profile-art', summary.topSong && summary.topSong.cover || summary.recent && summary.recent.cover, 280);
    setHomeArt('home-library-art', '', 280);
  } else {
    if (dailyTitle) dailyTitle.textContent = daily ? daily.name : '每日推荐';
    if (dailySub) dailySub.textContent = daily ? ((daily.artist || songSourceLabel(daily) || '今日歌曲') + ' · 点击播放今日队列') : '同步你的今日歌曲';
    if (privateTitle) privateTitle.textContent = cardSongB ? cardSongB.name : '私人雷达';
    if (privateSub) privateSub.textContent = cardSongB ? (cardSongB.artist || songSourceLabel(cardSongB) || '推荐歌曲') : (homeDiscoverState.songs.length + ' 首 · 根据今日推荐与常听偏好');
    if (libTitle) libTitle.textContent = cardSongC ? cardSongC.name : (summary.topArtist ? summary.topArtist.name : '更多歌曲');
    if (libSub) libSub.textContent = cardSongC ? (cardSongC.artist || songSourceLabel(cardSongC) || '推荐歌曲') : (summary.topArtist ? ('歌手偏好 · ' + summary.topArtist.plays + ' 次') : '播放几首后生成你的偏好');
    setHomeArt('home-weather-art', (userPlaylists[0] && userPlaylists[0].cover) || (playlistItem && playlistItem.cover) || daily && daily.cover, 280);
    setHomeArt('home-daily-art', daily && daily.cover, 280);
    setHomeArt('home-private-art', cardSongB && cardSongB.cover || daily && daily.cover || summary.recent && summary.recent.cover || playlistItem && playlistItem.cover, 280);
    setHomeArt('home-continue-art', summary.recent && summary.recent.cover || playlistItem && playlistItem.cover, 280);
    setHomeArt('home-profile-art', summary.topSong && summary.topSong.cover || podcastItem && podcastItem.cover, 280);
    setHomeArt('home-library-art', cardSongC && cardSongC.cover || summary.topSong && summary.topSong.cover || summary.recent && summary.recent.cover || podcastItem && podcastItem.cover, 280);
  }
  renderHomeTiles();
  renderHomeFeedSections();
}
async function loadHomeDiscover(force) {
  if (homeDiscoverState.loading) return;
  if (homeDiscoverState.loaded && !force) return;
  var token = ++homeDiscoverToken;
  homeDiscoverState.loading = true;
  homeDiscoverState.error = '';
  renderHomeDiscover();
  try {
    var data = await apiJson('/api/discover/home?t=' + Date.now());
    if (token !== homeDiscoverToken) return;
    homeDiscoverState.loggedIn = !!(data && data.loggedIn) || hasAnyPlatformLogin();
    homeDiscoverState.mode = data && data.mode || (homeDiscoverState.loggedIn ? 'member' : 'starter');
    homeDiscoverState.songs = homeDiscoverState.loggedIn ? (data && data.dailySongs || []).map(cloneSong) : [];
    homeDiscoverState.newSongs = (data && Array.isArray(data.newSongs) ? data.newSongs : []).map(cloneSong);
    homeDiscoverState.charts = (data && Array.isArray(data.charts) ? data.charts : []).filter(function (chart) {
      return chart && chart.id && chart.name;
    });
    homeDiscoverState.playlists = homeDiscoverState.loggedIn
      ? ((data && data.playlists && data.playlists.length) ? data.playlists : userPlaylists.slice(0, 10))
      : (data && Array.isArray(data.playlists) ? data.playlists : []);
    homeDiscoverState.podcasts = homeDiscoverState.loggedIn ? (data && data.podcasts || []) : [];
    homeDiscoverState.updatedAt = Number(data && data.updatedAt) || Date.now();
    homeDiscoverState.loaded = true;
  } catch (e) {
    console.warn('home discover failed:', e);
    if (token === homeDiscoverToken) homeDiscoverState.error = 'DISCOVER_FAILED';
  } finally {
    if (token === homeDiscoverToken) {
      homeDiscoverState.loading = false;
      renderHomeDiscover();
    }
  }
}
var homeFeedSectionsRenderKey = '';
var homeFeedReturnScroll = null;
function homeFeedCoverFor(item, size) {
  if (!item) return '';
  var custom = typeof getCustomCoverForSong === 'function' ? getCustomCoverForSong(item) : '';
  if (custom) return custom;
  var cover = item.cover || item.picUrl || '';
  if (!cover && Array.isArray(item.songs) && item.songs[0]) {
    cover = item.songs[0].cover || (typeof songCoverSrc === 'function' ? songCoverSrc(item.songs[0], size || 240) : '');
  }
  return cover ? coverUrlWithSize(cover, size || 240) : '';
}
function homeFeedSongArtist(song) {
  if (!song) return '';
  return song.artist || song.singer || (typeof songSourceLabel === 'function' ? songSourceLabel(song) : '') || '';
}
function homeFeedPlaylistMeta(item, fallback) {
  var count = item && (item.trackCount || (Array.isArray(item.songs) ? item.songs.length : 0));
  var parts = [];
  if (count) parts.push(count + ' 首');
  if (item && item.playCount) parts.push(compactHomeCount(item.playCount) + ' 播放');
  return parts.join(' · ') || fallback || '推荐歌单';
}
function homeFeedCardHtml(item, index, action, fallbackLabel) {
  item = item || {};
  var cover = homeFeedCoverFor(item, 260);
  var coverStyle = cover ? ' style="background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)"' : '';
  return '<button class="home-feed-card" type="button" onclick="' + escHtml(action) + '(' + index + ')" title="' + escHtml(item.name || '') + '">' +
    '<span class="home-feed-cover' + (cover ? ' has-cover' : '') + '"' + coverStyle + '>' +
    (cover ? '' : '<span class="home-feed-cover-glyph" aria-hidden="true">♪</span>') +
    '</span>' +
    '<span class="home-feed-card-name">' + escHtml(item.name || fallbackLabel || '推荐内容') + '</span>' +
    '<span class="home-feed-card-sub">' + escHtml(homeFeedPlaylistMeta(item, fallbackLabel)) + '</span>' +
    '</button>';
}
function homeFeedSongCardHtml(song, index) {
  song = song || {};
  var cover = homeFeedCoverFor(song, 260);
  var coverStyle = cover ? ' style="background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)"' : '';
  return '<button class="home-feed-card home-feed-song-card" type="button" onclick="playHomeFeedSong(' + index + ')" title="' + escHtml(song.name || '') + '">' +
    '<span class="home-feed-cover' + (cover ? ' has-cover' : '') + '"' + coverStyle + '>' +
    '<span class="home-feed-new-badge">NEW</span>' +
    (cover ? '' : '<span class="home-feed-cover-glyph" aria-hidden="true">♪</span>') +
    '</span>' +
    '<span class="home-feed-card-name">' + escHtml(song.name || '未知歌曲') + '</span>' +
    '<span class="home-feed-card-sub">' + escHtml(homeFeedSongArtist(song) || '新歌速递') + '</span>' +
    '</button>';
}
function homeFeedChartCardHtml(chart, index) {
  chart = chart || {};
  var cover = homeFeedCoverFor(chart, 120);
  var coverStyle = cover ? ' style="background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)"' : '';
  return '<button class="home-feed-chart-card" type="button" onclick="openHomeFeedChart(' + index + ')" title="' + escHtml(chart.name || '') + '">' +
    '<span class="home-feed-chart-rank" aria-hidden="true">' + (index + 1) + '</span>' +
    '<span class="home-feed-chart-cover' + (cover ? ' has-cover' : '') + '"' + coverStyle + '></span>' +
    '<span class="home-feed-chart-copy">' +
    '<span class="home-feed-chart-name">' + escHtml(chart.name || '排行榜') + '</span>' +
    '<span class="home-feed-chart-sub">' + escHtml(homeFeedPlaylistMeta(chart, '实时热度')) + '</span>' +
    '</span></button>';
}
function homeFeedSongRowHtml(song, index, action, fallbackLabel) {
  song = song || {};
  var cover = homeFeedCoverFor(song, 120);
  var coverStyle = cover ? ' style="background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)"' : '';
  return '<button class="home-feed-song-row" type="button" onclick="' + escHtml(action) + '(' + index + ')" title="' + escHtml(song.name || '') + '">' +
    '<span class="home-feed-song-cover' + (cover ? ' has-cover' : '') + '"' + coverStyle + '></span>' +
    '<span class="home-feed-song-copy">' +
    '<span class="home-feed-song-name">' + escHtml(song.name || '未知歌曲') + '</span>' +
    '<span class="home-feed-song-artist">' + escHtml(homeFeedSongArtist(song) || fallbackLabel || '') + '</span>' +
    '</span>' +
    '<span class="home-feed-song-play" aria-hidden="true">▶</span></button>';
}
function homeFeedSectionHtml(title, kicker, note, body, section) {
  var more = section
    ? '<button class="home-feed-more" type="button" aria-label="更多" title="更多" onclick="openHomeFeedSection(\'' + escHtml(section) + '\')"><span aria-hidden="true">›</span></button>'
    : '';
  return '<section class="home-feed-section">' +
    '<div class="home-feed-head"><div class="home-feed-heading">' +
    '<span class="home-feed-kicker">' + escHtml(kicker || '') + '</span>' +
    '<h3 class="home-feed-title">' + escHtml(title || '') + '</h3></div>' +
    '<div class="home-feed-head-actions"><span class="home-feed-note">' + escHtml(note || '') + '</span>' + more + '</div></div>' +
    body + '</section>';
}
function renderHomeFeedSections() {
  var root = document.getElementById('home-feed-sections');
  if (!root) return;
  var playlists = Array.isArray(homeDiscoverState.playlists) ? homeDiscoverState.playlists.slice(0, 18) : [];
  var newSongs = Array.isArray(homeDiscoverState.newSongs) ? homeDiscoverState.newSongs.slice(0, 18) : [];
  var charts = Array.isArray(homeDiscoverState.charts) ? homeDiscoverState.charts : [];
  var similarSongs = Array.isArray(homeDiscoverState.songs) ? homeDiscoverState.songs.slice(0, 18) : [];
  var recentRecords = listenStatsState && Array.isArray(listenStatsState.history) ? listenStatsState.history.slice(0, 12) : [];
  var libraryPlaylists = Array.isArray(userPlaylists) ? userPlaylists.slice(0, 12) : [];
  var sections = [];
  if (playlists.length) {
    sections.push(homeFeedSectionHtml('推荐歌单', 'DISCOVER · 平台推荐',
      homeDiscoverState.loggedIn ? '来自你的平台推荐' : '未登录也可浏览的公开推荐',
      '<div class="home-feed-row">' + playlists.map(function (item, index) {
        return homeFeedCardHtml(item, index, 'openHomeFeedPlaylist', '推荐歌单');
      }).join('') + '</div>', 'playlists'));
  }
  if (newSongs.length) {
    sections.push(homeFeedSectionHtml('每周新歌', 'NEW RELEASES · 新歌速递', '网易云新歌推荐',
      '<div class="home-feed-row">' + newSongs.map(homeFeedSongCardHtml).join('') + '</div>', 'newSongs'));
  }
  if (charts.length) {
    sections.push(homeFeedSectionHtml('排行榜', 'CHARTS · 实时热度', '点击榜单即可载入播放',
      '<div class="home-feed-row">' + charts.map(homeFeedChartCardHtml).join('') + '</div>', 'charts'));
  }
  if (similarSongs.length) {
    sections.push(homeFeedSectionHtml('你可能也喜欢', 'FOR YOU · 每日推荐', '来自今日推荐',
      '<div class="home-feed-row home-feed-row-songs">' + similarSongs.map(function (song, index) {
        return homeFeedSongRowHtml(song, index, 'playHomeSong', '每日推荐');
      }).join('') + '</div>', 'similar'));
  }
  if (recentRecords.length || libraryPlaylists.length) {
    var recentBody = '<div class="home-feed-row home-feed-row-songs">' +
      recentRecords.map(function (record, index) {
        return homeFeedSongRowHtml(record, index, 'playHomeFeedRecentSong', '最近播放');
      }).join('') +
      libraryPlaylists.map(function (item, index) {
        return homeFeedCardHtml(item, index, 'openHomeFeedLibraryPlaylist', '歌单');
      }).join('') + '</div>';
    sections.push(homeFeedSectionHtml('最近常听', 'LISTENING · 本地记录',
      recentRecords.length ? '来自本地听歌记录' : '来自你的歌单', recentBody, 'recent'));
  }
  var html = sections.join('');
  var key = html || 'empty';
  if (key === homeFeedSectionsRenderKey) return;
  homeFeedSectionsRenderKey = key;
  root.innerHTML = html;
  root.classList.toggle('is-empty', !sections.length);
}
function homeFeedDetailCardGrid(items, render) {
  if (!items.length) return '';
  return '<div class="home-feed-detail-grid">' + items.map(render).join('') + '</div>';
}
function homeFeedDetailList(items, render) {
  if (!items.length) return '';
  return '<div class="home-feed-detail-list">' + items.map(render).join('') + '</div>';
}
function openHomeFeedSection(section) {
  var detail = document.getElementById('home-feed-detail');
  var home = document.getElementById('empty-home');
  if (!detail || !home) return;
  var desktopShell = document.querySelector('.desktop-shell');
  homeFeedReturnScroll = { windowY: window.scrollY || 0, desktop: desktopShell ? desktopShell.scrollTop : 0, body: document.body.scrollTop, home: home.scrollTop };
  var title = '更多';
  var body = '';
  if (section === 'playlists') {
    title = '推荐歌单';
    var playlists = Array.isArray(homeDiscoverState.playlists) ? homeDiscoverState.playlists : [];
    body = homeFeedDetailCardGrid(playlists, function (item, index) {
      return homeFeedCardHtml(item, index, 'openHomeFeedPlaylist', '推荐歌单');
    });
  } else if (section === 'newSongs') {
    title = '每周新歌';
    var newSongs = Array.isArray(homeDiscoverState.newSongs) ? homeDiscoverState.newSongs : [];
    body = homeFeedDetailCardGrid(newSongs, homeFeedSongCardHtml);
  } else if (section === 'charts') {
    title = '排行榜';
    var charts = Array.isArray(homeDiscoverState.charts) ? homeDiscoverState.charts : [];
    body = homeFeedDetailCardGrid(charts, homeFeedChartCardHtml);
  } else if (section === 'similar') {
    title = '相似推荐';
    var similar = Array.isArray(homeDiscoverState.songs) ? homeDiscoverState.songs : [];
    body = homeFeedDetailList(similar, function (song, index) {
      return homeFeedSongRowHtml(song, index, 'playHomeSong', '每日推荐');
    });
  } else if (section === 'recent') {
    title = '最近常听';
    var recent = listenStatsState && Array.isArray(listenStatsState.history) ? listenStatsState.history : [];
    var library = Array.isArray(userPlaylists) ? userPlaylists : [];
    body = homeFeedDetailList(recent, function (record, index) {
      return homeFeedSongRowHtml(record, index, 'playHomeFeedRecentSong', '最近播放');
    });
    body += homeFeedDetailCardGrid(library, function (item, index) {
      return homeFeedCardHtml(item, index, 'openHomeFeedLibraryPlaylist', '歌单');
    });
  }
  detail.innerHTML = '<div class="home-feed-detail-head">' +
    '<button class="home-feed-detail-back" type="button" onclick="closeHomeFeedSection()" aria-label="返回首页">‹</button>' +
    '<div><span class="home-feed-kicker">COLLECTION</span><h2 class="home-feed-detail-title">' + escHtml(title) + '</h2></div>' +
    '</div>' + (body || '<p class="home-feed-detail-empty">这里还没有内容</p>');
  detail.hidden = false;
  home.classList.add('feed-detail-open');
  detail.scrollTop = 0;
  if (typeof detail.scrollIntoView === 'function') detail.scrollIntoView({ block: 'start' });
}
function closeHomeFeedSection() {
  var detail = document.getElementById('home-feed-detail');
  var home = document.getElementById('empty-home');
  if (detail) detail.hidden = true;
  if (home) home.classList.remove('feed-detail-open');
  var restore = homeFeedReturnScroll;
  homeFeedReturnScroll = null;
  function restoreHomeFeedScroll() {
    if (!restore) return;
    window.scrollTo(0, restore.windowY || 0);
    var desktopShell = document.querySelector('.desktop-shell');
    if (desktopShell) desktopShell.scrollTop = restore.desktop || 0;
    document.body.scrollTop = restore.body || 0;
    if (home) home.scrollTop = restore.home || 0;
  }
  requestAnimationFrame(restoreHomeFeedScroll);
  setTimeout(restoreHomeFeedScroll, 280);
  setTimeout(restoreHomeFeedScroll, 700);
  setTimeout(restoreHomeFeedScroll, 1200);
}
function openHomeFeedPlaylist(index) {
  var item = Array.isArray(homeDiscoverState.playlists) ? homeDiscoverState.playlists[index] : null;
  if (item && item.id && typeof loadPlaylistIntoQueueById === 'function') {
    homeForcedOpen = false;
    homeSuppressed = false;
    if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
    if (typeof openPlaylistPanelTab === 'function') openPlaylistPanelTab('playlists', true);
    loadPlaylistIntoQueueById(item.id, true, item.name || '推荐歌单');
    return;
  }
  if (typeof openHomeDashboardCharts === 'function') openHomeDashboardCharts();
  else if (typeof openHomeDashboardLibrary === 'function') openHomeDashboardLibrary();
}
function openHomeFeedChart(index) {
  var item = Array.isArray(homeDiscoverState.charts) ? homeDiscoverState.charts[index] : null;
  if (item && item.id && typeof loadPlaylistIntoQueueById === 'function') {
    homeForcedOpen = false;
    homeSuppressed = false;
    if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
    if (typeof openPlaylistPanelTab === 'function') openPlaylistPanelTab('playlists', true);
    loadPlaylistIntoQueueById(item.id, true, item.name || '排行榜');
    return;
  }
  if (typeof openHomeDashboardCharts === 'function') openHomeDashboardCharts();
}
function playHomeFeedSong(index) {
  var songs = Array.isArray(homeDiscoverState.newSongs) ? homeDiscoverState.newSongs : [];
  if (!songs[index] || typeof playQueueAt !== 'function') return;
  homeForcedOpen = false;
  homeSuppressed = false;
  if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
  playQueue = songs.map(cloneSong);
  currentIdx = Math.max(0, Math.min(playQueue.length - 1, Number(index) || 0));
  if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('home-feed-new-songs', { scrollCurrent: true });
  if (typeof safeShelfRebuild === 'function') safeShelfRebuild('home-feed-new-songs', true);
  if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
  Promise.resolve(playQueueAt(currentIdx, {
    manual: true,
    context: { type: 'home-feed-new-songs', playlistName: '每周新歌' },
  })).catch(function (error) { console.warn('[HomeFeedNewSongs]', error); });
}
function playHomeFeedRecentSong(index) {
  var record = listenStatsState && Array.isArray(listenStatsState.history) ? listenStatsState.history[index] : null;
  if (!record) return;
  if (typeof playHomeRecent === 'function') playHomeRecent(record);
}
function openHomeFeedLibraryPlaylist(index) {
  var item = Array.isArray(userPlaylists) ? userPlaylists[index] : null;
  if (!item || !item.id) {
    if (typeof openHomeDashboardLibrary === 'function') openHomeDashboardLibrary();
    return;
  }
  var rawId = String(item.id);
  var provider = item.provider || item.source || 'netease';
  if (!/^(mineradio|qq|kugou|qishui|spotify):/.test(rawId) && typeof playlistPanelProviderId === 'function') {
    rawId = playlistPanelProviderId(provider, rawId);
  }
  if (typeof loadPlaylistIntoQueueById === 'function') {
    homeForcedOpen = false;
    homeSuppressed = false;
    if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
    if (typeof openPlaylistPanelTab === 'function') openPlaylistPanelTab('playlists', true);
    loadPlaylistIntoQueueById(rawId, true, item.name || '');
    return;
  }
  if (typeof openHomeDashboardLibrary === 'function') openHomeDashboardLibrary();
}
