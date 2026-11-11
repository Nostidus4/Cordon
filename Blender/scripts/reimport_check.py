import bpy, glob, os, re
D='/Users/mac/Documents/Cordon/Frontend/public/models/city'
for p in sorted(glob.glob(D+'/*.glb')):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=p)
    ms=[o for o in bpy.data.objects if o.type=='MESH']
    tris=sum(sum(len(q.vertices)-2 for q in o.data.polygons) for o in ms)
    mats=sorted({s.material.name for o in ms for s in o.material_slots if s.material})
    key=[m for m in mats if re.search('window|lamp|carlight|_glow',m) and 'post' not in m]
    bad=[o.name for o in bpy.data.objects if 'tint' in o.name.lower() or 'person' in o.name.lower() or 'people' in o.name.lower()]
    print('REIMPORT', os.path.basename(p), 'meshes', len(ms), 'tris', tris, 'night mats', len(key), 'win',[m for m in mats if 'window' in m][:4], 'lamp',[m for m in mats if 'lamp' in m and 'post' not in m][:2], 'carlight',[m for m in mats if 'carlight' in m], 'tint/people objs', bad)
