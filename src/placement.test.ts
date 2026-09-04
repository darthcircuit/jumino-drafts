import { describe, expect, it } from 'vitest';
import { planPlacement } from './placement';
import type { FarmEntity } from './save';
import type { FarmMapLookup } from './mapData';

const points = Array.from({ length: 100 }, (_, index) => [index % 10, Math.floor(index / 10)]);
const map: FarmMapLookup = {
  data: { Id: 'test', Asset: 'test', Width: 10, Height: 10, Water: [], Blocked: [], Buildable: points, Properties: {} },
  water: new Set(), blocked: new Set(), buildable: new Set(points.map(([x, y]) => `${x},${y}`)),
};
const entity = (id: string, kind: FarmEntity['kind'], x: number, y: number, width = 1, height = 1): FarmEntity => ({ id, kind, name: id, x, y, width, height });

describe('live placement planning', () => {
  it('previews relocation without mutating the current entities', () => {
    const building = entity('building:0', 'building', 0, 0, 2, 2);
    const stone = entity('object:0', 'object', 4, 4);
    const current = [building, stone];
    const plan = planPlacement(current, [{ ...building, x: 4, y: 4 }], map);
    expect(plan.error).toBeUndefined();
    expect(plan.displaced).toEqual(['object:0']);
    expect(plan.positions['building:0']).toEqual({ x: 4, y: 4 });
    expect(plan.positions['object:0']).not.toEqual({ x: 4, y: 4 });
    expect(current[0]).toMatchObject({ x: 0, y: 0 });
    expect(current[1]).toMatchObject({ x: 4, y: 4 });
  });

  it('moves a group atomically and shifts encountered contents', () => {
    const first = entity('object:0', 'object', 1, 1);
    const second = entity('object:1', 'object', 2, 1);
    const obstacle = entity('object:2', 'object', 5, 5);
    const plan = planPlacement([first, second, obstacle], [{ ...first, x: 5, y: 5 }, { ...second, x: 6, y: 5 }], map);
    expect(plan.error).toBeUndefined();
    expect(plan.displaced).toContain('object:2');
    expect(plan.positions['object:0']).toEqual({ x: 5, y: 5 });
    expect(plan.positions['object:1']).toEqual({ x: 6, y: 5 });
  });
});
