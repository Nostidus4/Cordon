# 00_reset.py - clear the default Cube/Light/Camera (only if scene is pristine), set up units/render/world.
import bpy
sc = bpy.context.scene
names = {o.name for o in bpy.data.objects}
default = {"Cube", "Light", "Camera"}
if names <= default:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)
    for c in list(bpy.data.cameras): bpy.data.cameras.remove(c)
    for l in list(bpy.data.lights): bpy.data.lights.remove(l)
    print("default scene cleared")
else:
    print("scene has extra objects; leaving them:", sorted(names - default))
sc.name = "GuardianCity"
sc.unit_settings.system = 'METRIC'; sc.unit_settings.scale_length = 1.0
sc.render.fps = 30
# world: dark navy
w = bpy.data.worlds.get("GuardianWorld") or bpy.data.worlds.new("GuardianWorld")
w.use_nodes = True
bg = w.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.02, 0.05, 0.14, 1); bg.inputs[1].default_value = 1.6
sc.world = w
print("reset ok", sc.name)
