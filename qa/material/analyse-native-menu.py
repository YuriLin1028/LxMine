"""Read native 60 Hz recordings; retain measured frames, never synthesize references."""
import sys,json,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'.research/qa-python'))
import cv2
from PIL import Image,ImageDraw
base=pathlib.Path(__file__).parent/'artifacts/native-menu-20261019'
video=cv2.VideoCapture(str(base/'native.mp4'));fps=video.get(cv2.CAP_PROP_FPS)
out=Image.new('RGB',(6*224,4*510),(24,24,24));draw=ImageDraw.Draw(out)
start=14.25;frames=[]
for i in range(24):
 t=start+i/60*2
 video.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,frame=video.read()
 if not ok:continue
 gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY);edges=cv2.Canny(gray,24,64)
 contours,_=cv2.findContours(edges,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
 candidates=[]
 for contour in contours:
  x,y,w,h=cv2.boundingRect(contour)
  if x>350 and y>100 and w>45 and h>150 and h/w>1.5 and x+w<890:
   candidates.append(dict(x=x,y=y,w=w,h=h,area=cv2.contourArea(contour)))
 candidates.sort(key=lambda r:r['w']*r['h'],reverse=True)
 frames.append(dict(time=t,candidates=candidates[:4]))
 im=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB));im.thumbnail((224,480));x=i%6*224;y=i//6*510
 out.paste(im,(x,y+24));draw.text((x+4,y+4),f'{t:.3f}s',fill='white')
out.save(base/'entry-frames.png');(base/'entry-contours.json').write_text(json.dumps(dict(fps=fps,frames=frames),indent=2))
print(json.dumps(frames[::3]))
