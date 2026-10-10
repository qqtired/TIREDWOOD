# Пакетный запуск: Blender -b --factory-startup --python batch.py -- pet-chick pet-piglet ...
import sys, os, importlib.util, time, traceback
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
names = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for n in names:
    t0 = time.time()
    try:
        spec = importlib.util.spec_from_file_location(n.replace('-', '_'), f'{HERE}/{n}.py')
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.main()
        print('DONE', n, round(time.time() - t0, 1), 's')
    except Exception:
        traceback.print_exc()
        print('FAIL', n)
