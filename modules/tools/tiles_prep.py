import sys,glob,os
from PIL import Image,ImageDraw
src,dst=sys.argv[1],sys.argv[2]
for p in glob.glob(src+'/*.png'):
    im=Image.open(p).convert('RGBA'); W,H=im.size; m=10
    mask=Image.new('L',(W,H),0); d=ImageDraw.Draw(mask)
    w=W-2*m; h=H-2*m
    d.polygon([(m+w*.25,m),(m+w*.75,m),(m+w,m+h/2),(m+w*.75,m+h),(m+w*.25,m+h),(m,m+h/2)],fill=255)
    a=Image.composite(im.getchannel('A'),Image.new('L',(W,H),0),mask); im.putalpha(a)
    name=os.path.basename(p).split('_',1)[1]; im.crop(im.getbbox() or (0,0,W,H)).save(os.path.join(dst,name))
