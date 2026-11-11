# run_building.py - headless rebuild of one building: CODE env var (B01..B08). Saves Blender/out/<CODE>.blend. No previews.
import os, glob, bpy
CODE = os.environ['CODE']
PREVIEW = False; EXPORT = False
os.environ['B_EXPORT'] = '0'; os.environ['B_PREVIEW'] = 'none'
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
f = glob.glob(f'/Users/mac/Documents/Cordon/Blender/scripts/{CODE}_[a-z]*.py')
f = [x for x in f if 'v1_' not in x and 'backup' not in x][0]
exec(open(f).read(), globals())
for lc in bpy.context.view_layer.layer_collection.children:
    lc.exclude = False
for o in bpy.data.objects:
    if o.name.startswith('_'): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=f'/Users/mac/Documents/Cordon/Blender/out/{CODE}.blend')
print('SAVED', CODE)
