const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./lib-Dr6R-_bh.js","./rolldown-runtime-BWaJ3C7D.js","./Shader-KDjK__jA.js","./index-BkKQm92A.js","./react-CaKr0epQ.js","./index-BVImDccp.css","./CanvasSource-BdFTu7bt.js","./Geometry-DDjL_puP.js","./canvasUtils-D-Yuw3IX.js","./Cache-CuFRI9m4.js","./VividLightBlend-EDkapONR.js","./RenderTargetSystem-DMzVAMBt.js","./GCManagedHash-Dvyd3goQ.js","./GraphicsContext-CetBaf0E.js","./getTextureBatchBindGroup-jbh8aa96.js","./VisualizerShell-BoyKoP2y.js","./getTexelRangeRects-Bmc_kolF.js"])))=>i.map(i=>d[i]);
import{j as e}from"./index-BkKQm92A.js";var t=Symbol.for(`folia.pixi821FilterPoolCompat`),n=e=>{if(e.VERSION!==`8.21.0`)return;let n=e.FilterSystem.prototype;if(n[t])return;n[t]=!0;let r=new Set,i=e.TexturePool,a=()=>{let t=e.Texture.EMPTY.source;r.forEach(e=>{e.setResource(t,1),e.setResource(t.style,2),e.setResource(t,3)})},o=n.init;n.init=function(){o?.call(this),r.add(this._globalFilterBindGroup)};let s=n.destroy;n.destroy=function(){r.delete(this._globalFilterBindGroup),this._globalFilterBindGroup.destroy(),s.call(this)};let c=n.push;n.push=function(e){let t=this._filterStack[this._filterStackIndex];t&&(t.inputTexture=null),c.call(this,e)};let l=i._dropTextures;i._dropTextures=function(e,t){t&&e.length>0&&a(),l.call(this,e,t)};let u=i.returnTexture;i.returnTexture=function(e,t){let n=this._poolKey[e.uid];n!==void 0&&!this._buckets.has(n)&&a(),u.call(this,e,t)}},r=async()=>{let t=await e(()=>import(`./lib-Dr6R-_bh.js`).then(e=>e.t),__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]),import.meta.url);return t.GlProgram.defaultOptions.preferredFragmentPrecision=`highp`,n(t),t},i=class{constructor(e){this.hooks=e,this.scenes=new Map,this.retired=[]}get size(){return this.scenes.size}get hasRetired(){return this.retired.length>0}has(e){return this.scenes.has(e)}get(e){return this.scenes.get(e)}forEach(e){this.scenes.forEach(e)}ensure(e){if(e<0||e>=this.hooks.count())return null;let t=this.scenes.get(e);if(t)return t;let n=this.hooks.build(e);return this.scenes.set(e,n),n}adopt(e,t){this.scenes.set(e,t)}prune(e,t){this.scenes.forEach((n,r)=>{Math.abs(r-e)<=1||t?.has(r)||(this.hooks.destroy(n),this.scenes.delete(r))})}clear(){this.scenes.forEach(e=>this.hooks.destroy(e)),this.scenes.clear()}retireAll(){this.scenes.forEach(e=>{this.hooks.detach?.(e),this.retired.push(e)}),this.scenes.clear()}drainRetired(){let e=this.retired.shift();return e!==void 0&&(this.hooks.destroy(e),!0)}destroyAll(){this.clear(),this.retired.forEach(e=>this.hooks.destroy(e)),this.retired.length=0}},a=`
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;export{i as n,r,a as t};