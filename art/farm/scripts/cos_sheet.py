# Контактный лист уже отрисованных превью: cos_sheet.py -- <slot> <name> ...
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cos_stage import *  # noqa
argv = sys.argv[sys.argv.index('--') + 1:]
sheet(['%s/cos_%s_%s.png' % (PNG_DIR, argv[0], n) for n in argv[1:]], TMP + '/sheet_%s.png' % argv[0])
print('DONE sheet')
