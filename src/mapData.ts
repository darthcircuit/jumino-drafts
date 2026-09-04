import standard from './maps/0.json';
import riverland from './maps/1.json';
import forest from './maps/2.json';
import hilltop from './maps/3.json';
import wilderness from './maps/4.json';
import fourCorners from './maps/5.json';
import beach from './maps/6.json';
import meadowlands from './maps/MeadowlandsFarm.json';
import type { FarmEntity } from './save';

export interface FarmMapData {
  Id: string;
  Asset: string;
  Width: number;
  Height: number;
  Water: number[][];
  Blocked: number[][];
  Buildable: number[][];
  Cabins: number[][];
  Properties: Record<string, string>;
}

export const FARM_MAPS: Record<string, FarmMapData> = {
  '0': standard,
  '1': riverland,
  '2': forest,
  '3': hilltop,
  '4': wilderness,
  '5': fourCorners,
  '6': beach,
  MeadowlandsFarm: meadowlands,
};

export interface FarmMapLookup {
  data: FarmMapData;
  water: Set<string>;
  blocked: Set<string>;
  buildable: Set<string>;
}

const cache = new Map<string, FarmMapLookup>();

export function getFarmMap(layoutId: string): FarmMapLookup | undefined {
  const data = FARM_MAPS[layoutId];
  if (!data) return undefined;
  let lookup = cache.get(layoutId);
  if (!lookup) {
    const keys = (points: number[][]) => new Set(points.map(([x, y]) => `${x},${y}`));
    lookup = { data, water: keys(data.Water), blocked: keys(data.Blocked), buildable: keys(data.Buildable) };
    cache.set(layoutId, lookup);
  }
  return lookup;
}

export function getPlacementError(entity: FarmEntity, x: number, y: number, map: FarmMapLookup, entities: FarmEntity[]): string | null {
  if (x < 0 || y < 0 || x + entity.width > map.data.Width || y + entity.height > map.data.Height) {
    return 'That footprint extends beyond the farm map.';
  }
  for (let tileY = y; tileY < y + entity.height; tileY++) for (let tileX = x; tileX < x + entity.width; tileX++) {
    const key = `${tileX},${tileY}`;
    const valid = entity.kind === 'object' ? !map.water.has(key) && !map.blocked.has(key) : map.buildable.has(key);
    if (!valid) return map.water.has(key) ? 'That footprint crosses water.' : 'That footprint includes a non-buildable tile.';
  }
  const intersects = (other: FarmEntity) => x < other.x + other.width && x + entity.width > other.x && y < other.y + other.height && y + entity.height > other.y;
  if (entity.kind === 'building') {
    const overlap = entities.find((other) => other.id !== entity.id && other.kind !== 'grass' && intersects(other));
    if (overlap) return `That footprint is occupied by ${overlap.name}.`;
  }
  if (entity.kind === 'object') {
    const overlap = entities.find((other) => other.id !== entity.id && (other.kind === 'object' || other.kind === 'building') && intersects(other));
    if (overlap) return `That tile is occupied by ${overlap.name}.`;
  }
  const terrainKinds = new Set(['tree', 'grass', 'crop', 'feature']);
  if (terrainKinds.has(entity.kind)) {
    const overlap = entities.find((other) => other.id !== entity.id && (terrainKinds.has(other.kind) || other.kind === 'building') && intersects(other));
    if (overlap) return `That terrain tile is occupied by ${overlap.name}.`;
  }
  if (entity.kind === 'clump') {
    const overlap = entities.find((other) => other.id !== entity.id && other.kind !== 'grass' && intersects(other));
    if (overlap) return `That footprint is occupied by ${overlap.name}.`;
  }
  return null;
}

export function tilePath(points: number[][]): string {
  return points.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');
}
