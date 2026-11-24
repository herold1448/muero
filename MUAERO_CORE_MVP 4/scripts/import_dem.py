"""Create a small WGS84 terrain grid from an authorized DEM.

Requires rasterio and pyproj (pip install rasterio pyproj), only for importing.
No terrain is packaged until a real raster and its vertical datum are supplied.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

BOUND = (126.896, 35.167, 126.919, 35.184)  # app extent, not campus boundary


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def convert(path, out, vertical_datum, license_name, source, samples):
    import rasterio
    from rasterio.warp import transform_bounds, transform
    from rasterio.windows import from_bounds
    from rasterio.enums import Resampling
    import numpy as np
    if not vertical_datum or not license_name or not source:
        raise ValueError('Vertical datum, license and source are required')
    with rasterio.open(path) as ds:
        if ds.crs is None or ds.nodata is None:
            raise ValueError('DEM CRS and NoData must be declared')
        extent = transform_bounds('EPSG:4326', ds.crs, *BOUND, densify_pts=21)
        window = from_bounds(*extent, transform=ds.transform).round_offsets().round_lengths()
        if window.col_off<0 or window.row_off<0 or window.col_off+window.width>ds.width or window.row_off+window.height>ds.height:
            raise ValueError('DEM has incomplete coverage of the app extent')
        if window.width < 2 or window.height < 2:
            raise ValueError('DEM does not cover the campus extent')
        # Whole-campus export is deliberately moderate resolution; original DEM is retained separately.
        n = min(samples, int(window.width)); m = min(samples, int(window.height))
        array = ds.read(1, window=window, out_shape=(m, n), masked=True,
                        resampling=Resampling.bilinear)
        if array.mask is np.ma.nomask:
            mask = np.zeros((m, n), dtype=bool)
        else:
            mask = np.ma.getmaskarray(array)
        if np.any(mask) or not np.isfinite(np.asarray(array)).all():
            raise ValueError('NoData within the resampled DEM: do not fill by invention')
        t = ds.window_transform(window)
        # Raster rows are north-to-south and columns west-to-east. Grid can be
        # rotated in source CRS: retain each cell's actual WGS84 position.
        lon, lat = [], []
        for row in range(m):
            for col in range(n):
                x, y = t * ((col + .5) * window.width / n, (row + .5) * window.height / m)
                a, b = transform(ds.crs, 'EPSG:4326', [x], [y]);lon.append(a[0]);lat.append(b[0])
        z = np.asarray(array, dtype=float)
        base = float(np.floor(z.min()))
        payload = {'schema': 'muaero-dem-grid-v1', 'source': source,
                   'source_sha256': sha256(path),
                   'license': license_name, 'source_crs': str(ds.crs),
                   'vertical_datum': vertical_datum, 'source_resolution': list(ds.res),
                   'resampling': 'bilinear', 'unit': 'metre', 'vertical_exaggeration': 1,
                   'height_origin_m': base, 'rows': m, 'cols': n,
                   'lon': [round(v, 8) for v in lon], 'lat': [round(v, 8) for v in lat],
                   'relative_height_m': [round(float(v-base), 3) for v in z.flat]}
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
        return payload


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('raster', type=Path)
    p.add_argument('--vertical-datum', required=True)
    p.add_argument('--license', required=True)
    p.add_argument('--source', required=True)
    p.add_argument('--samples', type=int, default=160)
    p.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[1] / 'data/terrain/grid.json')
    args = p.parse_args()
    if args.samples < 8 or args.samples > 256:p.error('--samples must be 8..256')
    result = convert(args.raster, args.out, args.vertical_datum, args.license, args.source, args.samples)
    print(f"DEM grid saved {result['cols']}×{result['rows']} with source CRS and datum metadata")
