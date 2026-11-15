const { _electron }=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve('apps/desktop/node_modules/electron/dist/electron.exe'),args:[path.join(__dirname,'electron-lab.cjs'),'--force-device-scale-factor=3.5','--disable-features=CalculateNativeWinOcclusion']});
 try {
  const page=await app.firstWindow();await page.waitForFunction(()=>document.querySelectorAll('[data-material]').length===4);await page.evaluate(()=>setScene('grid'));await page.waitForTimeout(200);
  const result=await page.evaluate(async()=>{
   const decode=async(src,blur=0)=>{const im=new Image();im.src=src;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.filter=`blur(${blur}px)`;ctx.drawImage(im,0,0);return {data:ctx.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height}};
   const d=devicePixelRatio,raw=await decode(referenceFolder+'native-off.png',1.9*d),native=await decode(referenceFolder+'native-repeat.png');
   const sample=(im,x,y,k)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,j=(iy*im.w+ix)*4;return im.data[j+k]*(1-fx)*(1-fy)+im.data[j+4+k]*fx*(1-fy)+im.data[j+im.w*4+k]*(1-fx)*fy+im.data[j+im.w*4+4+k]*fx*fy};
   const rows=[];
   for(const host of document.querySelectorAll('.glass')){
    const b=host.getBoundingClientRect();if(b.width<200)continue;
    for(const side of ['top','bottom'])for(const depth of [1,1.5,2,2.5,3,4,5,7,10])for(const fraction of [.15,.3,.5,.7,.85]){
     const x=b.left+b.width*fraction,y=(side==='top'?b.top+depth:b.bottom-depth)*d,candidates=[];
     for(let dx=-16;dx<=16;dx+=.25){let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0;
      for(let t=-12*d;t<=12*d;t+=2)for(let k=0;k<3;k++){
       const a=sample(native,x*d+t,y,k),v=sample(raw,(x+dx)*d+t,180*d,k);
       sa+=a;sb+=v;saa+=a*a;sbb+=v*v;sab+=a*v;n++;
      }
      const va=saa/n-(sa/n)**2,vb=sbb/n-(sb/n)**2,cov=sab/n-sa*sb/(n*n),corr=cov/Math.sqrt(va*vb);
      candidates.push({dx,error:va-cov*cov/vb,corr});
     }
     candidates.sort((a,b)=>a.error-b.error);rows.push({id:host.id,side,depth,fraction,...candidates[0]});
    }
   }
   return rows;
  });
  fs.writeFileSync(path.join(__dirname,'artifacts/tangential-inference.json'),JSON.stringify(result,null,2));
  for(const id of [...new Set(result.map(r=>r.id))])for(const side of ['top','bottom']){
   console.log(id,side);
   for(const depth of [1,1.5,2,2.5,3,4,5,7,10])console.log(depth,result.filter(r=>r.id===id&&r.side===side&&r.depth===depth).map(r=>`${r.fraction}: ${r.dx} (${r.corr.toFixed(2)})`).join(' | '));
  }
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
