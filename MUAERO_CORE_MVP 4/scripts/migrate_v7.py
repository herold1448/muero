#!/usr/bin/env python3
"""Import v7 local data into v8 without overwriting an existing v8 record."""
import json
import shutil
import sys
from pathlib import Path

if len(sys.argv)!=2:
    raise SystemExit('사용법: python3 scripts/migrate_v7.py /path/to/GILON_JNU_v7')
source=Path(sys.argv[1]).expanduser().resolve()/'data'
target=Path(__file__).resolve().parents[1]/'data'
if not source.is_dir():
    raise SystemExit(f'v7 data 폴더를 찾을 수 없습니다: {source}')
for name in ('reports.json','reviews.json','entrances.json','history.json','campus_roads.json',
             'campus_paths.json','campus_buildings.json'):
    old=source/name
    new=target/name
    if not old.exists():
        continue
    try:
        obj=json.loads(old.read_text('utf-8'))
        if name.startswith('campus_') and not isinstance(obj.get('elements'),list):
            raise ValueError('OSM elements 배열 없음')
        if name in ('reports.json','entrances.json','history.json') and not isinstance(obj,list):
            raise ValueError('목록 형식 아님')
        if name=='reviews.json' and not isinstance(obj,dict):
            raise ValueError('기록 형식 아님')
    except (ValueError,AttributeError) as exc:
        print('건너뜀(형식 오류):',name,exc)
        continue
    if new.exists():
        if new.read_bytes()==old.read_bytes():
            print('동일 파일 유지:',name)
            continue
        if name.startswith('campus_') and name!='campus_roads.json':
            stock=target/(name+'.v8-bundled-backup')
            if not stock.exists():
                shutil.copy2(new,stock)
            shutil.copy2(old,new)
            print('v7에 추가한 OSM 원본 적용, 동봉 원본 백업:',name)
            continue
        print('기존 v8 파일 유지(자동 덮어쓰기 방지):',name)
        continue
    shutil.copy2(old,new)
    print('v7 데이터 복사:',name)
