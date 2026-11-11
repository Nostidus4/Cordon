# render_city.py - headless hero renders from out/guardian_city.blend.
#   env: MODE=day|night  OUT=name  STATES="B03:incident,B04:incident"  CAM=hero|plaza|top|gate  RES=1920x1080  SAMPLES=48
import os, bmesh
exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common_env.py').read(), globals())
MODE = os.environ.get('MODE', 'day'); OUT = os.environ.get('OUT', 'city_hero'); CAMN = os.environ.get('CAM', 'hero')
RES = tuple(int(v) for v in os.environ.get('RES', '1920x1080').split('x')); SAMPLES = int(os.environ.get('SAMPLES', '48'))
STS = dict(p.split(':') for p in os.environ.get('STATES', '').split(',') if p)
bpy.ops.wm.open_mainfile(filepath=PROJ + '/out/guardian_city.blend')
all_visible()
sc = bpy.context.scene
pc = preview_setup(RES, SAMPLES)
for o in list(pc.objects): bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.name == '_pfloor': bpy.data.objects.remove(o, do_unlink=True)

def world(top, mid, bot, strength):
    w = bpy.data.worlds.get('CityWorld') or bpy.data.worlds.new('CityWorld')
    w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); mp = nt.nodes.new('ShaderNodeMapRange')
    ramp = nt.nodes.new('ShaderNodeValToRGB'); bg = nt.nodes.new('ShaderNodeBackground'); out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector']); mp.inputs['From Min'].default_value = -0.4; mp.inputs['From Max'].default_value = 0.9
    nt.links.new(sep.outputs['Z'], mp.inputs['Value']); nt.links.new(mp.outputs['Result'], ramp.inputs['Fac'])
    cr = ramp.color_ramp; cr.elements[0].position = 0.0; cr.elements[0].color = hx(bot); cr.elements[1].position = 1.0; cr.elements[1].color = hx(top)
    e = cr.elements.new(0.45); e.color = hx(mid)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs['Background'], out.inputs['Surface']); sc.world = w

def sun(nm, en, rot, col, ang):
    ld = bpy.data.lights.new(nm, 'SUN'); ld.energy = en; ld.color = col; ld.angle = ang
    lo = bpy.data.objects.new(nm, ld); pc.objects.link(lo); lo.rotation_euler = rot

def scale_emit(pred, f=None, v=None):
    for m in bpy.data.materials:
        if not m.use_nodes or not pred(m.name.lower()): continue
        b = m.node_tree.nodes.get('Principled BSDF')
        if b and b.inputs['Emission Strength'].default_value > 0 or (b and v):
            b.inputs['Emission Strength'].default_value = v if v is not None else b.inputs['Emission Strength'].default_value * f

def lamp_heads():
    out = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.name.startswith('_'): continue
        idx = [i for i, s in enumerate(o.material_slots) if s.material and 'lamp' in s.material.name.lower() and 'post' not in s.material.name.lower()]
        if not idx: continue
        pts = [o.matrix_world @ p.center for p in o.data.polygons if p.material_index in idx]
        for c in pts:
            for k in range(len(out)):
                if (out[k][0] - c).length < 1.3:
                    out[k][1] += 1; out[k][0] = (out[k][0] * out[k][1] + c) / (out[k][1] + 1) if False else out[k][0]; break
            else: out.append([c, 1])
    return [p[0] for p in out]

if MODE == 'day':
    world('#6F7CE0', '#A892E8', '#8E86D8', 1.25)
    sun('_sun', 3.6, (radians(50), radians(0), radians(35)), (1.0, 0.9, 0.8), radians(14))
    sun('_fill', 2.3, (radians(62), 0, radians(-140)), (0.68, 0.72, 1.0), radians(30))
    scale_emit(lambda n: 'window' in n, v=0.5)
else:
    world('#4A3AA8', '#2E2A86', '#1A1A5C', 1.0)
    sun('_moon', 1.7, (radians(48), radians(0), radians(30)), (0.55, 0.66, 1.0), radians(20))
    sun('_fill', 1.3, (radians(62), 0, radians(-140)), (0.5, 0.42, 1.0), radians(30))
    scale_emit(lambda n: n in ('city_water_m', 'city_foam'), f=0.25)
    scale_emit(lambda n: 'window' in n, v=7.0)
    scale_emit(lambda n: 'lamp' in n and 'post' not in n, v=14.0)
    scale_emit(lambda n: 'carlight' in n, v=8.0)
    scale_emit(lambda n: n.endswith('_glow') or 'glow' in n and not n.startswith('state_'), f=2.2)
    scale_emit(lambda n: n.startswith('state_'), f=1.4)
    scale_emit(lambda n: n.startswith('city_warm') or n.startswith('city_green_glow'), f=2.0)
    for i, p in enumerate(lamp_heads()):
        ld = bpy.data.lights.new('_lp%d' % i, 'POINT'); ld.energy = 260; ld.color = (1.0, 0.78, 0.45); ld.shadow_soft_size = 0.5
        ld.use_shadow = False
        try: ld.use_custom_distance = True; ld.cutoff_distance = 11.0
        except Exception: pass
        lo = bpy.data.objects.new('_lp%d' % i, ld); pc.objects.link(lo); lo.location = p - Vector((0, 0, 0.5))
    print('lamp lights', len(lamp_heads()))
for c_ in ['B0%d' % i for i in range(1, 9)]:
    show_state(c_, STS.get(c_, 'normal'))
if CAMN == 'hero':
    tg, scl, _fr = iso_frame(HERO_FILL)
    ortho_cam(pc, tg, scl, HERO_AZ, HERO_EL)
elif CAMN == 'plaza': ortho_cam(pc, (0, 0, 3), 52, -30, 28)
elif CAMN == 'gate': ortho_cam(pc, (0, -50, 6), 70, -25, 22)
elif CAMN == 'top': ortho_cam(pc, (0, -6, 0), 150, 0, 89)
elif CAMN == 'west': ortho_cam(pc, (-40, 10, 4), 70, -30, 30)
setup_glow(0.6 if MODE == 'night' else 0.3, 0.9 if MODE == 'night' else 1.0, 8)
render_to(PROJ + '/previews/' + OUT + '.png', RES)
print('RENDERED', OUT)
