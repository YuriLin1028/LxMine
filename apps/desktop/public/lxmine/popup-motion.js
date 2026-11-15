/* Original motion model fitted to LxMine's native system Menu recording.
   Units: milliseconds, uniform scale, width-relative x, CSS-pixel y, opacity.
   Source and registration confidence: qa/material/artifacts/native-menu-20261019. */
(function(root){
'use strict';
const entry=[[0,0.2,0,-8,0],[24.576,0.38,-0.00286,-3.9871,0.1687],[41.249,0.47,-0.00995,-1.9431,0.3793],[57.922,0.57,-0.01291,-0.9337,0.5834],[74.596,0.66,-0.01754,-0.572,0.695],[91.269,0.74,-0.02138,-0.4374,0.7685],[107.942,0.81,-0.02443,-0.5299,0.783],[124.615,0.87,-0.02916,-0.8496,0.7899],[141.288,0.91,-0.03478,-0.3617,0.7899],[157.962,0.95,-0.03793,-0.2944,0.8204],[174.635,0.97,-0.04443,0.5804,0.8267],[191.308,0.99,-0.04847,1.0346,0.8613],[207.981,1.01,-0.04512,1.0683,0.8802],[224.654,1.01,-0.04759,1.4889,0.91],[241.328,1.02,-0.04345,1.716,0.942],[258.001,1.02,-0.04099,2.1366,0.9577],[274.674,1.02,-0.03852,2.1366,0.9737],[291.347,1.02,-0.0336,2.1366,0.9762],[308.02,1.02,-0.02867,1.716,0.9762],[324.694,1.01,-0.03034,1.9094,0.9762],[341.367,1.01,-0.02296,1.9094,0.9762],[358.04,1.01,-0.02049,1.4889,0.9762],[374.713,1.0,-0.0197,1.6823,0.9762],[391.386,1.0,-0.01724,1.6823,0.9762],[408.06,1.0,-0.01232,1.2617,0.9762],[424.733,1.0,-0.00985,1.2617,0.9762],[441.406,1.0,-0.00739,0.8412,0.9762],[458.079,1.0,-0.00493,0.8412,0.9762],[474.752,1.0,-0.00493,0.8412,0.9762],[491.426,1.0,-0.00246,0.4206,0.9762],[508.099,1.0,-0.00246,0.4206,0.9762],[524.772,1.0,-0.00246,0.4206,0.9762],[541.445,1.0,0.0,0.4206,0.9762],[558.119,1.0,0.0,0.0,0.9922],[574.792,1.0,0.0,0.0,0.9922],[591.465,1.0,0.0,0.0,0.9922],[608.138,1.0,0.0,0.0,0.9922],[624.811,1.0,0.0,0.0,0.9922],[641.485,1.0,0.0,0.0,0.9922],[658.158,1.0,0.0,0.0,0.9922],[674.831,1.0,0.0,0.0,0.9922],[691.504,1.0,0.0,0.0,0.9922],[740,1,0,0,1]];
function open(node){
 const width=node.offsetWidth,up=node.classList.contains('above')?-1:1,side=Number(node.dataset.popupOriginX)<.5?-1:1;
 const frames=entry.map(([time,scale,x,y,opacity])=>({offset:time/740,transform:`translate(${x*width*side}px,${y*up}px) scale(${scale})`,opacity}));
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
 const animation=node.animate(frames,{duration:740,easing:'linear',fill:'both'});
 animation.finished.then(()=>{if(node.isConnected)animation.cancel()}).catch(()=>{});
 return animation;
}
function close(node){
 const computed=getComputedStyle(node),matrix=new DOMMatrixReadOnly(computed.transform==='none'?undefined:computed.transform);
 const initialScale=Math.hypot(matrix.a,matrix.b),initialOpacity=Number(computed.opacity),x=matrix.e,y=matrix.f;
 const previous=node.getAnimations();for(const animation of previous)animation.cancel();
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();
 const frames=[[0,1,1],[16.67,.98,.94],[33.33,.92,.8],[50,.86,.6],[66.67,.79,.35],[83.33,.73,.13],[100,.69,.03],[150,.6,0]].map(([time,scale,opacity])=>({offset:time/150,transform:`translate(${x*(1-time/150)}px,${y*(1-time/150)}px) scale(${scale*initialScale})`,opacity:opacity*initialOpacity}));
 return node.animate(frames,{duration:150,easing:'linear',fill:'forwards'}).finished.catch(()=>{});
}
root.LxPopupMotion={open,close};
})(window);
