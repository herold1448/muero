from pathlib import Path
import json
from collections import defaultdict
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.patches import Polygon,Patch
from matplotlib import rcParams
root=Path(__file__).resolve().parents[1]
paths=json.loads((root/'data/campus_paths.json').read_text())['elements']
blds=json.loads((root/'data/campus_buildings.json').read_text())['elements']
rcParams['font.family']='NanumSquare'
rcParams['axes.unicode_minus']=False
style={'sidewalk':('#22b995',2.4),'crossing':('#d09b4a',2.8),'path':('#a0c0b6',1.4),'pedestrian':('#718fba',3),'stairs':('#de6f56',3),'shared':('#776f78',3)}
def classify(t):
 if t.get('highway')=='steps':return 'stairs'
 if t.get('footway')=='crossing':return 'crossing'
 if t.get('footway')=='sidewalk':return 'sidewalk'
 if t.get('highway')=='pedestrian':return 'pedestrian'
 if t.get('highway')=='living_street':return 'shared'
 return 'path'
fig,ax=plt.subplots(figsize=(14,8),dpi=140);fig.patch.set_facecolor('#eff4ef');ax.set_facecolor('#e8f0e8')
# Convert degree longitude to approximate meters so spatial shapes retain correct proportions.
lat0=35.176;scale=.817
within=lambda t:any(35.169<=p.get('lat',0)<=35.183 and 126.897<=p.get('lon',0)<=126.916 for p in t)
for b in blds:
 pts=b.get('geometry',[])
 if len(pts)<3 or not within(pts):continue
 coords=[((p['lon']-126.906)*scale,(p['lat']-lat0)) for p in pts]
 ax.add_patch(Polygon(coords,closed=True,fc='#bdc5bc',ec='#a0aea5',lw=.35,alpha=.8,zorder=1))
lines=defaultdict(list)
for w in paths:
 pts=w.get('geometry',[])
 if len(pts)<2 or not within(pts):continue
 lines[classify(w['tags'])].append([((p['lon']-126.906)*scale,(p['lat']-lat0)) for p in pts])
for group,segs in lines.items():ax.add_collection(LineCollection(segs,colors=[style[group][0]],linewidths=style[group][1],alpha=.96,zorder={'stairs':5,'crossing':4,'sidewalk':3}.get(group,2)))
ax.set_xlim((126.897-126.906)*scale,(126.916-126.906)*scale);ax.set_ylim(35.169-lat0,35.183-lat0)
ax.set_aspect('equal',adjustable='box');ax.axis('off')
ax.set_title('전남대학교 주변 OSM 인도·횡단·계단 데이터 분류',fontsize=19,color='#143e36',fontweight='bold',pad=19)
legend=[Patch(facecolor=style[k][0],label=lab) for k,lab in [('sidewalk','별도 인도 364'),('crossing','횡단구간 155'),('path','기타 보행로 353'),('stairs','계단 36'),('pedestrian','보행 공간 8'),('shared','혼용도로 12')]]
legend+=[Patch(facecolor='#bdc5bc',label='건물 외곽 1,422')]
ax.legend(handles=legend,ncol=4,loc='lower center',bbox_to_anchor=(.5,-.04),frameon=False,fontsize=10)
fig.text(.5,.038,'자료: 사용자가 제공한 2026-11-19 OpenStreetMap 원본 데이터 (ODbL). 차도 전체·인도 폭·턱·경사 실측은 포함되지 않음. 실제 통행 안전성을 인증하지 않음.',ha='center',fontsize=9,color='#526f67')
fig.savefig(root/'classification-preview.png',bbox_inches='tight',pad_inches=.32)
print('wrote',root/'classification-preview.png')
