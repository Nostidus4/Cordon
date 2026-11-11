import bpy, sys, os
for code in ('B02', 'B03'):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)
    p = f'/Users/mac/Documents/Cordon/Frontend/public/models/city/{code}.glb'
    bpy.ops.import_scene.gltf(filepath=p)
    names = {o.name for o in bpy.data.objects}
    tris = sum(sum(len(pl.vertices) - 2 for pl in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    print('=====', code, 'size', os.path.getsize(p), 'objects', len(names), 'tris', tris)
    print('root', code in names, '| hotspot', f'{code}_hotspot' in names)
    for st in ('normal', 'warning', 'incident', 'recovery'):
        n = f'{code}_state_{st}'
        kids = [c.name for c in bpy.data.objects[n].children_recursive] if n in names else None
        print(n, n in names, 'children', len(kids) if kids is not None else None)
    print('cameras/lights:', [o.name for o in bpy.data.objects if o.type in ('CAMERA', 'LIGHT')])
    print('non-prefixed meshes:', [o.name for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith(code + '_')])
    mats = sorted(m.name for m in bpy.data.materials)
    print('materials', len(mats), [m for m in mats if m in (f'{code}_identity', f'{code}_glow', 'state_warning', 'state_incident', 'state_recovery')])
    kw = [n for n in names if any(k in n for k in ('_beacon', '_ring', '_shield', '_progress', '_barrier'))]
    print('anim-keyword objects:', sorted(kw))
    bb = [o for o in bpy.data.objects if o.type == 'MESH']
    import mathutils
    mn = [1e9]*3; mx = [-1e9]*3
    for o in bb:
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            for i in range(3): mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
    print('bounds (glTF Y-up, m):', [round(v, 1) for v in mn], [round(v, 1) for v in mx])
