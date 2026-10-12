"""Own background process, native installed BlenderMCP handlers, no GUI/third-party assets.
The addon's GUI start method does not service timers under -b. Drain the unchanged
command queue on this process's main thread instead. Never patch the installed addon.
"""
import bpy, importlib.util, socket, threading, time, os
assert bpy.app.background
path='/Users/tired/Library/Application Support/Blender/5.2/scripts/addons/blender_mcp.py'
spec=importlib.util.spec_from_file_location('blender_mcp',path);addon=importlib.util.module_from_spec(spec);spec.loader.exec_module(addon)
addon.register()
server=addon.BlenderMCPServer(host='127.0.0.1',port=9876)
server.socket=socket.socket(socket.AF_INET,socket.SOCK_STREAM);server.socket.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);server.socket.bind((server.host,server.port));server.socket.listen(5);server.running=True
server.server_thread=threading.Thread(target=server._server_loop,daemon=True);server.server_thread.start()
print('FORTRESS_HEADLESS_MCP_READY',os.getpid(),bpy.app.version_string,flush=True)
try:
 while server.running:
  server._drain_command_queue();time.sleep(.03)
finally:server.stop()
