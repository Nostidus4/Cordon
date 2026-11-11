import bpy, os, sys
code = os.environ['CODE']
bpy.ops.wm.read_factory_settings(use_empty=True)
path = f'/Users/mac/Documents/Cordon/Frontend/public/models/city/{code}.glb'
bpy.ops.import_scene.gltf(filepath=path)
names = {o.name for o in bpy.data.objects}
print('VERIFY', code, 'size', os.path.getsize(path))
for n in (code, f'{code}_state_normal', f'{code}_state_warning', f'{code}_state_incident', f'{code}_state_recovery', f'{code}_hotspot'):
    print(' has', n, n in names)
tri = 0
for o in bpy.data.objects:
    if o.type == 'MESH':
        tri += sum(len(p.vertices) - 2 for p in o.data.polygons)
print(' meshes', sum(o.type == 'MESH' for o in bpy.data.objects), 'empties', sum(o.type == 'EMPTY' for o in bpy.data.objects), 'tris', tri)
print(' cameras', sum(o.type == 'CAMERA' for o in bpy.data.objects), 'lights', sum(o.type == 'LIGHT' for o in bpy.data.objects))
print(' materials', sorted(m.name for m in bpy.data.materials))
for k in ('beacon','ring','shield','progress','barrier'):
    print(' kw', k, sorted(n for n in names if k in n and '_state_' in n)[:8])
root = bpy.data.objects[code]; print(' root parent', root.parent, 'hotspot z', bpy.data.objects[f'{code}_hotspot'].matrix_world.translation.z)
bad = [o.name for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith(code + '_')]
print(' mesh names not prefixed:', bad)
