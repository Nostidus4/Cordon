# usage: blender -b --factory-startup -P verify_B04_B05.py -- B04
import bpy, sys
code = sys.argv[sys.argv.index('--') + 1]
path = f'/Users/mac/Documents/Cordon/Frontend/public/models/city/{code}.glb'
bpy.ops.import_scene.gltf(filepath=path)
names = {o.name for o in bpy.data.objects}
print('VERIFY file', path)
for n in [code] + [f'{code}_state_{s}' for s in ('normal', 'warning', 'incident', 'recovery')] + [f'{code}_hotspot']:
    print('VERIFY present', n, n in names)
print('VERIFY materials', sorted(m.name for m in bpy.data.materials))
tri = 0
for o in bpy.data.objects:
    if o.type == 'MESH':
        tri += sum(len(p.vertices) - 2 for p in o.data.polygons)
print('VERIFY mesh objects', sum(1 for o in bpy.data.objects if o.type == 'MESH'), 'triangles', tri)
print('VERIFY empties', sorted(o.name for o in bpy.data.objects if o.type == 'EMPTY' and 'state' in o.name or o.name.endswith('hotspot')))
kw = ('beacon', 'ring', 'shield', 'progress', 'barrier')
print('VERIFY keyword objs', sorted(o.name for o in bpy.data.objects if any(k in o.name for k in kw) and 'state' in o.name))
r = bpy.data.objects[code]
print('VERIFY root parent', r.parent, 'children', len(r.children))
