"""OSM snapshot QA image only: not a browser or verified campus map."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
buildings = json.loads((ROOT/'exports/full_campus_buildings.geojson').read_text())['features']
paths = json.loads((ROOT/'exports/full_campus_paths.geojson').read_text())['features']
lon0,lat0,lon1,lat1 = 126.895,35.166,126.921,35.185
w,h=1400,1120
def xy(p):return (round((p[0]-lon0)/(lon1-lon0)*w),round((lat1-p[1])/(lat1-lat0)*h))
im=Image.new('RGB',(w,h+90),'#e9eee5');d=ImageDraw.Draw(im)
for f in buildings:
    pts=[xy(p) for p in f['geometry']['coordinates'][0]]
    d.polygon(pts,fill='#a8aea9',outline='#697e79',width=1)
for f in paths:
    t=f['properties']['highway']
    color='#c05a4e' if t=='steps' else '#408e75' if t in ('footway','path') else '#d79953'
    d.line([xy(p) for p in f['geometry']['coordinates']],fill=color,width=2)
d.rectangle((0,h,w,h+90),fill='#182f36')
d.text((22,h+15),'OSM SNAPSHOT QA | 1,422 building ways | 928 path ways',fill='#ffffff')
d.text((22,h+44),'NO official campus boundary / DEM / car-road polygons. NOT a browser screenshot.',fill='#ffdc9b')
out=ROOT/'docs/full-campus-osm-qa.png';im.save(out);print(out)
