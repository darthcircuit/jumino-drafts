import JSZip from 'jszip';
import type { BuildingSpec } from './buildings';
import { getFarmMap } from './mapData';

export const FARM_LAYOUTS: Record<string, { name: string; map: string; kind: 'vanilla' | 'data' }> = {
  '0': { name: 'Standard', map: 'Farm', kind: 'vanilla' },
  '1': { name: 'Riverland', map: 'Farm_Fishing', kind: 'vanilla' },
  '2': { name: 'Forest', map: 'Farm_Foraging', kind: 'vanilla' },
  '3': { name: 'Hill-top', map: 'Farm_Mining', kind: 'vanilla' },
  '4': { name: 'Wilderness', map: 'Farm_Combat', kind: 'vanilla' },
  '5': { name: 'Four Corners', map: 'Farm_FourCorners', kind: 'vanilla' },
  '6': { name: 'Beach', map: 'Farm_Island', kind: 'vanilla' },
  MeadowlandsFarm: { name: 'Meadowlands', map: 'Farm_Ranching', kind: 'data' },
};

export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export interface SaveSettings {
  playerName: string;
  farmName: string;
  favoriteThing: string;
  gender: 'Male' | 'Female';
  hair: number;
  skin: number;
  accessory: number;
  petType: 'Cat' | 'Dog';
  petBreed: number;
  money: number;
  season: Season;
  day: number;
  year: number;
  uniqueId: string;
  clearDebris: boolean;
  clearGrass: boolean;
  clearTrees: boolean;
  clearClumps: boolean;
  greenhouseUnlocked: boolean;
  communityCenterComplete: boolean;
  minesCompleted: boolean;
  skullCavernUnlocked: boolean;
  sewerUnlocked: boolean;
  dwarvishGuide: boolean;
  clubCard: boolean;
  magnifyingGlass: boolean;
  specialCharm: boolean;
  darkTalisman: boolean;
  magicInk: boolean;
  skills: Record<'farming' | 'fishing' | 'foraging' | 'mining' | 'combat' | 'luck', number>;
  skillExperience: Record<'farming' | 'fishing' | 'foraging' | 'mining' | 'combat' | 'luck', number>;
  friendships: Record<string, number>;
}

export type FarmEntityKind = 'building' | 'object' | 'tree' | 'grass' | 'crop' | 'clump' | 'feature';

export interface FarmEntity {
  id: string;
  kind: FarmEntityKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FarmEdit {
  x?: number;
  y?: number;
  deleted?: boolean;
}

export type FarmEdits = Record<string, FarmEdit>;

export interface FarmAddition {
  id: string;
  templateId?: string;
  templateXml?: string;
  building?: BuildingSpec;
  entity: FarmEntity;
}

export interface SaveSummary {
  version: string;
  layoutId: string;
  layoutName: string;
  settings: SaveSettings;
  entities: FarmEntity[];
  counts: Record<string, number>;
}

const parserError = 'parsererror';

export function parseSave(xml: string): XMLDocument {
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ''), 'application/xml');
  const error = doc.getElementsByTagName(parserError)[0];
  if (error) throw new Error(`Invalid Stardew save XML: ${error.textContent ?? 'parse error'}`);
  if (doc.documentElement.tagName !== 'SaveGame') throw new Error('This is not a full Stardew Valley save (expected <SaveGame>).');
  return doc;
}

function child(parent: ParentNode, tag: string): Element | null {
  return Array.from(parent.children).find((node) => node.tagName === tag) ?? null;
}

function requiredChild(parent: ParentNode, tag: string): Element {
  const result = child(parent, tag);
  if (!result) throw new Error(`Save is missing required <${tag}> data.`);
  return result;
}

function text(parent: ParentNode, tag: string, fallback = ''): string {
  return child(parent, tag)?.textContent ?? fallback;
}

function numberText(parent: ParentNode, tag: string, fallback = 0): number {
  const value = Number(text(parent, tag));
  return Number.isFinite(value) ? value : fallback;
}

function setText(parent: ParentNode, tag: string, value: string | number): void {
  requiredChild(parent, tag).textContent = String(value);
}

function setTextIfPresent(parent: ParentNode, tag: string, value: string | number): void {
  const element = child(parent, tag);
  if (element) element.textContent = String(value);
}

function getLocation(doc: XMLDocument, name: string): Element | undefined {
  const locations = requiredChild(doc.documentElement, 'locations');
  return Array.from(locations.children).find((location) => text(location, 'name') === name);
}

export function getFarm(doc: XMLDocument): Element {
  const farm = getLocation(doc, 'Farm');
  if (!farm) throw new Error('The save does not contain a Farm location.');
  return farm;
}

function readFriendships(player: Element): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of Array.from(child(player, 'friendshipData')?.children ?? [])) {
    const name = child(child(item, 'key') ?? item, 'string')?.textContent;
    const friendship = child(child(item, 'value') ?? item, 'Friendship');
    if (name && friendship) result[name] = numberText(friendship, 'Points');
  }
  return result;
}

function readCommunityCenterComplete(doc: XMLDocument): boolean {
  const areas = child(getLocation(doc, 'CommunityCenter') ?? doc.documentElement, 'areasComplete');
  const values = Array.from(areas?.children ?? []);
  return values.length >= 6 && values.every((value) => value.textContent === 'true');
}

function vector(parent: ParentNode, tag?: string): { x: number; y: number } {
  const node = tag ? requiredChild(parent, tag) : parent;
  return { x: numberText(node, 'X'), y: numberText(node, 'Y') };
}

function xsiType(element: Element): string {
  return element.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') ?? element.tagName;
}

export function getEntityTemplateXml(doc: XMLDocument, entityId: string): string | undefined {
  const [prefix, rawIndex] = entityId.split(':');
  const farm = getFarm(doc);
  const field = prefix === 'object' ? 'objects' : prefix === 'terrain' ? 'terrainFeatures' : prefix === 'clump' ? 'resourceClumps' : prefix === 'building' ? 'buildings' : '';
  const element = field ? child(farm, field)?.children[Number(rawIndex)] : undefined;
  return element ? new XMLSerializer().serializeToString(element) : undefined;
}

export function readEntities(doc: XMLDocument): FarmEntity[] {
  const farm = getFarm(doc);
  const entities: FarmEntity[] = [];

  for (const [index, building] of Array.from(child(farm, 'buildings')?.children ?? []).entries()) {
    entities.push({
      id: `building:${index}`, kind: 'building',
      name: text(building, 'buildingType', 'Building'),
      x: numberText(building, 'tileX'), y: numberText(building, 'tileY'),
      width: numberText(building, 'tilesWide', 1), height: numberText(building, 'tilesHigh', 1),
    });
  }

  for (const [index, item] of Array.from(child(farm, 'objects')?.children ?? []).entries()) {
    const point = vector(requiredChild(requiredChild(item, 'key'), 'Vector2'));
    const value = requiredChild(item, 'value').firstElementChild;
    if (!value) continue;
    entities.push({ id: `object:${index}`, kind: 'object', name: text(value, 'name', xsiType(value)), ...point, width: 1, height: 1 });
  }

  for (const [index, item] of Array.from(child(farm, 'terrainFeatures')?.children ?? []).entries()) {
    const point = vector(requiredChild(requiredChild(item, 'key'), 'Vector2'));
    const value = requiredChild(item, 'value').firstElementChild;
    if (!value) continue;
    const type = xsiType(value);
    const kind = type === 'Tree' ? 'tree' : type === 'Grass' ? 'grass' : type === 'HoeDirt' ? 'crop' : 'feature';
    entities.push({ id: `terrain:${index}`, kind, name: type, ...point, width: 1, height: 1 });
  }

  for (const [index, clump] of Array.from(child(farm, 'resourceClumps')?.children ?? []).entries()) {
    const point = vector(clump, 'tile');
    entities.push({
      id: `clump:${index}`, kind: 'clump', name: `Resource ${text(clump, 'parentSheetIndex')}`,
      ...point, width: numberText(clump, 'width', 2), height: numberText(clump, 'height', 2),
    });
  }
  return entities;
}

export function summarize(doc: XMLDocument): SaveSummary {
  const root = doc.documentElement;
  const player = requiredChild(root, 'player');
  const layoutId = text(root, 'whichFarm', '0');
  const entities = readEntities(doc);
  const counts: Record<string, number> = {};
  for (const entity of entities) counts[entity.kind] = (counts[entity.kind] ?? 0) + 1;
  const rawSeason = text(root, 'currentSeason', 'spring');
  const season = SEASONS.includes(rawSeason as Season) ? rawSeason as Season : 'spring';
  return {
    version: text(root, 'gameVersion', text(player, 'gameVersion', 'unknown')),
    layoutId,
    layoutName: FARM_LAYOUTS[layoutId]?.name ?? `Custom (${layoutId})`,
    entities,
    counts,
    settings: {
      playerName: text(player, 'name'), farmName: text(player, 'farmName'), favoriteThing: text(player, 'favoriteThing'),
      gender: text(player, 'gender', 'Male') === 'Female' ? 'Female' : 'Male', hair: numberText(player, 'hair'), skin: numberText(player, 'skin'),
      accessory: numberText(player, 'accessory', -1), petType: text(player, 'whichPetType', 'Cat') === 'Dog' ? 'Dog' : 'Cat', petBreed: numberText(player, 'whichPetBreed'),
      money: numberText(player, 'money', 500), season, day: numberText(root, 'dayOfMonth', 1),
      year: numberText(root, 'year', 1), uniqueId: text(root, 'uniqueIDForThisGame'),
      clearDebris: false, clearGrass: false, clearTrees: false, clearClumps: false,
      greenhouseUnlocked: text(getFarm(doc), 'greenhouseUnlocked') === 'true',
      communityCenterComplete: readCommunityCenterComplete(doc),
      minesCompleted: numberText(player, 'deepestMineLevel') >= 120 || numberText(player, 'timesReachedMineBottom') > 0,
      skullCavernUnlocked: Array.from(requiredChild(player, 'mailReceived').children).some((entry) => entry.textContent === 'HasUnlockedSkullDoor'),
      sewerUnlocked: Array.from(requiredChild(player, 'mailReceived').children).some((entry) => entry.textContent === 'HasRustyKey'),
      dwarvishGuide: Array.from(requiredChild(player, 'mailReceived').children).some((entry) => entry.textContent === 'HasDwarvishTranslationGuide'),
      clubCard: Array.from(requiredChild(player, 'mailReceived').children).some((entry) => entry.textContent === 'HasClubCard'),
      magnifyingGlass: Array.from(requiredChild(player, 'mailReceived').children).some((entry) => entry.textContent === 'HasMagnifyingGlass'),
      specialCharm: Array.from(requiredChild(player, 'mailReceived').children).some((entry) => entry.textContent === 'HasSpecialCharm'),
      darkTalisman: Array.from(requiredChild(player, 'mailReceived').children).some((entry) => entry.textContent === 'HasDarkTalisman'),
      magicInk: Array.from(requiredChild(player, 'mailReceived').children).some((entry) => entry.textContent === 'HasMagicInk'),
      skills: {
        farming: numberText(player, 'farmingLevel'), fishing: numberText(player, 'fishingLevel'), foraging: numberText(player, 'foragingLevel'),
        mining: numberText(player, 'miningLevel'), combat: numberText(player, 'combatLevel'), luck: numberText(player, 'luckLevel'),
      },
      skillExperience: (() => {
        const values = Array.from(requiredChild(player, 'experiencePoints').children).map((entry) => Number(entry.textContent) || 0);
        return { farming: values[0] ?? 0, fishing: values[1] ?? 0, foraging: values[2] ?? 0, mining: values[3] ?? 0, combat: values[4] ?? 0, luck: values[5] ?? 0 };
      })(),
      friendships: readFriendships(player),
    },
  };
}

const DEBRIS = new Set(['Weeds', 'Stone', 'Twig', 'Artifact Spot', 'Seed Spot']);

function removeWhere(parent: Element | null, predicate: (element: Element) => boolean): void {
  if (!parent) return;
  for (const element of Array.from(parent.children)) if (predicate(element)) element.remove();
}

function sanitizeName(name: string): string {
  return Array.from(name).filter((character) => /[\p{L}\p{N}]/u.test(character)).join('') || 'Farm';
}

function setVector(parent: ParentNode, x: number, y: number): void {
  const xNode = child(parent, 'X');
  const yNode = child(parent, 'Y');
  if (xNode) xNode.textContent = String(x);
  if (yNode) yNode.textContent = String(y);
}

function applyFarmEdits(doc: XMLDocument, edits: FarmEdits, additions: FarmAddition[]): void {
  const farm = getFarm(doc);
  const groups: Array<[string, Element | null]> = [
    ['building', child(farm, 'buildings')],
    ['object', child(farm, 'objects')],
    ['terrain', child(farm, 'terrainFeatures')],
    ['clump', child(farm, 'resourceClumps')],
  ];
  const workingEdits: FarmEdits = { ...edits };
  for (const addition of additions) {
    let prefix: string;
    let group: Element | null | undefined;
    let clone: Element | null = null;
    if (addition.building) {
      prefix = 'building';
      group = groups.find(([key]) => key === prefix)?.[1];
      const generic = Array.from(group?.children ?? []).find((entry) => !entry.hasAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type'));
      if (addition.templateXml) {
        const parsed = new DOMParser().parseFromString(addition.templateXml, 'application/xml').documentElement;
        if (parsed.tagName !== 'parsererror') clone = doc.importNode(parsed, true);
      } else if (generic) clone = generic.cloneNode(true) as Element;
      if (clone) {
        const spec = addition.building;
        if (spec.BuildingType) clone.setAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'xsi:type', spec.BuildingType.split('.').pop()!);
        setText(clone, 'buildingType', spec.Id); setText(clone, 'tilesWide', spec.Width); setText(clone, 'tilesHigh', spec.Height);
        setText(clone, 'maxOccupants', spec.MaxOccupants); setText(clone, 'daysOfConstructionLeft', 0); setText(clone, 'daysUntilUpgrade', 0);
        setText(clone, 'magical', spec.Magical ? 'true' : 'false');
        setVector(requiredChild(clone, 'humanDoor'), spec.HumanDoorX, spec.HumanDoorY);
        setVector(requiredChild(clone, 'animalDoor'), spec.AnimalDoorX, spec.AnimalDoorY);
        const indoorsName = child(clone, 'nonInstancedIndoorsName')?.firstElementChild;
        if (indoorsName) { indoorsName.textContent = ''; indoorsName.setAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'xsi:nil', 'true'); }
        const interior = child(clone, 'indoors');
        const uniqueName = child(interior ?? clone, 'uniqueName');
        if (uniqueName) uniqueName.textContent = `${spec.IndoorMap ?? spec.Id.replace(/\s+/g, '')}${crypto.randomUUID()}`;
        if (interior && spec.IndoorMap) {
          const indoorName = child(interior, 'name');
          if (indoorName && !indoorName.textContent) indoorName.textContent = spec.IndoorMap;
          const animalLimit = child(interior, 'animalLimit');
          if (animalLimit && spec.MaxOccupants >= 0) animalLimit.textContent = String(spec.MaxOccupants);
        }
        child(clone, 'buildingChests')?.replaceChildren();
        const constructed = child(doc.documentElement, 'constructedBuildings');
        if (constructed && !Array.from(constructed.children).some((entry) => entry.textContent === spec.Id)) appendTextElement(constructed, 'string', spec.Id);
      }
    } else if (addition.templateId) {
      [prefix] = addition.templateId.split(':');
      group = groups.find(([key]) => key === prefix)?.[1];
      if (addition.templateXml) {
        const parsed = new DOMParser().parseFromString(addition.templateXml, 'application/xml').documentElement;
        if (parsed.tagName !== 'parsererror') clone = doc.importNode(parsed, true);
      } else {
        const rawIndex = addition.templateId.split(':')[1];
        const template = group?.children[Number(rawIndex)];
        if (template) clone = template.cloneNode(true) as Element;
      }
    } else continue;
    if (!group || !clone) continue;
    const id = child(clone, 'id');
    if (id) id.textContent = crypto.randomUUID();
    group.appendChild(clone);
    workingEdits[`${prefix!}:${group.children.length - 1}`] = { x: addition.entity.x, y: addition.entity.y };
  }
  for (const [prefix, group] of groups) {
    if (!group) continue;
    for (const [index, element] of Array.from(group.children).entries()) {
      const edit = workingEdits[`${prefix}:${index}`];
      if (!edit) continue;
      if (edit.deleted) { element.remove(); continue; }
      if (edit.x === undefined || edit.y === undefined) continue;
      const x = Math.max(0, Math.floor(edit.x));
      const y = Math.max(0, Math.floor(edit.y));
      if (prefix === 'building') {
        setText(element, 'tileX', x);
        setText(element, 'tileY', y);
        if (text(element, 'buildingType') === 'Greenhouse') {
          const moved = child(farm, 'greenhouseMoved');
          if (moved) moved.textContent = 'true';
        }
      } else if (prefix === 'clump') {
        setVector(requiredChild(element, 'tile'), x, y);
      } else {
        setVector(requiredChild(requiredChild(element, 'key'), 'Vector2'), x, y);
        if (prefix === 'object') {
          const value = requiredChild(element, 'value').firstElementChild;
          if (value) {
            const tileLocation = child(value, 'tileLocation');
            if (tileLocation) setVector(tileLocation, x, y);
            const box = child(value, 'boundingBox');
            if (box) {
              const pixelX = x * 64;
              const pixelY = y * 64;
              const boxX = child(box, 'X'); const boxY = child(box, 'Y');
              if (boxX) boxX.textContent = String(pixelX);
              if (boxY) boxY.textContent = String(pixelY);
              const location = child(box, 'Location');
              if (location) setVector(location, pixelX, pixelY);
            }
          }
        }
      }
    }
  }
}

function appendTextElement(parent: Element, tag: string, value: string | number): Element {
  const element = parent.ownerDocument.createElement(tag);
  element.textContent = String(value);
  parent.appendChild(element);
  return element;
}

function applyFriendships(player: Element, friendships: Record<string, number>): void {
  const data = requiredChild(player, 'friendshipData');
  const existing = new Map<string, Element>();
  for (const item of Array.from(data.children)) {
    const name = child(child(item, 'key') ?? item, 'string')?.textContent;
    if (name) existing.set(name, item);
  }
  for (const [name, rawPoints] of Object.entries(friendships)) {
    const points = Math.max(0, Math.min(3500, Math.floor(rawPoints)));
    let item = existing.get(name);
    if (!item) {
      item = data.ownerDocument.createElement('item');
      const key = data.ownerDocument.createElement('key');
      appendTextElement(key, 'string', name);
      const value = data.ownerDocument.createElement('value');
      const friendship = data.ownerDocument.createElement('Friendship');
      for (const [tag, valueText] of [['Points', points], ['GiftsThisWeek', 0], ['GiftsToday', 0], ['TalkedToToday', 'false'], ['ProposalRejected', 'false'], ['Status', 'Friendly'], ['Proposer', 0], ['RoommateMarriage', 'false']] as const) appendTextElement(friendship, tag, valueText);
      value.appendChild(friendship); item.append(key, value); data.appendChild(item);
    } else {
      const friendship = child(child(item, 'value') ?? item, 'Friendship');
      if (friendship) setText(friendship, 'Points', points);
    }
  }
}

function addMail(player: Element, mailIds: string[]): void {
  const mail = requiredChild(player, 'mailReceived');
  const current = new Set(Array.from(mail.children).map((entry) => entry.textContent ?? ''));
  for (const id of mailIds) if (!current.has(id)) appendTextElement(mail, 'string', id);
}

function toggleMail(player: Element, id: string, enabled: boolean): void {
  const mail = requiredChild(player, 'mailReceived');
  const entries = Array.from(mail.children).filter((entry) => entry.textContent === id);
  if (enabled && !entries.length) appendTextElement(mail, 'string', id);
  if (!enabled) for (const entry of entries) entry.remove();
}

const SKILL_XP = [0, 100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];

function applySkills(player: Element, skills: SaveSettings['skills'], skillExperience: SaveSettings['skillExperience']): void {
  const definitions: Array<[keyof SaveSettings['skills'], string, number]> = [
    ['farming', 'farmingLevel', 0], ['fishing', 'fishingLevel', 1], ['foraging', 'foragingLevel', 2],
    ['mining', 'miningLevel', 3], ['combat', 'combatLevel', 4], ['luck', 'luckLevel', 5],
  ];
  const experience = requiredChild(player, 'experiencePoints');
  const changed = definitions.some(([key, field, index]) => {
    const level = Math.max(0, Math.min(10, Math.floor(skills[key])));
    return numberText(player, field) !== level || Number(experience.children[index]?.textContent ?? 0) !== Math.max(SKILL_XP[level], Math.floor(skillExperience[key] ?? SKILL_XP[level]));
  });
  if (!changed) return;
  for (const [key, field, index] of definitions) {
    const level = Math.max(0, Math.min(10, Math.floor(skills[key])));
    setText(player, field, level);
    const entry = experience.children[index];
    if (entry) entry.textContent = String(Math.max(SKILL_XP[level], Math.floor(skillExperience[key] ?? SKILL_XP[level])));
  }
  child(player, 'newLevels')?.replaceChildren();
}

function applyProgression(doc: XMLDocument, player: Element, settings: SaveSettings): void {
  const farm = getFarm(doc);
  if (settings.greenhouseUnlocked || settings.communityCenterComplete) {
    const unlocked = child(farm, 'greenhouseUnlocked');
    if (unlocked) unlocked.textContent = 'true';
    addMail(player, ['ccPantry']);
  }
  if (settings.communityCenterComplete) {
    addMail(player, ['ccCraftsRoom', 'ccVault', 'ccFishTank', 'ccBoilerRoom', 'ccPantry', 'ccBulletin']);
    const center = getLocation(doc, 'CommunityCenter');
    const areas = center ? child(center, 'areasComplete') : null;
    if (areas) for (const value of Array.from(areas.children)) value.textContent = 'true';
  }
  if (settings.minesCompleted) {
    setText(player, 'deepestMineLevel', Math.max(120, numberText(player, 'deepestMineLevel')));
    setText(player, 'timesReachedMineBottom', Math.max(1, numberText(player, 'timesReachedMineBottom')));
  }
  toggleMail(player, 'HasSkullKey', settings.skullCavernUnlocked || settings.minesCompleted);
  toggleMail(player, 'HasUnlockedSkullDoor', settings.skullCavernUnlocked);
  toggleMail(player, 'HasRustyKey', settings.sewerUnlocked);
  toggleMail(player, 'HasDwarvishTranslationGuide', settings.dwarvishGuide);
  toggleMail(player, 'HasClubCard', settings.clubCard);
  toggleMail(player, 'HasMagnifyingGlass', settings.magnifyingGlass);
  toggleMail(player, 'HasSpecialCharm', settings.specialCharm);
  toggleMail(player, 'HasDarkTalisman', settings.darkTalisman);
  toggleMail(player, 'HasMagicInk', settings.magicInk);
  applySkills(player, settings.skills, settings.skillExperience);
  applyFriendships(player, settings.friendships);
}

function randomSignedInt64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return BigInt.asIntN(64, value).toString();
}

export function randomGameId(): string {
  return String(100_000_000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900_000_000);
}

export function convertFarmLayout(source: XMLDocument, layoutId: string): XMLDocument {
  const map = getFarmMap(layoutId);
  if (!map) throw new Error('No map metadata is available for that farm layout.');
  const doc = source.cloneNode(true) as XMLDocument;
  setText(doc.documentElement, 'whichFarm', layoutId);
  const farm = getFarm(doc);
  for (const field of ['objects', 'terrainFeatures', 'largeTerrainFeatures', 'resourceClumps']) child(farm, field)?.replaceChildren();
  const moved = child(farm, 'greenhouseMoved'); if (moved) moved.textContent = 'false';

  const point = (name: string, fallback: [number, number]): [number, number] => {
    const raw = map.data.Properties[name];
    if (!raw) return fallback;
    const [x, y] = raw.split(/\s+/).map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : fallback;
  };
  const entry = point('FarmHouseEntry', [64, 15]);
  const locations: Record<string, [number, number]> = {
    Farmhouse: [entry[0] - 5, entry[1] - 3],
    Greenhouse: point('GreenhouseLocation', layoutId === '5' ? [36, 29] : layoutId === '6' ? [14, 14] : [25, 10]),
    'Shipping Bin': point('ShippingBinLocation', [71, 14]),
    'Pet Bowl': point('PetBowlLocation', [53, 7]),
  };
  const buildings = child(farm, 'buildings');
  if (buildings) for (const building of Array.from(buildings.children)) {
    const type = text(building, 'buildingType');
    const location = locations[type];
    if (!location) { building.remove(); continue; }
    setText(building, 'tileX', location[0]); setText(building, 'tileY', location[1]);
  }
  return doc;
}

export function applySettings(source: XMLDocument, settings: SaveSettings, edits: FarmEdits = {}, additions: FarmAddition[] = []): XMLDocument {
  if (!SEASONS.includes(settings.season) || settings.day < 1 || settings.day > 28 || settings.year < 1) {
    throw new Error('Choose a valid season, day (1–28), and year.');
  }
  if (!/^\d{1,20}$/.test(settings.uniqueId) || BigInt(settings.uniqueId) > 18_446_744_073_709_551_615n) {
    throw new Error('Game ID must be an unsigned 64-bit number.');
  }
  const doc = source.cloneNode(true) as XMLDocument;
  const root = doc.documentElement;
  const player = requiredChild(root, 'player');
  const oldMultiplayerId = text(player, 'UniqueMultiplayerID');
  const oldGameId = text(root, 'uniqueIDForThisGame');

  setText(player, 'name', settings.playerName.trim());
  setText(player, 'farmName', settings.farmName.trim());
  setText(player, 'favoriteThing', settings.favoriteThing.trim());
  setTextIfPresent(player, 'gender', settings.gender); setTextIfPresent(player, 'Gender', settings.gender);
  setText(player, 'hair', Math.max(0, Math.floor(settings.hair))); setText(player, 'skin', Math.max(0, Math.floor(settings.skin)));
  setText(player, 'accessory', Math.max(-1, Math.floor(settings.accessory)));
  setTextIfPresent(player, 'whichPetType', settings.petType); setText(player, 'whichPetBreed', Math.max(0, Math.floor(settings.petBreed)));
  setText(player, 'money', Math.max(0, Math.floor(settings.money)));
  setText(root, 'currentSeason', settings.season);
  setText(root, 'dayOfMonth', settings.day);
  setText(root, 'year', settings.year);
  setText(root, 'uniqueIDForThisGame', settings.uniqueId);
  setText(player, 'dayOfMonthForSaveGame', settings.day);
  setText(player, 'seasonForSaveGame', SEASONS.indexOf(settings.season));
  setText(player, 'yearForSaveGame', settings.year);

  // Editing in place keeps multiplayer ownership stable. A changed game ID means
  // this is a cloned/new save, so all exact references to the host ID are renewed.
  if (oldMultiplayerId && settings.uniqueId !== oldGameId) {
    const replacement = randomSignedInt64();
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue === oldMultiplayerId) node.nodeValue = replacement;
    }
  }

  applyProgression(doc, player, settings);
  applyFarmEdits(doc, edits, additions);
  const farm = getFarm(doc);
  if (settings.clearDebris) {
    removeWhere(child(farm, 'objects'), (item) => {
      const value = child(item, 'value')?.firstElementChild;
      return !!value && DEBRIS.has(text(value, 'name'));
    });
  }
  if (settings.clearGrass || settings.clearTrees) {
    removeWhere(child(farm, 'terrainFeatures'), (item) => {
      const value = child(item, 'value')?.firstElementChild;
      const type = value ? xsiType(value) : '';
      return (settings.clearGrass && type === 'Grass') || (settings.clearTrees && type === 'Tree');
    });
  }
  if (settings.clearClumps) child(farm, 'resourceClumps')?.replaceChildren();
  return doc;
}

function serialize(doc: XMLDocument): string {
  return `\uFEFF<?xml version="1.0" encoding="utf-8"?>${new XMLSerializer().serializeToString(doc.documentElement)}`;
}

export function makeSaveGameInfo(save: XMLDocument): XMLDocument {
  const sourcePlayer = requiredChild(save.documentElement, 'player');
  const info = document.implementation.createDocument('', 'Farmer');
  const farmer = info.documentElement;
  farmer.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
  farmer.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xsd', 'http://www.w3.org/2001/XMLSchema');
  for (const node of Array.from(sourcePlayer.childNodes)) farmer.appendChild(info.importNode(node, true));
  const saveTime = child(farmer, 'saveTime');
  if (saveTime) saveTime.textContent = String(Math.floor((Date.now() - Date.UTC(2012, 5, 22)) / 60_000));
  return info;
}

export function validateSave(doc: XMLDocument): string[] {
  const warnings: string[] = [];
  const root = doc.documentElement;
  const player = requiredChild(root, 'player');
  if (text(root, 'dayOfMonth') !== text(player, 'dayOfMonthForSaveGame')) warnings.push('Day mirror does not match.');
  if (text(root, 'year') !== text(player, 'yearForSaveGame')) warnings.push('Year mirror does not match.');
  if (!text(player, 'name').trim()) warnings.push('Player name is empty.');
  if (!text(player, 'farmName').trim()) warnings.push('Farm name is empty.');
  const entities = readEntities(doc);
  const buildings = entities.filter((entity) => entity.kind === 'building');
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      const a = buildings[i]; const b = buildings[j];
      const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      if (overlaps) warnings.push(`${a.name} overlaps ${b.name}.`);
    }
  }
  const seen = new Set<string>();
  for (const entity of entities.filter((entity) => entity.kind !== 'building')) {
    const key = `${entity.kind}:${entity.x},${entity.y}`;
    if (seen.has(key)) warnings.push(`Duplicate ${entity.kind} at ${entity.x}, ${entity.y}.`);
    seen.add(key);
  }
  return warnings;
}

export async function exportSave(source: XMLDocument, settings: SaveSettings, edits: FarmEdits = {}, additions: FarmAddition[] = []): Promise<{ blob: Blob; folderName: string; warnings: string[] }> {
  const save = applySettings(source, settings, edits, additions);
  const folderName = `${sanitizeName(settings.farmName)}_${settings.uniqueId}`;
  const zip = new JSZip();
  const folder = zip.folder(folderName)!;
  folder.file(folderName, serialize(save));
  folder.file('SaveGameInfo', serialize(makeSaveGameInfo(save)));
  const warnings = validateSave(save);
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), folderName, warnings };
}
