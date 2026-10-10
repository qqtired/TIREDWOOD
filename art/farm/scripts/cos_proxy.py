# Прокси-желейка: art/farm/blend/jelly_proxy.blend + пробное превью.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cos_stage import *  # noqa

make_proxy()
objs = [o for o in bpy.data.objects if o.name.startswith('jelly_') and not o.hide_render]
preview([bpy.data.objects['jelly_body']], PNG_DIR + '/jelly_proxy.png')
print('PREVIEW ok')
