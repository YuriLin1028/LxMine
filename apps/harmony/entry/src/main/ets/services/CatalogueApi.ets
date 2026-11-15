import { Song } from '../model/Song';
import { LxHost } from './LxRuntime';
import { LxSearchSource, LxSearchResult } from './SearchApi';

export interface CatalogueEntity { id: string; source: string; kind: string; name: string; artist: string; cover: string; count?: number; song?: Song; }
export interface CatalogueResult { items: CatalogueEntity[]; total: number; page: number; limit: number; warning?: string; hasMore?:boolean; }
export const SEARCH_KINDS: string[] = ['歌曲', '歌单', '歌手', '专辑', '歌词', '播客'];
export const SEARCH_KIND_IDS: string[] = ['music', 'songlist', 'artist', 'album', 'lyric', 'podcast'];
export async function searchCatalogue(host: LxHost, source: LxSearchSource, kind: string, query: string, page: number, cancelled:()=>boolean=()=>false, onProgress:(items:CatalogueEntity[],total:number)=>void=()=>{}): Promise<CatalogueResult> {
  const sources: string[] = source === 'all' ? (kind === 'songlist' ? ['kw', 'kg', 'wy', 'tx'] : ['wy']) : [source];
  const snapshots: CatalogueEntity[][] = sources.map((): CatalogueEntity[] => []);
  const totals: number[] = sources.map(() => 0);
  const responses = await Promise.allSettled(sources.map(async (platform: string, index: number) => {
    let next=1,total=0,warning='';const all:CatalogueEntity[]=[];const seen:Set<string>=new Set<string>();
    for (;;) {
      if(cancelled())break;
      let result:CatalogueResult;
      try{result=JSON.parse(await host.catalogue('search',JSON.stringify({source:platform,type:kind,query,page:next,limit:30}))) as CatalogueResult;}
      catch(error){if(!all.length)throw new Error((error as Error).message);warning='网络中断，已保留获取的结果，请重新搜索重试';break;}
      total=Math.max(total,result.total);let added=0;
      for(const item of result.items){const key=`${item.source}:${item.kind}:${item.id}`;if(!seen.has(key)){seen.add(key);all.push(item);added++;}}
      snapshots[index] = all.slice(); totals[index] = total;
      const current: CatalogueEntity[] = []; for (const snapshot of snapshots) current.push(...snapshot);
      if (!cancelled()) onProgress(current, totals.reduce((sum: number, value: number) => sum + value, 0));
      if(!result.items.length||!added){if(all.length<total)warning='平台已停止返回新结果，已显示全部可获取结果';break;}
      if(result.hasMore===false)break;
      if(total>result.items.length&&next*30>=total)break;
      if(total<=result.items.length&&result.items.length<30)break;next++;
    }
    const result:CatalogueResult={items:all,total,page:1,limit:all.length,warning};return result;
  }));
  const items: CatalogueEntity[] = [];const warnings:string[]=[]; let total = 0; let failed = 0; let error: string = '';
  for (const response of responses) {
    if (response.status === 'fulfilled') { items.push(...response.value.items); total += response.value.total;if(response.value.warning)warnings.push(response.value.warning); }
    else { failed++; error = String(response.reason); }
  }
  if (failed === sources.length) throw new Error(error || '公开检索暂不可用');
  if(failed)warnings.push('部分平台暂时不可用，已显示其余结果');
  return { items, total, page, limit: 30, warning:warnings.join('；') };
}
export async function catalogueTracks(host: LxHost, entity: CatalogueEntity, page: number = 1, onProgress:(items:Song[],total:number)=>void=()=>{}, cancelled:()=>boolean=()=>false): Promise<LxSearchResult> {
  const items:Song[]=[];const seen:Set<string>=new Set<string>();let total=0,next=1,warning='';
  for(;;){
    if (cancelled()) break;
    let result:LxSearchResult;
    try{result=JSON.parse(await host.catalogue('tracks',JSON.stringify({id:entity.id,source:entity.source,kind:entity.kind,page:next,limit:50}))) as LxSearchResult;}
    catch(error){if(!items.length)throw new Error((error as Error).message);warning='网络中断，已保留获取的歌曲，请重新打开重试';break;}
    total=Math.max(total,result.total);let added=0;
    for(const song of result.items){const key=`${song.source}:${song.id}`;if(!seen.has(key)){seen.add(key);items.push(song);added++;}}
    if (!cancelled()) onProgress(items.slice(), total);
    if(!result.items.length||!added){if(items.length<total)warning='平台已停止返回新结果';break;}
    if(entity.kind==='album'||result.hasMore===false)break;
    if(total>result.items.length&&next*50>=total)break;
    if(total<=result.items.length&&result.items.length<50)break;next++;
  }
  return {items,total,warning};
}
