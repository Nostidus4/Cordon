# 90_assemble.py - gather B01..B08 (live scene or Blender/out/B0x.blend) under collection `city` and place them on the layout circle.
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())
import os, re
sc = bpy.context.scene
city = bpy.data.collections.get('city') or bpy.data.collections.new('city')
if city.name not in [c.name for c in sc.collection.children]:
    sc.collection.children.link(city)
POS = {'B08': (0, 0), 'B01': (0, 36), 'B03': (-34, 24), 'B02': (34, 24), 'B05': (-44, -4), 'B06': (44, -4), 'B04': (-30, -32), 'B07': (30, -32)}
ANG = POS
missing = []
for code, adeg in ANG.items():
    coll = bpy.data.collections.get(code)
    if coll is None:
        path = f'{PROJ}/out/{code}.blend'
        if os.path.exists(path):
            with bpy.data.libraries.load(path, link=False) as (src, dst):
                dst.collections = [c for c in src.collections if c == code]
            coll = bpy.data.collections.get(code)
        else:
            missing.append(code); continue
    # link under city (and unlink from scene root)
    if coll.name in [c.name for c in sc.collection.children]:
        sc.collection.children.unlink(coll)
    if coll.name not in [c.name for c in city.children]:
        city.children.link(coll)
    root = bpy.data.objects[code]
    root.parent = None
    root.location = (adeg[0], adeg[1], 0); root.rotation_euler = (0, 0, 0)
# de-duplicate materials created by appending (state_warning.001 -> state_warning ...)
for m in list(bpy.data.materials):
    mm = re.match(r'^(.*)\.\d{3}$', m.name)
    if mm and mm.group(1) in bpy.data.materials:
        m.user_remap(bpy.data.materials[mm.group(1)])
        bpy.data.materials.remove(m)
# make every state prop visible again (web toggles by name)
for code in ANG:
    for st in STATES:
        e = bpy.data.objects.get(f'{code}_state_{st}')
        if e:
            for ch in e.children_recursive:
                ch.hide_render = False; ch.hide_viewport = False
all_visible()
print('assembled; missing:', missing)
