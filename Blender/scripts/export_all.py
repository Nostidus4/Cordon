import bpy
bpy.ops.wm.open_mainfile(filepath='/Users/mac/Documents/Cordon/Blender/out/guardian_city.blend')
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/95_export.py').read(), globals())
