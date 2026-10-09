import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGlb } from '../client/fitting-room/glb.ts';

function glb(document: Record<string, unknown>): ArrayBuffer {
  const text = JSON.stringify(document);
  const length = Math.ceil(Buffer.byteLength(text) / 4) * 4;
  const data = new ArrayBuffer(20 + length);
  const view = new DataView(data);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, data.byteLength, true);
  view.setUint32(12, length, true);
  view.setUint32(16, 0x4e4f534a, true);
  const body = new Uint8Array(data, 20);
  body.fill(32);
  body.set(new TextEncoder().encode(text));
  return data;
}

test('GLB: embedded resources do not need a network request', () => {
  assert.doesNotThrow(() => validateGlb(glb({ asset: { version: '2.0' }, scenes: [{}], images: [{ bufferView: 0, mimeType: 'image/png' }] })));
});
test('GLB: external image and buffer paths are rejected before the loader runs', () => {
  for (const uri of ['https://example.com/image.png', '//example.com/mesh.bin', '../image.png']) {
    assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, images: [{ uri }] })), /внешн|внутри/i);
    assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ uri }] })), /внешн|внутри/i);
  }
});
test('GLB: bad lengths and truncated chunks fail with a readable error', () => {
  const data = glb({ asset: { version: '2.0' } });
  new DataView(data).setUint32(8, data.byteLength + 4, true);
  assert.throws(() => validateGlb(data), /GLB|размер|поврежд/i);
  assert.throws(() => validateGlb(new ArrayBuffer(3)), /GLB|поврежд/i);
});
test('GLB: required network decoders and SVG image payloads are rejected', () => {
  assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, extensionsRequired: ['KHR_draco_mesh_compression'] })), /Draco|сжат/i);
  assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, images: [{ uri: 'data:image/svg+xml;base64,PHN2Zz4=' }] })), /PNG|JPEG|WebP|изображ/i);
});
