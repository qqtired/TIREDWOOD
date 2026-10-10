// ЗАГЛУШКА пакета острова (C, ветка fish/isle): точки острова, нужные лодкам, — из Empty-точек GLB и props-layout.json
// (lab/fishing-review/models/island/PROVENANCE.md). При слиянии берётся файл пакета C; лодки читают отсюда только
// ISLE_BERTHS, ISLE_LANDING и ISLE_ROUTE_BUOYS. Мир = (−2364,9 + u; 557,6 + v), X — восток, Z — юг, yaw 0 — север.
const CX = -2364.9;
const CZ = 557.6;

/**
 * Берты причала острова (berth_0…5): корма лодки у южного края понтона, нос на юг (yaw π). Центр лодки — точка + вперёд × L/2.
 */
export const ISLE_BERTHS: ReadonlyArray<{ x: number; z: number; yaw: number }> = [0, 1, 2, 3, 4, 5].map((k) => ({
  x: CX + 72.7 + 4.2 * k, z: CZ - 6.3, yaw: Math.PI,
}));

/** Точка высадки на площадке у причала (spawn), лицом к деревне */
export const ISLE_LANDING = { x: CX + 58, y: 1.8, z: CZ - 10, yaw: Math.PI / 2 } as const;

/** Буи F1–F6 на маршруте от стоянки к острову (route_buoys в props-layout.json); ставит и рисует пакет острова */
export const ISLE_ROUTE_BUOYS: ReadonlyArray<{ id: string; x: number; z: number }> = [
  { id: 'F1', x: -25, z: 145 }, { id: 'F2', x: -419, z: 214 }, { id: 'F3', x: -813, z: 284 },
  { id: 'F4', x: -1207, z: 353 }, { id: 'F5', x: -1601, z: 423 }, { id: 'F6', x: -1995, z: 492 },
];
