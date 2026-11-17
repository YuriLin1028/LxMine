(function (root) {
  'use strict';
  const lyrics = {
    indexAt(lines, timeMs, property = 'timeMs', unit = 1) {
      const target = (Number(timeMs) || 0) + 50;
      let low = 0, high = lines.length - 1, answer = -1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const time = (Number(lines[middle]?.[property]) || 0) * unit;
        if (time <= target) { answer = middle; low = middle + 1; } else high = middle - 1;
      }
      return answer;
    },
    adjustedTime(positionMs, offsetMs) { return Math.max(0, (Number(positionMs) || 0) + (Number(offsetMs) || 0)); },
    seekTime(timeMs) { return Math.max(0, Number(timeMs) || 0); },
    anchorY(height, normalized = .5) { return height * (Number.isFinite(normalized) ? normalized : .5); },
    stageLines(lines, durationMs) {
      return lines.map((line, index) => {
        let offset = 0;
        const words = (line.words || []).map(word => {
          const c0 = offset;
          offset += word.text.length;
          return { text: word.text, t: word.timeMs / 1000, d: Math.max(.06, word.durationMs / 1000), c0, c1: offset };
        });
        return { t: line.timeMs / 1000, text: line.text, words, charCount: Array.from(line.text || '').length,
          duration: Math.max(.1, ((lines[index + 1] ? lines[index + 1].timeMs : durationMs || line.timeMs + 4800) - line.timeMs) / 1000) };
      });
    },
    wordRanges(line, measure) {
      const text = String(line.text || ''), width = Math.max(1, measure(text));
      return (line.words || []).map(word => {
        const c0 = Math.max(0, Math.min(text.length, Math.floor(Number(word.c0) || 0)));
        const c1 = Math.max(c0, Math.min(text.length, Math.ceil(Number(word.c1) || c0)));
        const p0 = Math.max(0, Math.min(1, measure(text.slice(0, c0)) / width));
        return { p0, p1: Math.max(p0, Math.min(1, measure(text.slice(0, c1)) / width)) };
      });
    },
    lineProgress(line, next, now, duration, ranges) {
      if (!line) return 0;
      if (line.words?.length && line.charCount > 0) {
        now = Math.max(0, Number(now) || 0);
        let previous = 0;
        for (let i = 0; i < line.words.length; i++) {
          const word = line.words[i], end = word.t + Math.max(.08, word.d || .24);
          if (now < word.t) return previous;
          const local = Math.max(0, Math.min(1, (now - word.t) / Math.max(.08, end - word.t)));
          const range = ranges?.[i] || { p0: (word.c0 || 0) / line.charCount, p1: (word.c1 || 0) / line.charCount };
          previous = Math.max(previous, range.p0 + (range.p1 - range.p0) * local);
          if (now < end) return previous;
        }
        return 1;
      }
      now += .020;
      const end = next && next.t > line.t ? next.t : Math.min(duration || now + 4, line.t + (line.duration || 4.8));
      const progress = Math.max(0, Math.min(1, (now - line.t) / Math.max(.75, end - line.t)));
      return progress * progress * (3 - 2 * progress);
    },
    progressStep(current, target, native, ease = .165, age = 1) {
      if (native) return target;
      const delta = target - current;
      if (Math.abs(delta) > .42) ease = Math.max(.52, ease * 1.55);
      if (age < .16) ease = Math.max(ease, .28);
      return Math.max(0, Math.min(1, current + delta * ease));
    },
    frameEase(base, dt) { return 1 - Math.pow(1 - base, Math.max(.25, Math.min(3, dt * 60))); },
    scrollEase(age) {
      const intro = Math.max(0, Math.min(1, (age - .04) / .48));
      return intro * intro * (3 - 2 * intro) < .98 ? .19 : .135;
    },
    followStep(current, target, ease, limit = Infinity) {
      return current + Math.max(-limit, Math.min(limit, (target - current) * ease));
    },
    feather(native) { return native ? .030 : .055; },
    karaokeCoverage(progress, point, feather) {
      const x = Math.max(0, Math.min(1, (point - progress) / feather));
      return 1 - x * x * (3 - 2 * x);
    },
    karaokeMask(progress, start, end, feather) {
      const width = Math.max(.00001, end - start);
      if (progress >= end) return '';
      if (progress + feather <= start) return 'linear-gradient(transparent,transparent)';
      const stops = [0, .25, .5, .75, 1].map(x => {
        const alpha = lyrics.karaokeCoverage(progress, progress + feather * x, feather);
        return 'rgba(0,0,0,' + alpha.toFixed(5) + ') ' + ((progress + feather * x - start) / width * 100).toFixed(4) + '%';
      });
      return 'linear-gradient(to right,' + stops.join(',') + ')';
    },
    karaokeSegments(line, next, duration) {
      const chars = text => typeof Intl !== 'undefined' && Intl.Segmenter
        ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), item => item.segment)
        : Array.from(text);
      const start = Number(line.timeMs) || 0;
      const end = Math.max(start + 1, Number(next?.timeMs) || Number(duration) || start + 4800);
      const words = Array.isArray(line.words) && line.words.map(word => word.text).join('') === line.text ? line.words : [];
      const parts = words.length ? words : [{ text: line.text, timeMs: start, durationMs: end - start }];
      return parts.flatMap((word, index) => {
        const units = chars(String(word.text || ''));
        const begin = Number.isFinite(Number(word.timeMs)) ? Number(word.timeMs) : start;
        const finish = Math.max(begin + 1, Number(word.durationMs) > 0 ? begin + Number(word.durationMs) : Number(parts[index + 1]?.timeMs) || end);
        return units.map((text, position) => ({ text, start: begin + (finish - begin) * position / units.length, end: begin + (finish - begin) * (position + 1) / units.length }));
      });
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = lyrics;
  else root.LxMineLyrics = lyrics;
})(typeof window !== 'undefined' ? window : globalThis);
