# 95_export.py - export each building alone (root at origin, rot 0) + city_base as GLB; write index.json; save .blend.
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())
import os, json
OUT = '/Users/mac/Documents/Cordon/Frontend/public/models/city'
CODES = globals().get('EXPORT_CODES', ['B0%d' % i for i in range(1, 9)])   # B02-B07 glbs come from the builders (Draco); pass EXPORT_CODES to override
DRACO = globals().get('DRACO', True)
BASE = globals().get('EXPORT_BASE', True)
os.makedirs(OUT, exist_ok=True)
all_visible()
for c in bpy.data.collections:
    c.hide_viewport = False; c.hide_render = False

def _export(path, objs):
    bpy.ops.object.select_all(action='DESELECT') if bpy.context.object else None
    for o in bpy.data.objects: o.select_set(False)
    for o in objs:
        o.hide_viewport = False; o.hide_set(False); o.select_set(True)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_extras=True,
              export_cameras=False, export_lights=False, export_yup=True, export_texcoords=True, export_normals=True)
    if DRACO:
        kw.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    bpy.ops.export_scene.gltf(**kw)

res = {}
for code in CODES:
    root = bpy.data.objects.get(code)
    if not root:
        res[code] = 'missing'; continue
    par = root.parent
    saved = (root.matrix_world.copy(), root.location.copy(), root.rotation_euler.copy())
    root.parent = None
    root.location = (0, 0, 0); root.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    objs = [root] + list(root.children_recursive)
    path = f'{OUT}/{code}.glb'
    _export(path, objs)
    root.location, root.rotation_euler = saved[1], saved[2]
    res[code] = (os.path.getsize(path), sum(tris(o) for o in objs))
if BASE:
    objs = [o for o in bpy.data.objects if o.name.startswith('city_') and not o.name.startswith('city_surr')]
    _export(f'{OUT}/city_base.glb', objs)
    res['city_base'] = (os.path.getsize(f'{OUT}/city_base.glb'), sum(tris(o) for o in objs))
    objs = [o for o in bpy.data.objects if o.name.startswith('city_surr')]
    _export(f'{OUT}/city_surroundings.glb', objs)
    res['city_surroundings'] = (os.path.getsize(f'{OUT}/city_surroundings.glb'), sum(tris(o) for o in objs))
    json.dump({'buildings': ['B0%d' % i for i in range(1, 9)], 'base': 'city_base.glb', 'surroundings': 'city_surroundings.glb'}, open(f'{OUT}/index.json', 'w'))
all_visible()
print(json.dumps(res))
