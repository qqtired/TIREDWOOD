// Станции радио на лодке по id каталога (shared/boatradio.ts RADIO_STATIONS).
import type { StationDef } from '../radiostream.ts';
import { forsazh } from './forsazh.ts';
import { funk } from './funk.ts';
import { zavod } from './zavod.ts';

export const STATION_DEFS: Record<string, StationDef> = { forsazh, zavod, funk };
