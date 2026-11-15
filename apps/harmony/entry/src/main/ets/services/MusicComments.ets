import { http } from '@kit.NetworkKit';
import { Song } from '../model/Song';

export interface SongComment {
  id: string;
  nick: string;
  avatar: string;
  content: string;
  liked: number;
  time: number;
  location: string;
}

export interface SongComments {
  platform: string;
  total: number;
  hot: SongComment[];
  latest: SongComment[];
}

interface WyUser { nickname?: string; avatarUrl?: string; }
interface WyIpLocation { location?: string; }
interface WyComment {
  commentId?: number;
  user?: WyUser;
  content?: string;
  likedCount?: number;
  time?: number;
  ipLocation?: WyIpLocation;
  location?: string;
}
interface WyResponse { total?: number; hotComments?: WyComment[]; comments?: WyComment[]; }
interface TxSong { id?: number; }
interface TxSingle { code?: number; data?: TxSong[]; }
interface TxComment {
  commentid?: string;
  nick?: string;
  avatarurl?: string;
  rootcommentcontent?: string;
  praisenum?: number;
  time?: number;
  location?: string;
}
interface TxList { commentlist?: TxComment[] | null; commenttotal?: number; }
interface TxResponse { code?: number; comment?: TxList; hot_comment?: TxList; }
interface WySearchSong { id?: number; name?: string; }
interface WySearchResult { songs?: WySearchSong[]; }
interface WySearchResponse { result?: WySearchResult; }

async function getJson(url: string, referer: string): Promise<string> {
  const client = http.createHttp();
  try {
    const response = await client.request(url, { method: http.RequestMethod.GET,
      header: { 'User-Agent': 'Mozilla/5.0 (Linux; HarmonyOS) LxMine/0.1', 'Referer': referer },
      connectTimeout: 10000, readTimeout: 12000 });
    if (response.responseCode !== 200) throw new Error('评论服务暂不可用');
    return response.result as string;
  } finally { client.destroy(); }
}

function clean(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (text: string, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

function wyComment(item: WyComment): SongComment {
  return {
    id: String(item.commentId ?? ''),
    nick: item.user?.nickname ?? '网易云用户',
    avatar: item.user?.avatarUrl ?? '',
    content: clean(item.content),
    liked: Number(item.likedCount ?? 0),
    time: Number(item.time ?? 0),
    location: item.ipLocation?.location ?? item.location ?? ''
  };
}

function txComment(item: TxComment): SongComment {
  return {
    id: String(item.commentid ?? ''),
    nick: item.nick ?? 'QQ 音乐用户',
    avatar: item.avatarurl ?? '',
    content: clean(item.rootcommentcontent),
    liked: Number(item.praisenum ?? 0),
    time: Number(item.time ?? 0) * 1000,
    location: item.location ?? ''
  };
}

async function netease(id: string, platform: string = '网易云音乐'): Promise<SongComments> {
  const url = `https://music.163.com/api/v1/resource/comments/R_SO_4_${encodeURIComponent(id)}?limit=50&offset=0`;
  const payload = JSON.parse(await getJson(url, 'https://music.163.com/')) as WyResponse;
  const hot: SongComment[] = [];
  for (const item of payload.hotComments ?? []) { if (clean(item.content)) hot.push(wyComment(item)); }
  const latest: SongComment[] = [];
  for (const item of payload.comments ?? []) { if (clean(item.content)) latest.push(wyComment(item)); }
  return { platform, total: Number(payload.total ?? latest.length), hot: hot.slice(0, 6), latest: latest.slice(0, 40) };
}

async function qq(songmid: string): Promise<SongComments> {
  const detail = JSON.parse(await getJson(`https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${encodeURIComponent(songmid)}&format=json`, 'https://y.qq.com/')) as TxSingle;
  const songid = detail.data?.[0]?.id;
  if (!songid) throw new Error('未找到 QQ 音乐评论');
  const url = `https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg?g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=GB2312&notice=0&platform=yqq.json&needNewCode=0&cid=205360772&reqtype=2&biztype=1&topid=${songid}&cmd=8&needmusiccrit=0&pagenum=0&pagesize=40`;
  const payload = JSON.parse(await getJson(url, 'https://y.qq.com/')) as TxResponse;
  if (payload.code !== 0) throw new Error('QQ 音乐评论读取失败');
  const hot: SongComment[] = [];
  for (const item of payload.hot_comment?.commentlist ?? []) { if (clean(item.rootcommentcontent)) hot.push(txComment(item)); }
  const latest: SongComment[] = [];
  for (const item of payload.comment?.commentlist ?? []) { if (clean(item.rootcommentcontent)) latest.push(txComment(item)); }
  return { platform: 'QQ 音乐', total: Number(payload.comment?.commenttotal ?? latest.length), hot: hot.slice(0, 6), latest: latest.slice(0, 40) };
}

async function neteaseFallback(song: Song): Promise<SongComments> {
  const singer = (song.singer || '').split('、')[0].split('&')[0].split(',')[0].trim();
  const query = encodeURIComponent(`${song.name} ${singer}`.trim());
  const search = JSON.parse(await getJson(`https://music.163.com/api/search/get?s=${query}&type=1&limit=5&offset=0`, 'https://music.163.com/')) as WySearchResponse;
  const match = search.result?.songs?.[0];
  if (!match?.id) throw new Error('未找到这首歌曲的公开评论');
  return netease(String(match.id), '网易云音乐 · 同名歌曲');
}

// 只读取原平台公开评论，不提供登录、点赞或发表入口。
export async function fetchSongComments(song: Song): Promise<SongComments> {
  if (song.source === 'wy') return netease(song.id);
  if (song.source === 'tx') return qq(song.id);
  return neteaseFallback(song);
}

export function commentPlatform(source: string | undefined): string {
  return source === 'tx' ? 'QQ 音乐' : source === 'wy' ? '网易云音乐' : '网络平台';
}
