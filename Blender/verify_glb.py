#!/usr/bin/env python3
"""Parse each B0x.glb and city_base.glb in Frontend/public/models/city and check the naming contract."""
import json, struct, sys, os, glob
D = '/Users/mac/Documents/Cordon/Frontend/public/models/city'
def load(p):
    b = open(p, 'rb').read()
    magic, ver, ln = struct.unpack('<4sII', b[:12])
    assert magic == b'glTF', 'not glb'
    cl, ct = struct.unpack('<II', b[12:20])
    return json.loads(b[20:20 + cl]), ver
ok = True
for code in ['B0%d' % i for i in range(1, 9)]:
    p = f'{D}/{code}.glb'
    if not os.path.exists(p):
        print(code, 'MISSING'); ok = False; continue
    j, v = load(p)
    names = [n.get('name', '') for n in j['nodes']]
    need = [code] + [f'{code}_state_{s}' for s in ('normal', 'warning', 'incident', 'recovery')] + [f'{code}_hotspot']
    miss = [n for n in need if n not in names]
    mats = [m.get('name') for m in j.get('materials', [])]
    mm = [m for m in (f'{code}_identity', f'{code}_glow') if m not in mats]
    rootidx = names.index(code) if code in names else None
    isroot = rootidx is not None and all(rootidx not in n.get('children', []) for n in j['nodes'])
    rootnode = j['nodes'][rootidx] if rootidx is not None else {}
    at_origin = not any(k in rootnode for k in ('translation', 'rotation', 'scale')) or (rootnode.get('translation', [0, 0, 0]) == [0, 0, 0])
    nst = {s: sum(1 for n in names if n.startswith(f'{code}_state_{s}_')) for s in ('normal', 'warning', 'incident', 'recovery')}
    print(f'{code}: glTF v{v} size={os.path.getsize(p)/1e6:.2f}MB nodes={len(names)} meshes={len(j.get("meshes", []))} mats={len(mats)}',
          '| missing nodes:', miss or 'none', '| missing materials:', mm or 'none', '| root is scene root:', isroot, '| root at origin:', at_origin, '| state props:', nst,
          '| ext:', j.get('extensionsUsed', []))
    if miss or mm or not isroot: ok = False
p = f'{D}/city_base.glb'
if os.path.exists(p):
    j, v = load(p); names = [n.get('name', '') for n in j['nodes']]
    print('city_base:', f'size={os.path.getsize(p)/1e6:.2f}MB', 'nodes:', names)
print('ALL OK' if ok else 'PROBLEMS')
