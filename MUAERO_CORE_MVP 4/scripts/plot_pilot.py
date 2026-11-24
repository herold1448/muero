"""Generate a source-only geometry QA map; this is not a browser screenshot."""
import json
import math
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon

ROOT = Path(__file__).resolve().parents[1]
scene = json.loads((ROOT / 'data/gate_library_pilot.geojson').read_text())
route = json.loads((ROOT / 'data/gate_library_candidate_route.geojson').read_text())
lon0, lat0 = scene['metadata']['renderOriginLonLat']
to_xy = lambda p: ((p[0]-lon0)*111195*math.cos(math.radians(lat0)), (p[1]-lat0)*111195)
fig, ax = plt.subplots(figsize=(9, 11), dpi=155)
fig.patch.set_facecolor('#f3f5ee')
ax.set_facecolor('#e6edde')
for item in scene['features']:
    props = item['properties']
    if props['kind'] == 'building':
        coords = [to_xy(p) for p in item['geometry']['coordinates'][0]]
        is_library = props.get('name') == '중앙도서관'
        ax.add_patch(Polygon(coords, closed=True, facecolor='#a85c4d' if is_library else '#d4cdc0', edgecolor='#716f67', linewidth=.65))
    else:
        coords = [to_xy(p) for p in item['geometry']['coordinates']]
        xs, ys = zip(*coords)
        stairs = props['osmTags'].get('highway') == 'steps'
        ax.plot(xs, ys, c='#773f86' if stairs else '#acb9af', lw=1.2 if stairs else .85, zorder=2)
for item in route['features']:
    coords = [to_xy(p) for p in item['geometry']['coordinates']]
    xs, ys = zip(*coords)
    ax.plot(xs, ys, color='#da7440', lw=2, alpha=.9, zorder=3)
gx, gy = to_xy(scene['metadata']['gateCandidateLonLat'])
ax.scatter([gx], [gy], color='#246a85', s=80, zorder=5)
ax.annotate('OSM gate-area candidate\n(not surveyed)', (gx, gy), xytext=(12, -28), textcoords='offset points', fontsize=8, weight='bold')
library = next(p for p in scene['features'] if p['properties'].get('name') == '중앙도서관')
coords = [to_xy(p) for p in library['geometry']['coordinates'][0]]
cx = sum(p[0] for p in coords)/len(coords)
cy = sum(p[1] for p in coords)/len(coords)
ax.annotate('Main Library (B02)', (cx, cy), xytext=(16, 20), textcoords='offset points', fontsize=9, weight='bold', arrowprops=dict(arrowstyle='-', color='#ab694d'))
ax.set_aspect('equal', adjustable='box')
ax.set_xlim(-350, 80)
ax.set_ylim(-530, 190)
ax.set_xlabel('Local east (m, illustrative projection)')
ax.set_ylabel('Local north (m, illustrative projection)')
ax.set_title('MUAERO · OSM gate-area → Main Library geometry QA', fontsize=12)
ax.grid(alpha=.17)
fig.text(.1, .025, '© OpenStreetMap contributors (ODbL) · Candidate route is entirely unverified · No Naver imagery used', fontsize=8)
fig.savefig(ROOT / 'docs/pilot-osm-qa.png', bbox_inches='tight')
print('Wrote docs/pilot-osm-qa.png')
