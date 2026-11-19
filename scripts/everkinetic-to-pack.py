"""Converts Everkinetic drawings (github.com/everkinetic/data, CC BY-SA 4.0) into pack photos.

Usage: python3 -I scripts/everkinetic-to-pack.py <everkinetic clone> public/exercise-pack/img 0128=pt_Barbell_Reverse_Lunge ...
Each Everkinetic id gives <pack id>-0.webp (relaxation) and -1.webp (tension): trimmed, centred on a white 480x320
(3:2, like the pack photos) canvas, WebP quality 70 (~6-10 KB). Then list them in assets-src/exercises/exercise-extras.json as
`ownImages` with `imageCredit` and run `node scripts/build-exercise-pack.mjs --manifest-only`. See docs/EXERCISE_PACK.md.
"""
import sys,os
from PIL import Image
src,out=sys.argv[1],sys.argv[2]
pairs=[a.split('=') for a in sys.argv[3:]]  # ek_id=pack_id
for ek,pid in pairs:
  for n,s in enumerate(['relaxation','tension']):
    im=Image.open(f'{src}/dist/png/{ek}-{s}.png').convert('L')
    bbox=Image.eval(im,lambda v:255-v).getbbox(); im=im.crop(bbox)
    W,H=480,320; pad=12
    im.thumbnail((W-2*pad,H-2*pad),Image.LANCZOS)
    c=Image.new('L',(W,H),255); c.paste(im,((W-im.width)//2,(H-im.height)//2))
    f=f'{out}/{pid}-{n}.webp'; c.convert('RGB').save(f,'WEBP',quality=70,method=6); print(f,os.path.getsize(f))
