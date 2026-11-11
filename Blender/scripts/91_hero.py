exec(open('/Users/mac/Documents/Cordon/Blender/scripts/common.py').read(), globals())
all_visible()
INC = globals().get('HERO_STATES', {})
OUTN = globals().get('HERO_OUT', 'city_hero')
pc = preview_setup((1920, 1080), 64)
for o in list(pc.objects): bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.name == '_pfloor': bpy.data.objects.remove(o, do_unlink=True)
setup_cartoon_world(); cartoon_lights(pc)
ortho_cam(pc, (0, -6, 4), 150, -35, 32)
for c_ in ['B0%d' % i for i in range(1, 9)]:
    show_state(c_, INC.get(c_, 'normal'))
render_to(PROJ + '/previews/' + OUTN + '.png', (1920, 1080))
for c_ in ['B0%d' % i for i in range(1, 9)]:
    reset_state_visibility(c_)
