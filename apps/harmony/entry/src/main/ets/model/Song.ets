// 鸿蒙端的数据模型：与 Windows 端 LX 音源共享同一套字段语义。

export interface Song {
  source?: string;
  hash?: string;
  hashes?: Record<string, string>;
  id: string;
  name: string;
  singer: string;
  albumName: string;
  albumId: string;
  durationMs: number;
  qualitys: string[];
  coverUrl: string;
  strMediaMid?: string;
  songId?: string;
}

export interface KuwoSearchResult {
  items: Song[];
  total: number;
}

export interface KuwoRawItem {
  MUSICRID?: string;
  SONGNAME?: string;
  ARTIST?: string;
  ALBUM?: string;
  ALBUMID?: string;
  DURATION?: string;
  N_MINFO?: string;
  web_albumpic_short?: string;
  web_artistpic_short?: string;
  albumpic?: string;
  hts_MVPIC?: string;
}

export interface KuwoRawResponse {
  abslist?: KuwoRawItem[];
  TOTAL?: string;
}
