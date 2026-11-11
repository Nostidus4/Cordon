# build_city.py - headless: assemble B01..B08 from Blender/out/*.blend + build the base, save out/guardian_city.blend
import bpy
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/90_assemble.py').read(), globals())
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/80_city_base.py').read(), globals())
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/85_surroundings.py').read(), globals())
all_visible()
bpy.ops.wm.save_as_mainfile(filepath='/Users/mac/Documents/Cordon/Blender/out/guardian_city.blend')
print('CITY SAVED')
