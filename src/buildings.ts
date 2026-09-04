import catalog from './maps/buildings.json';

export interface BuildingSpec {
  Id: string;
  Width: number;
  Height: number;
  HumanDoorX: number;
  HumanDoorY: number;
  AnimalDoorX: number;
  AnimalDoorY: number;
  IndoorMap: string | null;
  IndoorMapType: string | null;
  NonInstancedIndoorLocation: string | null;
  BuildingType: string | null;
  MaxOccupants: number;
  Magical: boolean;
}

export const CABIN = (catalog as BuildingSpec[]).find((building) => building.Id === 'Cabin')!;
export const STARTING_CABIN: BuildingSpec = { ...CABIN, Magical: true };

const SUPPORTED_SPECIALIZED_OUTDOORS = new Set(['Stable', 'Fish Pond', 'Junimo Hut']);

export const SAFE_BUILDINGS = (catalog as BuildingSpec[]).filter((building) =>
  !building.IndoorMap && !building.NonInstancedIndoorLocation
  && (!building.BuildingType || SUPPORTED_SPECIALIZED_OUTDOORS.has(building.Id))
  && !['Farmhouse', 'Pet Bowl', 'Shipping Bin'].includes(building.Id)
);
