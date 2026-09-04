import { describe, expect, it } from 'vitest';
import { getFarmMap, getPlacementError } from './mapData';
import type { FarmEntity } from './save';

const greenhouse: FarmEntity = {
  id: 'building:1', kind: 'building', name: 'Greenhouse', x: 25, y: 10, width: 7, height: 6,
};

describe('farm map metadata', () => {
  it('contains source-extracted Riverland water and buildability', () => {
    const map = getFarmMap('1')!;
    expect(map.data).toMatchObject({ Asset: 'Farm_Fishing', Width: 80, Height: 65 });
    expect(map.water.size).toBe(2475);
    expect(map.water.has('0,0')).toBe(true);
    for (let y = 10; y < 16; y++) for (let x = 25; x < 32; x++) expect(map.buildable.has(`${x},${y}`)).toBe(true);
  });

  it('allows the original greenhouse and rejects water, bounds, and overlaps', () => {
    const map = getFarmMap('1')!;
    expect(getPlacementError(greenhouse, 25, 10, map, [greenhouse])).toBeNull();
    expect(getPlacementError(greenhouse, 0, 0, map, [greenhouse])).toBe('That footprint crosses water.');
    expect(getPlacementError(greenhouse, 78, 64, map, [greenhouse])).toBe('That footprint extends beyond the farm map.');
    const farmhouse: FarmEntity = { id: 'building:0', kind: 'building', name: 'Farmhouse', x: 25, y: 10, width: 9, height: 5 };
    expect(getPlacementError(greenhouse, 25, 10, map, [greenhouse, farmhouse])).toBe('That footprint is occupied by Farmhouse.');
  });
});
