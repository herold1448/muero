"""Audit bundled OSM snapshots without inventing a university boundary."""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
OUT = ROOT / 'exports'
OUT.mkdir(exist_ok=True)


def source(name):
    raw = (DATA / name).read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def polygon(element):
    ring = [[p['lon'], p['lat']] for p in element.get('geometry', [])
            if 'lon' in p and 'lat' in p]
    if len(ring) < 4 or ring[0] != ring[-1]:
        return None, 'not_closed_or_short'
    if len(set(map(tuple, ring[:-1]))) < 3:
        return None, 'degenerate'
    return {'type': 'Polygon', 'coordinates': [ring]}, None


def line(element):
    pts = [[p['lon'], p['lat']] for p in element.get('geometry', [])
           if 'lon' in p and 'lat' in p]
    if len(pts) < 2 or len(set(map(tuple, pts))) < 2:
        return None
    return {'type': 'LineString', 'coordinates': pts}


buildings, bhash = source('campus_buildings.json')
paths, phash = source('campus_paths.json')
features, lines, qa = [], [], []
height = collections.Counter()
types = collections.Counter()
for element in buildings['elements']:
    if element['type'] != 'way':
        continue
    geometry, problem = polygon(element)
    tags = element.get('tags', {})
    if problem:
        qa.append({'osm_type': 'way', 'osm_id': element['id'], 'problem': problem})
    if not geometry:
        continue
    if tags.get('height'):
        height['osm_height_tag'] += 1
    elif tags.get('building:levels'):
        height['osm_levels_estimate'] += 1
    else:
        height['unknown'] += 1
    features.append({'type': 'Feature', 'id': f"way/{element['id']}",
                     'geometry': geometry, 'properties': {
                         'osm_id': element['id'], 'name': tags.get('name'),
                         'campus_membership': 'boundary_unknown',
                         'height_m_measured': None,
                         'height_source': ('osm_tag' if tags.get('height') else
                                           'levels_estimate' if tags.get('building:levels') else 'unknown'),
                         'ground_elevation_m': None, 'lod': 0,
                         'tags': tags}})
for element in paths['elements']:
    if element['type'] != 'way':
        continue
    geometry = line(element)
    if not geometry:
        qa.append({'osm_type': 'way', 'osm_id': element['id'], 'problem': 'short_line'})
        continue
    tags = element.get('tags', {})
    types[tags.get('highway', 'unknown')] += 1
    lines.append({'type': 'Feature', 'id': f"way/{element['id']}",
                  'geometry': geometry, 'properties': {
                      'osm_id': element['id'], 'highway': tags.get('highway'),
                      'classification_source': 'osm_tag',
                      'width_m_measured': None, 'slope_percent_measured': None,
                      'campus_membership': 'boundary_unknown', 'tags': tags}})
def write(name, payload):
    (OUT / name).write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')

write('full_campus_buildings.geojson', {'type': 'FeatureCollection', 'features': features})
write('full_campus_paths.geojson', {'type': 'FeatureCollection', 'features': lines})
catalog = json.loads((DATA / 'official_campus_catalog.json').read_text())
names = collections.defaultdict(list)
for feature in features:
    if feature['properties']['name']:
        names[feature['properties']['name']].append(feature['properties']['osm_id'])
catalog_check = [{'code': entry['code'], 'official_name': entry['name'],
                  'exact_name_osm_ids': names.get(entry['name'], []),
                  'status': 'name_only_not_spatially_verified' if names.get(entry['name']) else 'no_exact_name_match'}
                 for entry in catalog['entries']]
write('official_name_audit.json', {'source': catalog['source'], 'catalog_count': len(catalog_check),
                                  'exact_name_matches': sum(bool(e['exact_name_osm_ids']) for e in catalog_check),
                                  'entries': catalog_check})
write('full_campus_qa.json', {
    'source_sha256': {'campus_buildings.json': bhash, 'campus_paths.json': phash},
    'coverage': 'source_extent_only_not_official_campus_boundary',
    'official_campus_boundary': None,
    'building_ways_in_snapshot': len(buildings['elements']),
    'building_footprints_exported': len(features),
    'building_membership_verified': 0,
    'building_heights': dict(height),
    'pedestrian_ways_in_snapshot': len(paths['elements']),
    'lines_exported': len(lines),
    'highway_tags': dict(types),
    'motor_road_polygons': 0,
    'terrain_dem': None,
    'official_building_catalog_count': len(catalog_check),
    'official_exact_name_matches_not_spatially_verified': sum(bool(e['exact_name_osm_ids']) for e in catalog_check),
    'osm_relation_multipolygons_in_snapshot': 0,
    'qa': qa,
    'limitations': ['No official campus polygon', 'No DEM', 'No motor road snapshot',
                    'Source contains only ways; relation multipolygons absent',
                    'OSM way count does not establish full-campus building completeness']})
print(f"exported {len(features)} buildings, {len(lines)} lines; QA issues {len(qa)}")
