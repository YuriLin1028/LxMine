import pathlib,sys,json
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'.research/qa-python'))
import cv2,numpy as np
base=pathlib.Path(__file__).parent/'artifacts/native-menu-20261019'
cap=cv2.VideoCapture(str(base/'native.mp4'));fps=cap.get(cv2.CAP_PROP_FPS)
cap.set(cv2.CAP_PROP_POS_MSEC,15300);_,ref=cap.read();reference=cv2.cvtColor(ref[270:307,486:804],cv2.COLOR_BGR2GRAY)
rows=[]
start=float(sys.argv[1]) if len(sys.argv)>1 else 14.35
end=float(sys.argv[2]) if len(sys.argv)>2 else 15.15
label=sys.argv[3] if len(sys.argv)>3 else 'motion-track'
for frame_no in range(round(start*fps),round(end*fps)):
 cap.set(cv2.CAP_PROP_POS_FRAMES,frame_no);ok,frame=cap.read()
 if not ok:break
 roi=cv2.cvtColor(frame[170:410,360:880],cv2.COLOR_BGR2GRAY);best=(-1,None)
 for scale in np.arange(.2,1.081,.01):
  template=cv2.resize(reference,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA)
  result=cv2.matchTemplate(roi,template,cv2.TM_CCOEFF_NORMED);_,score,_,location=cv2.minMaxLoc(result)
  if score>best[0]:best=(score,dict(scale=round(float(scale),3),x=location[0]+360,y=location[1]+170))
 if best[0]<.65:continue
 item=best[1];template=cv2.resize(reference,None,fx=item['scale'],fy=item['scale'],interpolation=cv2.INTER_AREA)
 h,w=template.shape;actual=cv2.cvtColor(frame[item['y']:item['y']+h,item['x']:item['x']+w],cv2.COLOR_BGR2GRAY).astype(float)
 a=template.astype(float);slope=float(np.mean((a-a.mean())*(actual-actual.mean()))/max(.001,a.var()))
 row=dict(frame=frame_no,time=frame_no/fps,confidence=best[0],opacityEstimate=min(1,max(0,slope)),**item);rows.append(row)
payload=dict(source='native.mp4',fps=fps,method='multiscale normalized header template matching',reference=dict(time=15.3,rect=[486,270,318,37]),samples=rows)
(base/(label+'.json')).write_text(json.dumps(payload,indent=2))
print(json.dumps(rows))
