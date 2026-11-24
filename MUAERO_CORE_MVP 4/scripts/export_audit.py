#!/usr/bin/env python3
"""Convert bundled Overpass OSM elements to classified GIS overlays; no network needed."""
from pathlib import Path
import json,collections
root=Path(__file__).resolve().parents[1]
ways=json.loads((root/'data/campus_paths.json').read_text())['elements']
buildings=json.loads((root/'data/campus_buildings.json').read_text())['elements']
out=root/'exports';out.mkdir(exist_ok=True)

def classify(t):
 h=t.get('highway','')
 if h=='steps':return 'stairs'
 if t.get('footway')=='crossing' or t.get('crossing'):return 'crossing'
 if t.get('footway')=='sidewalk':return 'sidewalk'
 if h=='pedestrian':return 'pedestrian'
 if h in ('footway','path'):return 'path'
 if h=='living_street':return 'shared'
 if h=='cycleway':return 'cycling'
 if h in ('residential','service','unclassified','tertiary','secondary','primary','track','road'):return 'road'
 return 'unknown'

def feat(w,kind):
 coords=[[p['lon'],p['lat']] for p in w.get('geometry',[])]
 if len(coords)<2:return None
 isbuilding=(kind=='building')
 if isbuilding and len(coords)>=4 and coords[0]==coords[-1]: geometry={'type':'Polygon','coordinates':[coords]}
 else:geometry={'type':'LineString','coordinates':coords}
 prop={'osm_way_id':w['id'],'group':kind,'source':'OpenStreetMap ODbL','field_verified':False,'osm_tags':w.get('tags',{})}
 return {'type':'Feature','geometry':geometry,'properties':prop}

groups=collections.defaultdict(list)
for w in ways:
 g=classify(w.get('tags',{}));f=feat(w,g)
 if f:groups[g].append(f)
for g,items in groups.items():
 (out/f'{g}.geojson').write_text(json.dumps({'type':'FeatureCollection','name':g,'features':items},ensure_ascii=False,separators=(',',':')))
bld=[feat(w,'building') for w in buildings];bld=[x for x in bld if x]
(out/'buildings.geojson').write_text(json.dumps({'type':'FeatureCollection','name':'buildings','features':bld},ensure_ascii=False,separators=(',',':')))
summary={'area':'전남대학교 광주캠퍼스 주변 OSM bbox (캠퍼스 경계 아님)','data_timestamp':'2026-11-19','path_count':len(ways),'building_count':len(buildings),'groups':{g:len(v) for g,v in groups.items()},'building_with_levels':sum('building:levels' in w.get('tags',{}) for w in buildings),'path_with_width':sum('width' in w.get('tags',{}) for w in ways),'path_with_kerb':sum('kerb' in w.get('tags',{}) for w in ways),'path_with_incline_tag':sum('incline' in w.get('tags',{}) for w in ways),'warning':'공개 OSM 속성에 기반한 분류로 휠체어 통행 안전성 검증자료가 아님. crossings also lack curb measurements.'}
(out/'audit-summary.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False))
print(json.dumps(summary,ensure_ascii=False,indent=2))
