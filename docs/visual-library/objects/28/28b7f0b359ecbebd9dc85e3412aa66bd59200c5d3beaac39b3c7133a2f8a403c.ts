/** One dominant axis per geometric face; smooth shading normals never steer its UVs. */
export function isleProjectionAxis(nx: number, ny: number, nz: number): 0 | 1 | 2 {
  const x = Math.abs(nx), y = Math.abs(ny), z = Math.abs(nz);
  return y >= x && y >= z ? 1 : x >= z ? 0 : 2;
}

/** Metre-based planar projection. Its area ratio is bounded by 1/√3..1 on any non-degenerate face. */
export function isleProjectedUv(x: number, y: number, z: number, axis: 0 | 1 | 2, tile: number): [number, number] {
  return axis === 1 ? [x / tile, -z / tile] : axis === 0 ? [z / tile, y / tile] : [x / tile, y / tile];
}
