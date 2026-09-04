import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { applySettings, convertFarmLayout, exportSave, parseSave, readEntities, summarize } from './save';
import { SAFE_BUILDINGS, STARTING_CABIN } from './buildings';
import { INTERIOR_BUILDINGS } from './buildingFixtures';

const fixturePath = 'existing_saves/Refugio_394913360/Refugio_394913360';

async function fixture() {
  return parseSave(await readFile(fixturePath, 'utf8'));
}

describe('Stardew save pipeline', () => {
  it('loads authentic bundled starters for every layout', async () => {
    const templates: Record<string, string> = { standard: '0', riverland: '1', forest: '2', hilltop: '3', wilderness: '4', 'four-corners': '5', beach: '6', meadowlands: 'MeadowlandsFarm' };
    for (const [name, layoutId] of Object.entries(templates)) {
      const doc = parseSave(await readFile(`public/templates/generated/${name}-1.6.15.xml`, 'utf8'));
      const summary = summarize(doc);
      expect(summary).toMatchObject({ version: '1.6.15', layoutId });
      expect(summary.settings).toMatchObject({ season: 'spring', day: 1, year: 1 });
      expect(summary.entities.length).toBeGreaterThan(4);
    }
  }, 60_000);

  it('creates clean designer templates for every source-known map variant', async () => {
    const source = await fixture();
    for (const layoutId of ['0', '1', '2', '3', '4', '5', '6', 'MeadowlandsFarm']) {
      const converted = convertFarmLayout(source, layoutId);
      const summary = summarize(converted);
      expect(summary.layoutId).toBe(layoutId);
      expect(summary.entities.filter((entity) => entity.kind === 'object' || entity.kind === 'tree' || entity.kind === 'grass' || entity.kind === 'clump')).toHaveLength(0);
      expect(summary.entities.filter((entity) => entity.kind === 'building')).toHaveLength(4);
    }
  }, 60_000);

  it('reads the 1.6 Riverland fixture and farm entities', async () => {
    const summary = summarize(await fixture());
    expect(summary.version).toBe('1.6.15');
    expect(summary.layoutName).toBe('Riverland');
    expect(summary.settings.day).toBe(1);
    expect(summary.counts.building).toBe(4);
    expect(summary.counts.object).toBe(485);
  });

  it('preserves imported inventory, exact XP, and multiplayer ownership when editing in place', async () => {
    const source = parseSave(await readFile('existing_saves/Leek_404858620/Leek_404858620', 'utf8'));
    const settings = summarize(source).settings;
    const sourcePlayer = source.getElementsByTagName('player')[0];
    const originalInventory = new XMLSerializer().serializeToString(sourcePlayer.getElementsByTagName('items')[0]);
    const originalMultiplayerId = sourcePlayer.getElementsByTagName('UniqueMultiplayerID')[0]?.textContent;
    const originalExperience = new XMLSerializer().serializeToString(sourcePlayer.getElementsByTagName('experiencePoints')[0]);
    const output = applySettings(source, { ...settings, money: settings.money + 1 });
    const outputPlayer = output.getElementsByTagName('player')[0];
    expect(new XMLSerializer().serializeToString(outputPlayer.getElementsByTagName('items')[0])).toBe(originalInventory);
    expect(outputPlayer.getElementsByTagName('UniqueMultiplayerID')[0]?.textContent).toBe(originalMultiplayerId);
    expect(new XMLSerializer().serializeToString(outputPlayer.getElementsByTagName('experiencePoints')[0])).toBe(originalExperience);
  });

  it('patches every mirrored date field and removes selected debris', async () => {
    const source = await fixture();
    const initial = summarize(source);
    const output = applySettings(source, {
      ...initial.settings,
      playerName: 'Fern', farmName: 'Moss', favoriteThing: 'Rain', gender: 'Male', hair: 12, skin: 4, accessory: 2, petType: 'Dog', petBreed: 1, money: 3210,
      season: 'fall', day: 17, year: 3, uniqueId: '123456789', clearDebris: true,
    });
    const updated = summarize(output);
    expect(updated.settings).toMatchObject({ playerName: 'Fern', farmName: 'Moss', gender: 'Male', hair: 12, skin: 4, accessory: 2, petType: 'Dog', petBreed: 1, season: 'fall', day: 17, year: 3, money: 3210 });
    expect(readEntities(output).filter((entity) => ['Weeds', 'Stone', 'Twig', 'Artifact Spot', 'Seed Spot'].includes(entity.name))).toHaveLength(0);
    expect(summarize(source).settings.playerName).toBe('Chani');
  });

  it('moves and removes farm entities while keeping the source intact', async () => {
    const source = await fixture();
    const settings = summarize(source).settings;
    const output = applySettings(source, settings, {
      'building:0': { x: 40, y: 20 },
      'object:0': { x: 12, y: 13 },
      'object:1': { deleted: true },
    });
    const entities = readEntities(output);
    expect(entities.find((entity) => entity.kind === 'building' && entity.name === 'Farmhouse')).toMatchObject({ x: 40, y: 20 });
    expect(entities.find((entity) => entity.kind === 'object')).toMatchObject({ x: 12, y: 13 });
    expect(entities.filter((entity) => entity.kind === 'object')).toHaveLength(484);
    expect(readEntities(source).find((entity) => entity.kind === 'building' && entity.name === 'Farmhouse')).toMatchObject({ x: 59, y: 12 });
  });

  it('applies progression milestones, skill levels, and friendship levels', async () => {
    const source = await fixture();
    const settings = {
      ...summarize(source).settings,
      greenhouseUnlocked: true, communityCenterComplete: true, minesCompleted: true, skullCavernUnlocked: true,
      sewerUnlocked: true, dwarvishGuide: true, clubCard: true, magnifyingGlass: true, specialCharm: true, darkTalisman: true, magicInk: true,
      skills: { farming: 10, fishing: 8, foraging: 6, mining: 9, combat: 7, luck: 3 },
      friendships: { Abigail: 2000, Lewis: 500 },
    };
    const output = applySettings(source, settings);
    expect(Array.from(output.getElementsByTagName('greenhouseUnlocked')).some((node) => node.textContent === 'true')).toBe(true);
    const center = Array.from(output.getElementsByTagName('GameLocation')).find((node) => node.getElementsByTagName('name')[0]?.textContent === 'CommunityCenter');
    expect(Array.from(center!.getElementsByTagName('areasComplete')[0].children).every((node) => node.textContent === 'true')).toBe(true);
    expect(output.documentElement.textContent).toContain('Abigail');
    expect(output.documentElement.textContent).toContain('2000');
    const player = output.getElementsByTagName('player')[0];
    expect(player.getElementsByTagName('deepestMineLevel')[0].textContent).toBe('120');
    expect(player.getElementsByTagName('timesReachedMineBottom')[0].textContent).toBe('1');
    expect(player.getElementsByTagName('farmingLevel')[0].textContent).toBe('10');
    expect(Array.from(player.getElementsByTagName('experiencePoints')[0].children).map((entry) => entry.textContent)).toEqual(['15000', '6900', '3300', '10000', '4800', '770']);
    for (const mail of ['HasSkullKey', 'HasUnlockedSkullDoor', 'HasRustyKey', 'HasDwarvishTranslationGuide', 'HasClubCard', 'HasMagnifyingGlass', 'HasSpecialCharm', 'HasDarkTalisman', 'HasMagicInk']) expect(player.textContent).toContain(mail);
  });

  it('adds a complete unclaimed starting cabin with its serialized interior', async () => {
    const source = parseSave(await readFile('public/templates/generated/standard-1.6.15.xml', 'utf8'));
    const cabinXml = await readFile('src/fixtures/cabin.xml', 'utf8');
    const settings = summarize(source).settings;
    const output = applySettings(source, settings, {}, [{
      id: 'add:cabin', building: STARTING_CABIN, templateXml: cabinXml,
      entity: { id: 'add:cabin', kind: 'building', name: 'Cabin', x: 50, y: 14, width: STARTING_CABIN.Width, height: STARTING_CABIN.Height },
    }]);
    const cabin = Array.from(output.getElementsByTagName('Building')).find((building) => building.getElementsByTagName('buildingType')[0]?.textContent === 'Cabin');
    expect(cabin?.getElementsByTagName('tileX')[0]?.textContent).toBe('50');
    const indoors = cabin?.getElementsByTagName('indoors')[0];
    expect(Array.from(indoors?.children ?? []).find((node) => node.tagName === 'name')?.textContent).toBe('Cabin');
    expect(cabin?.getElementsByTagName('farmhandReference')[0]?.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'nil')).toBe('true');
    expect(cabin?.getElementsByTagName('uniqueName')[0]?.textContent).toMatch(/^FarmHouse/);
    expect(cabin?.getElementsByTagName('magical')[0]?.textContent).toBe('true');
  });

  it('adds an empty Coop with a unique AnimalHouse interior', async () => {
    const source = await fixture();
    const settings = summarize(source).settings;
    const option = INTERIOR_BUILDINGS.find(({ spec }) => spec.Id === 'Coop')!;
    const entity = { id: 'add:coop', kind: 'building' as const, name: 'Coop', x: 30, y: 24, width: option.spec.Width, height: option.spec.Height };
    const output = applySettings(source, settings, {}, [{ id: entity.id, building: option.spec, templateXml: option.templateXml, entity }]);
    const coop = Array.from(output.getElementsByTagName('Building')).find((building) => building.getElementsByTagName('buildingType')[0]?.textContent === 'Coop');
    const indoors = coop?.getElementsByTagName('indoors')[0];
    expect(indoors?.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type')).toBe('AnimalHouse');
    expect(indoors?.getElementsByTagName('uniqueName')[0]?.textContent).toMatch(/^Coop[0-9a-f-]{36}$/i);
    expect(indoors?.getElementsByTagName('animalLimit')[0]?.textContent).toBe('4');
    expect(indoors?.getElementsByTagName('animals')[0]?.children).toHaveLength(0);
  });

  it('clones save-native farm entities at a new position', async () => {
    const source = await fixture();
    const settings = summarize(source).settings;
    const template = readEntities(source).find((entity) => entity.id === 'object:0')!;
    const output = applySettings(source, settings, {}, [{ id: 'add:test', templateId: template.id, entity: { ...template, id: 'add:test', x: 20, y: 20 } }]);
    expect(readEntities(output).filter((entity) => entity.kind === 'object')).toHaveLength(486);
    expect(readEntities(output).some((entity) => entity.kind === 'object' && entity.x === 20 && entity.y === 20)).toBe(true);
  });

  it('adds a complete exterior building from source-extracted data', async () => {
    const source = await fixture();
    const settings = summarize(source).settings;
    const silo = SAFE_BUILDINGS.find((building) => building.Id === 'Silo')!;
    const entity = { id: 'add:silo', kind: 'building' as const, name: 'Silo', x: 35, y: 25, width: silo.Width, height: silo.Height };
    const output = applySettings(source, settings, {}, [{ id: entity.id, building: silo, entity }]);
    expect(readEntities(output).some((item) => item.name === 'Silo' && item.x === 35 && item.y === 25)).toBe(true);
    expect(Array.from(output.getElementsByTagName('constructedBuildings')[0].children).some((item) => item.textContent === 'Silo')).toBe(true);
  });

  it('serializes supported specialized outdoor buildings with their runtime types', async () => {
    const source = await fixture();
    const settings = summarize(source).settings;
    for (const name of ['Stable', 'Fish Pond', 'Junimo Hut']) {
      const building = SAFE_BUILDINGS.find((entry) => entry.Id === name)!;
      expect(building).toBeDefined();
      const entity = { id: `add:${name}`, kind: 'building' as const, name, x: 30, y: 30, width: building.Width, height: building.Height };
      const output = applySettings(source, settings, {}, [{ id: entity.id, building, entity }]);
      const added = Array.from(output.getElementsByTagName('Building')).find((entry) => entry.getElementsByTagName('buildingType')[0]?.textContent === name);
      expect(added?.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type')).toBe(building.BuildingType?.split('.').pop());
      expect(added?.getElementsByTagName('id')[0]?.textContent).toMatch(/^[0-9a-f-]{36}$/i);
    }
  });

  it('exports the correct save-folder pair as a ZIP', async () => {
    const source = await fixture();
    const settings = { ...summarize(source).settings, farmName: 'Moss & Fern', uniqueId: '123456789' };
    const { blob, folderName, warnings } = await exportSave(source, settings);
    expect(folderName).toBe('MossFern_123456789');
    expect(warnings).toEqual([]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const main = zip.file(`${folderName}/${folderName}`);
    const info = zip.file(`${folderName}/SaveGameInfo`);
    expect(main).not.toBeNull();
    expect(info).not.toBeNull();
    expect((await main!.async('string')).replace(/^\uFEFF/, '')).toContain('<uniqueIDForThisGame>123456789</uniqueIDForThisGame>');
    expect((await info!.async('string')).replace(/^\uFEFF/, '')).toContain('<Farmer');
  }, 15_000);
});
