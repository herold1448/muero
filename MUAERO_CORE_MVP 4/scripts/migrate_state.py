"""Copy existing local review/report state into a persistent volume without overwriting."""
import argparse
import re
import shutil
from pathlib import Path

FILES=('hazards.json','reviews.json','entrances.json','history.json','reports.json')

def migrate(source,destination):
 source=Path(source).resolve();destination=Path(destination).resolve()
 if source==destination:raise ValueError('Source and destination must differ')
 destination.mkdir(parents=True,exist_ok=True)
 candidates=[(source/name,destination/name) for name in FILES if (source/name).is_file()]
 photo_dir=source/'hazard_photos'
 if photo_dir.is_dir():
  for p in photo_dir.iterdir():
   if p.is_file() and re.fullmatch(r'[0-9a-f]{32}\.jpg',p.name):
    candidates.append((p,destination/'hazard_photos'/p.name))
 for _,q in candidates:
  if q.exists():raise FileExistsError(f'{q} already exists; preserve and compare it manually')
 copied=[]
 for p,q in candidates:
  q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q);copied.append(str(q.relative_to(destination)))
 return copied

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('destination',type=Path)
 args=parser.parse_args();print('Copied:',', '.join(migrate(args.source,args.destination)) or 'no existing state')
