"""Extract a reproducible WGS84 pilot layer without altering the routing graph."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BBOX = (126.9042, 35.1720, 126.9075, 35.1776)
ORIGIN = (126.9078, 35.1765)


def intersects(bounds):
    return (bounds['maxlon'] >= BBOX[0] and bounds['minlon'] <= BBOX[2]
            and bounds['maxlat'] >= BBOX[1] and bounds['minlat'] <= BBOX[3])


def feature(element, kind):
    coordinates = [[p['lon'], p['lat']] for p in element['geometry']]
    tags = element.get('tags', {})
    levels = tags.get('building:levels')
    try:
        levels = int(levels)
    except (ValueError, TypeError):
        levels = None
    height_tag = tags.get('height')
    props = {
        'kind': kind, 'osmId': element['id'], 'osmTags': tags,
        'geometrySource': '© OpenStreetMap contributors; surveyed accuracy unknown',
        'fieldVerified': False,
    }
    if kind == 'building':
        props.update(name=tags.get('name'), floorsFromOSM=levels,
                     measuredHeightM=None, verifiedRoofShape=None,
                     groundElevationM=None, entranceCoordinate=None,
                     facadeFromVideo='not geographically matched')
        geometry = {'type': 'Polygon', 'coordinates': [coordinates]}
    else:
        props.update(measuredWidthM=None, measuredSlopePct=None,
                     passableByWheelchair=None,
                     stairBarrier=tags.get('highway') == 'steps')
        geometry = {'type': 'LineString', 'coordinates': coordinates}
    return {'type': 'Feature', 'id': f"osm:way/{element['id']}",
            'geometry': geometry, 'properties': props}


def main():
    building_source = json.loads((ROOT / 'data/campus_buildings.json').read_text())
    path_source = json.loads((ROOT / 'data/campus_paths.json').read_text())
    buildings = [feature(e, 'building') for e in building_source['elements']
                 if e['type'] == 'way' and intersects(e['bounds'])]
    paths = [feature(e, 'path') for e in path_source['elements']
             if e['type'] == 'way' and intersects(e['bounds'])]
    output = {
        'type': 'FeatureCollection',
        'metadata': {
            'title': 'MUAERO main gate vicinity to Main Library pilot',
            'crs': 'EPSG:4326; GeoJSON position order longitude,latitude',
            'selectionBBox': BBOX,
            'selection': 'Full OSM geometry if element bounds intersects the bbox',
            'renderOriginLonLat': ORIGIN,
            'gateCandidateLonLat': [126.9046448, 35.1723634],
            'gateCandidateProvenance': 'Southern endpoint of OSM way 1120956407 (민주대로); identification with E01 main gate remains unverified',
            'pilotRouteExcludesWayIds': [1120956407],
            'pilotRouteExclusionReason': 'The user-supplied video shows traffic lanes on a tree-lined avenue, whereas the possibly corresponding OSM way says pedestrian; exact feature matching is unverified',
            'buildingsOSMTimestamp': building_source['osm3s']['timestamp_osm_base'],
            'pathsOSMTimestamp': path_source['osm3s']['timestamp_osm_base'],
            'osmLicense': 'ODbL 1.0, © OpenStreetMap contributors',
            'heightDatum': None,
            'sourceVideo': 'Naver streetview screen recording; timecoded visual observations only, no frames or derived textures redistributed',
        },
        'features': buildings + paths,
    }
    target = ROOT / 'data/gate_library_pilot.geojson'
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(f'{target}: {len(buildings)} buildings, {len(paths)} paths')


if __name__ == '__main__':
    main()
