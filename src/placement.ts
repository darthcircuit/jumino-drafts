import type { FarmEntity } from './save';
import { FarmMapLookup, getPlacementError } from './mapData';

export interface PlacementPlan {
  positions: Record<string, { x: number; y: number }>;
  displaced: string[];
  entities: FarmEntity[];
  error?: string;
}

function intersects(a: FarmEntity, b: FarmEntity): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function findRelocation(entity: FarmEntity, map: FarmMapLookup, occupied: FarmEntity[]): { x: number; y: number } | null {
  for (let radius = 1; radius <= 8; radius++) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const x = entity.x + dx, y = entity.y + dy;
      if (!getPlacementError(entity, x, y, map, occupied)) return { x, y };
    }
  }
  const total = map.data.Width * map.data.Height;
  const offset = hashId(entity.id) % total;
  for (let index = 0; index < total; index++) {
    const tile = (offset + index * 7919) % total;
    const x = tile % map.data.Width, y = Math.floor(tile / map.data.Width);
    if (!getPlacementError(entity, x, y, map, occupied)) return { x, y };
  }
  return null;
}

/** Plan an atomic move/addition, including deterministic relocation of loose contents. */
export function planPlacement(current: FarmEntity[], moving: FarmEntity[], map: FarmMapLookup): PlacementPlan {
  const movingIds = new Set(moving.map((entity) => entity.id));
  const outside = current.filter((entity) => !movingIds.has(entity.id));

  // Validate static map rules and immovable building collisions first.
  const immovable = [...outside.filter((entity) => entity.kind === 'building'), ...moving];
  for (const candidate of moving) {
    const error = getPlacementError(candidate, candidate.x, candidate.y, map, immovable);
    if (error) return { positions: {}, displaced: [], entities: current, error };
  }

  // Everything loose touched by the proposed footprints is relocated atomically.
  const blockers = outside.filter((entity) => entity.kind !== 'building' && moving.some((candidate) => intersects(candidate, entity)));
  const blockerIds = new Set(blockers.map((entity) => entity.id));
  const placed = [...outside.filter((entity) => !blockerIds.has(entity.id)), ...moving];
  const positions: Record<string, { x: number; y: number }> = Object.fromEntries(moving.map((entity) => [entity.id, { x: entity.x, y: entity.y }]));

  for (const blocker of blockers) {
    const destination = findRelocation(blocker, map, placed);
    if (!destination) return { positions: {}, displaced: [], entities: current, error: `No free tile was found for ${blocker.name}.` };
    positions[blocker.id] = destination;
    placed.push({ ...blocker, ...destination });
  }

  const additions = moving.filter((entity) => !current.some((item) => item.id === entity.id));
  const entities = current
    .map((entity) => positions[entity.id] ? { ...entity, ...positions[entity.id] } : entity)
    .concat(additions);
  return { positions, displaced: blockers.map((entity) => entity.id), entities };
}
