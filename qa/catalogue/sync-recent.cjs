const {_electron}=require('../../apps/desktop/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=path.resolve('.research/sync-recent-qa');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const profile=path.join(out,'profile-'+Date.now());fs.mkdirSync(profile);fs.writeFileSync(path.join(profile,'lansync-device.json'),JSON.stringify({id:'qa-sync-recent',name:'LxMine 同步修复测试'}));
 const app=await _electron.launch({executablePath:path.resolve(process.env.LM_QA_EXE||'apps/desktop/node_modules/electron/dist/electron.exe'),args:process.env.LM_QA_EXE?[]:[path.resolve('apps/desktop')],env:{...process.env,MINERADIO_STARTUP_QA_HIDDEN:'1',MINERADIO_STARTUP_QA_USER_DATA:profile,MINERADIO_NO_DESKTOP_SHORTCUT:'1',MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE:'1'}});
 try{
 const page=await app.firstWindow();await page.waitForFunction(()=>window.__lxmine?.S&&window.lxMusic?.syncStatus);
 await page.evaluate(()=>window.__lxmine.setTab('library'));await page.getByText('最近播放',{exact:true}).waitFor();
 const status=await page.evaluate(()=>window.lxMusic.syncStatus());
 const bundle=process.env.LM_REAL_PHONE_PAYLOAD ? JSON.parse(fs.readFileSync(process.env.LM_REAL_PHONE_PAYLOAD)) : {
 protocol:'lxlia-lansync/1',version:1,device:{id:'qa-harmony',name:'测试手机',platform:'harmony'},settings:{},activeSourceId:'source-0',
 sources:Array.from({length:16},(_,i)=>({id:'source-'+(i<12?i:i-12),name:'测试音源 '+i,script:'/* @name QA '+i+' */',importedAt:1})),
 playlists:[0,200,328].map((count,i)=>({id:'qa-list-'+i,name:'测试歌单 '+i,songs:Array.from({length:count},(_,j)=>({id:String(j),source:'kw',name:'测试歌曲 '+j,singer:'测试'}))}))
 };
 await app.evaluate(()=>{const fs=process.getBuiltinModule('fs');global.__qaRename=fs.renameSync;global.__qaFailOnce=true;fs.renameSync=(a,b)=>{if(global.__qaFailOnce&&b.endsWith('built-in-playlists.json')){global.__qaFailOnce=false;throw Error('QA simulated disk failure');}return global.__qaRename(a,b);};});
 let completed=false;const response=fetch('http://127.0.0.1:'+status.port+'/lxlia-sync/push',{method:'POST',body:JSON.stringify(bundle)}).then(r=>{completed=true;return r.json();});
 await page.getByRole('button',{name:'接收并覆盖',exact:true}).click();
 await page.getByText('QA simulated disk failure',{exact:true}).waitFor();
 assert.equal(completed,false);assert.equal((await page.evaluate(()=>window.lxMusic.syncPending())).length,1);
 await page.getByRole('button',{name:'接收并覆盖',exact:true}).click();assert.equal((await response).accepted,true);
 await app.evaluate(()=>{process.getBuiltinModule('fs').renameSync=global.__qaRename;});
 const saved=JSON.parse(fs.readFileSync(path.join(profile,'built-in-playlists.json')));assert.equal(saved.playlists.length,3);assert.equal(saved.playlists.reduce((n,p)=>n+p.tracks.length,0),528);
 const sources=JSON.parse(fs.readFileSync(path.join(profile,'lx-sources.json')));assert.equal(sources.sources.length,16);
 console.log('PASS actual phone payload through UI, first-save failure, same-request retry, 16 sources, 3 playlists, 528 songs');
 const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
 const song={id:'qa-history',source:'local',provider:'local',name:'最近播放回归验证',singer:'测试',localUrl:'data:audio/wav;base64,'+wav.toString('base64')};
 await page.evaluate(song=>window.__lxmine.playSong(song,[song]),song);await page.waitForFunction(()=>window.__lxmine.S.recentlyPlayed[0]?.id==='qa-history');
 await page.evaluate(()=>document.querySelector('#audio').pause());await page.evaluate(()=>window.__lxmine.setTab('library'));await page.getByText('最近播放',{exact:true}).click();await page.getByText('最近播放回归验证',{exact:true}).waitFor();
 await page.reload();await page.waitForFunction(()=>window.__lxmine?.S.recentlyPlayed[0]?.id==='qa-history');
 assert.equal(await page.evaluate(()=>window.__lxmine.S.recentlyPlayed.filter(s=>s.id==='qa-history').length),1);
 assert.equal(await page.evaluate(()=>document.querySelector('#audio').paused),true);
 await page.evaluate(()=>{const key='lxmine.pc.v1';const value=JSON.parse(localStorage.getItem(key));value.resumeOnStartup=true;localStorage.setItem(key,JSON.stringify(value));});
 await page.reload();await page.waitForFunction(()=>window.__lxmine?.S.playing===true);
 await page.evaluate(()=>{document.querySelector('#audio').pause();const key='lxmine.pc.v1';const value=JSON.parse(localStorage.getItem(key));value.resumeOnStartup=false;localStorage.setItem(key,JSON.stringify(value));});
 console.log('PASS actual audio history, restart persistence, silent default startup and opt-in resume');
 if(process.env.LM_PHONE_TEST){
 fs.writeFileSync(path.join(out,'receiver.json'),JSON.stringify({profile,port:status.port}));
 console.log('READY_PHONE_RECEIVER');
 let received=0; for(let i=0;i<600;i++){
 const pending=await page.evaluate(()=>window.lxMusic.syncPending());
 if(pending.length){await page.getByRole('button',{name:'接收并覆盖',exact:true}).click();await page.waitForTimeout(500);const lists=JSON.parse(fs.readFileSync(path.join(profile,'built-in-playlists.json')));console.log('PASS live device sync',JSON.stringify({device:pending[0].peer?.platform,peer:pending[0].peer?.name,peerId:pending[0].peer?.id,playlists:lists.playlists.length,songs:lists.playlists.reduce((n,p)=>n+p.tracks.length,0)}));fs.writeFileSync(path.join(out,'live-phone-pass.json'),JSON.stringify({playlists:lists.playlists.length,songs:lists.playlists.reduce((n,p)=>n+p.tracks.length,0)}));if(++received===2) break;}
 await page.waitForTimeout(1000);
 }
 }
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
