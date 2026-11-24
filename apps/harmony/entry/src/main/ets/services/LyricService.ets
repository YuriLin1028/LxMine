import { http } from '@kit.NetworkKit';
import { buffer } from '@kit.ArkTS';
import { Song } from '../model/Song';
import { LyricLine, parseLrc } from './LyricParser';

interface TextLyric { lyric?: string; }
interface WyLyric { lrc?: TextLyric; yrc?: TextLyric; tlyric?: TextLyric; romalrc?: TextLyric; ytlrc?: TextLyric; yromalrc?: TextLyric; }
interface TxLyric { lyric?: string; trans?: string; }
interface KwLine { time: string; lineLyric: string; }
interface KwData { lrclist?: KwLine[]; }
interface KwLyric { data?: KwData; }
interface KgCandidate { id: string; accesskey: string; }
interface KgCandidates { candidates?: KgCandidate[]; }
interface KgLyric { content?: string; }
async function json(url: string, referer: string = ''): Promise<string> {
  const client = http.createHttp();
  try {
    const response = await client.request(url, { method: http.RequestMethod.GET,
      header: { 'User-Agent': 'Mozilla/5.0', 'Referer': referer }, connectTimeout: 10000, readTimeout: 10000 });
    if (response.responseCode !== 200) throw new Error('歌词服务暂不可用');
    return response.result as string;
  } finally { client.destroy(); }
}
// 音源未提供歌词时，读取歌曲原平台的公开歌词；不参与播放地址解析。
export interface PublicLyricBundle { lines: LyricLine[]; translation: LyricLine[]; romaji: LyricLine[]; }
export async function publicLyrics(song: Song): Promise<LyricLine[]> { return (await publicLyricBundle(song)).lines; }
export async function publicLyricBundle(song: Song): Promise<PublicLyricBundle> {
  const id = encodeURIComponent(song.id);
  if (song.source === 'wy') {
    const data = JSON.parse(await json(`https://music.163.com/api/song/lyric?id=${id}&lv=-1&kv=-1&tv=-1&rv=-1&yv=-1&ytv=-1&yrv=-1`)) as WyLyric;
    return { lines: parseLrc(data.yrc?.lyric || data.lrc?.lyric || ''), translation: parseLrc(data.ytlrc?.lyric || data.tlyric?.lyric || ''), romaji: parseLrc(data.yromalrc?.lyric || data.romalrc?.lyric || '') };
  }
  if (song.source === 'tx') {
    const data = JSON.parse(await json(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${id}&format=json&nobase64=1`, 'https://y.qq.com/')) as TxLyric;
    const lines = parseLrc((data.lyric || '').replace(/&#(\d+);/g, (value: string, code: string) => String.fromCharCode(Number(code))).replace(/&amp;/g, '&'));
    return { lines, translation: parseLrc((data.trans || '').replace(/&#(\d+);/g, (value: string, code: string) => String.fromCharCode(Number(code))).replace(/&amp;/g, '&')), romaji: [] };
  }
  if (song.source === 'kg') {
    const search = JSON.parse(await json(`https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(song.name)}&duration=${song.durationMs}&hash=${encodeURIComponent(song.hash || song.id)}`)) as KgCandidates;
    const candidate = search.candidates?.[0]; if (!candidate) return { lines: [], translation: [], romaji: [] };
    const data = JSON.parse(await json(`https://lyrics.kugou.com/download?ver=1&client=pc&id=${encodeURIComponent(candidate.id)}&accesskey=${encodeURIComponent(candidate.accesskey)}&fmt=lrc&charset=utf8`)) as KgLyric;
    return { lines: parseLrc(data.content ? buffer.from(data.content, 'base64').toString() : ''), translation: [], romaji: [] };
  }
  const data = JSON.parse(await json(`https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${id}`)) as KwLyric;
  const lines = (data.data?.lrclist ?? []).map((line: KwLine) => { return { timeMs: Math.round(Number(line.time) * 1000), text: line.lineLyric, words: [] } as LyricLine; });
  return { lines, translation: [], romaji: [] };
}
