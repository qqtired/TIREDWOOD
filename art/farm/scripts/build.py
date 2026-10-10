# TIREDWOOD farm models — background build.
#   Blender -b --factory-startup --python art/farm/scripts/build.py -- bed plot crops:radish,wheat props van extras
# Each id runs art/farm/scripts/<id>.py; "crops" without a list builds all 19 crops.
# Output: art/farm/blend/<id>.blend, client/assets/farm/models/<id>.glb, art/farm/renders/<id>.png
import os, sys, time, traceback
HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, '_lib')
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
failed = []
for item in args:
    mid, _, opt = item.partition(':')
    ns = {'__name__': 'farm_' + mid, 'HERE': HERE, 'LIB': LIB, 'OPTS': [o for o in opt.split(',') if o]}
    t = time.time()
    try:
        exec(open(os.path.join(LIB, 'farmlib.py')).read(), ns)
        exec(open(os.path.join(HERE, mid + '.py')).read(), ns)
        print(f'BUILD OK {mid} {time.time() - t:.1f}s')
    except Exception:
        failed.append(mid)
        print(f'BUILD FAIL {mid}\n' + traceback.format_exc())
print('BUILD DONE', 'failed:', failed)
