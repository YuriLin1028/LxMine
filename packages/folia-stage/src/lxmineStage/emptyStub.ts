const noopLanguageDetector = {
  type: 'languageDetector',
  init() {},
  detect() {
    return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-CN';
  },
  cacheUserLanguage() {},
};

export default noopLanguageDetector;
export const parseBuffer = async () => ({});
export const parseBlob = async () => ({});
export const parseLyric = () => ({ lyricLines: [] });
export const parseTTML = () => ({ lyricLines: [] });
export const fileTypeFromBuffer = async () => undefined;
export const fileTypeFromBlob = async () => undefined;
export class TTMLParser {
  parse() { return { lyricLines: [] }; }
}
