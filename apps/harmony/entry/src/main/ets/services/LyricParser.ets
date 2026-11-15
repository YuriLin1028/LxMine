// 原生歌词时间轴；精确逐字来自增强 LRC / LX 逐字格式，普通 LRC 保持逐行高亮。
export interface LyricWord { text: string; timeMs: number; durationMs: number; }
export interface LyricLine { timeMs: number; text: string; words: LyricWord[]; }

function stamp(value: string): number {
  const parts = value.replace(/^[\[<]|[\]>]$/g, '').split(/[:.]/);
  return Number(parts[0]) * 60000 + Number(parts[1]) * 1000 + Number((parts[2] ?? '').padEnd(3, '0').slice(0, 3));
}

/** 解析多时间标签、offset、增强 LRC 与 LX 的 [start,duration]<offset,duration>。 */
export function parseLrc(lrc: string): LyricLine[] {
  const result: LyricLine[] = [];
  const offsetMatch = lrc.match(/\[offset:([+-]?\d+)\]/i);
  const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
  for (const row of (lrc ?? '').split(/\r?\n/)) {
    const lx = row.match(/^\[(\d+),(\d+)\](.*)$/);
    if (lx) {
      const words: LyricWord[] = [];
      const matcher = /[<(](\d+),(\d+)(?:,\d+)?[>)]([^<(]*)/g;
      let part: RegExpExecArray | null = matcher.exec(lx[3]);
      while (part) {
        words.push({ text: part[3], timeMs: (part[0].startsWith('(') ? Number(part[1]) : Number(lx[1]) + Number(part[1])) + offset, durationMs: Number(part[2]) });
        part = matcher.exec(lx[3]);
      }
      const text = words.map((word: LyricWord) => word.text).join('');
      if (text) result.push({ timeMs: Number(lx[1]) + offset, text, words });
      continue;
    }
    const tags = row.match(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g);
    if (!tags) continue;
    const body = row.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim();
    const text = body.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').replace(/<-?\d+,-?\d+>/g, '');
    for (const tag of tags) {
      const words: LyricWord[] = [];
      const relativeMatcher = /<(-?\d+),(-?\d+)>([^<]*)/g;
      let relative: RegExpExecArray | null = relativeMatcher.exec(body);
      while (relative) {
        words.push({ text: relative[3], timeMs: stamp(tag) + Number(relative[1]) + offset, durationMs: Math.max(0, Number(relative[2])) });
        relative = relativeMatcher.exec(body);
      }
      const matcher = /(<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>)([^<]*)/g;
      let part: RegExpExecArray | null = matcher.exec(body);
      while (part) {
        words.push({ text: part[2], timeMs: stamp(part[1]) + offset + stamp(tag) - stamp(tags[0]), durationMs: 0 });
        part = matcher.exec(body);
      }
      for (let i = 0; i < words.length - 1; i++) words[i].durationMs = Math.max(0, words[i + 1].timeMs - words[i].timeMs);
      result.push({ timeMs: stamp(tag) + offset, text, words });
    }
  }
  result.sort((a: LyricLine, b: LyricLine) => a.timeMs - b.timeMs);
  for (let i = 0; i < result.length; i++) {
    const words = result[i].words;
    if (words.length && words[words.length - 1].durationMs === 0) {
      words[words.length - 1].durationMs = Math.max(0, (result[i + 1]?.timeMs ?? words[words.length - 1].timeMs + 1800) - words[words.length - 1].timeMs);
    }
  }
  return result;
}

export function findLyricIndex(lines: LyricLine[], positionMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let answer = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].timeMs <= positionMs) { answer = mid; low = mid + 1; } else high = mid - 1;
  }
  return answer;
}
