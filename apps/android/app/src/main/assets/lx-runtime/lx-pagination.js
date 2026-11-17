/* Enumerate provider pages without a product-level result cap. UMD for ArkWeb. */
(function(root) {
  'use strict';
  async function collectAll(fetchPage, options = {}) {
    const limit = options.limit || 50, items = [], seen = new Set();
    let total = 0, page = 1, complete = true, warning = '', consumed = 0;
    const key = options.key || (item => [item.source || item.provider || '', item.kind || '', item.id || item.hash || item.name].join(':'));
    for (;;) {
      if (options.cancelled?.()) return {items,total,complete:false,cancelled:true};
      let result, error;
      for (let attempt=0;attempt<2;attempt++) {
        try { result=await fetchPage(page,limit);error=null;break; } catch(e) { error=e;if(options.cancelled?.())break; }
      }
      if (error) { if(!items.length)throw error;complete=false;warning='网络中断，已保留 '+items.length+' 条结果；请重新搜索重试';break; }
      const rows=Array.isArray(result?.items)?result.items:[],added=[];
      total=Math.max(total,Number(result?.total)||0);consumed+=rows.length;
      for(const item of rows){const id=key(item);if(!seen.has(id)){seen.add(id);items.push(item);added.push(item);}}
      if(options.onPage)await options.onPage({items,added,total,page,complete:false});
      if(!rows.length||!added.length){
        if(total>consumed){complete=false;warning='平台已停止返回新结果（已获取 '+items.length+' 条，平台标称 '+total+' 条）';}
        break;
      }
      if(result.hasMore===false)break;
      if(total>rows.length&&page*limit>=total)break;
      if(!total&&rows.length<limit)break;
      if(total<=rows.length&&rows.length<limit)break;
      page++;
    }
    return {items,total:Math.max(total,items.length),complete,warning,page,limit};
  }
  const api={collectAll};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LxPagination=api;
})(typeof window!=='undefined'?window:globalThis);
