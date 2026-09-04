import catalog from './maps/buildings.json';
import coopXml from './fixtures/coop.xml?raw';
import type { BuildingSpec } from './buildings';

export interface BuildingOption {
  spec: BuildingSpec;
  templateXml?: string;
  note: string;
}

const byId = new Map((catalog as BuildingSpec[]).map((building) => [building.Id, building]));
const required = (id: string): BuildingSpec => {
  const building = byId.get(id);
  if (!building) throw new Error(`Building catalog is missing ${id}.`);
  return building;
};

/**
 * Interior fixtures are sanitized full save fragments. They intentionally stay
 * separate from the generic building path so an interior can never be emitted
 * without its matching serialized location state.
 */
export const INTERIOR_BUILDINGS: BuildingOption[] = [
  { spec: required('Coop'), templateXml: coopXml, note: 'empty interior · capacity 4' },
];

export function getInteriorFixture(buildingId: string): string | undefined {
  return INTERIOR_BUILDINGS.find((option) => option.spec.Id === buildingId)?.templateXml;
}
