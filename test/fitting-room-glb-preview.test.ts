import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePreviewGlb, disposePreviewGlb } from '../client/fitting-room/glb-preview.ts';

function fixture(visible: boolean): ArrayBuffer {
  const document = visible ? {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  } : { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] };
  const json = new TextEncoder().encode(JSON.stringify(document));
  const size = Math.ceil(json.byteLength / 4) * 4;
  const buffer = new ArrayBuffer(20 + size + (visible ? 44 : 0));
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, size, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20, size).fill(32); new Uint8Array(buffer, 20, json.byteLength).set(json);
  if (visible) {
    view.setUint32(20 + size, 36, true); view.setUint32(24 + size, 0x004e4942, true);
    new Float32Array(buffer, 28 + size, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  }
  return buffer;
}
test('preview GLB: an empty approved model cannot reach project storage', async () => {
  await assert.rejects(parsePreviewGlb(fixture(false)), /нет видимой геометрии/);
});
test('preview GLB: actual embedded geometry is parsed by the same loader as the fitting scene', async () => {
  const root = await parsePreviewGlb(fixture(true));
  assert.equal(root.children[0].type, 'Mesh');
  disposePreviewGlb(root);
});
