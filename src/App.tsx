import { ChangeEvent, MouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  FARM_LAYOUTS, SEASONS, FarmAddition, FarmEdits, FarmEntity, SaveSettings, SaveSummary, exportSave,
  getEntityTemplateXml, parseSave, randomGameId, summarize,
} from './save';
import { FarmMapLookup, getFarmMap, getPlacementError, tilePath } from './mapData';
import { BuildingSpec, SAFE_BUILDINGS, STARTING_CABIN } from './buildings';
import { INTERIOR_BUILDINGS, getInteriorFixture } from './buildingFixtures';
import { PlacementPlan, planPlacement } from './placement';
import cabinTemplate from './fixtures/cabin.xml?raw';
import './styles.css';

type LayerState = Record<string, boolean>;
const DEFAULT_LAYERS: LayerState = { building: true, object: true, tree: true, grass: true, crop: true, clump: true, feature: true };
const COLORS: Record<string, string> = {
  building: '#d98f45', object: '#7a8594', tree: '#26734d', grass: '#77a84b', crop: '#d3bd57', clump: '#795940', feature: '#8e6aa8',
};
const TEMPLATE_NAMES: Record<string, string> = { '0': 'standard', '1': 'riverland', '2': 'forest', '3': 'hilltop', '4': 'wilderness', '5': 'four-corners', '6': 'beach', MeadowlandsFarm: 'meadowlands' };
const templateUrl = (layoutId: string) => `${import.meta.env.BASE_URL}templates/generated/${TEMPLATE_NAMES[layoutId]}-1.6.15.xml`;
const SKILL_XP = [0, 100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];
const SKILLS = [['farming', 'Farming'], ['fishing', 'Fishing'], ['foraging', 'Foraging'], ['mining', 'Mining'], ['combat', 'Combat'], ['luck', 'Luck']] as const;
const RESIDENTS = ['Abigail', 'Alex', 'Caroline', 'Clint', 'Demetrius', 'Dwarf', 'Elliott', 'Emily', 'Evelyn', 'George', 'Gus', 'Haley', 'Harvey', 'Jas', 'Jodi', 'Kent', 'Krobus', 'Leah', 'Leo', 'Lewis', 'Linus', 'Marnie', 'Maru', 'Pam', 'Penny', 'Pierre', 'Robin', 'Sam', 'Sandy', 'Sebastian', 'Shane', 'Vincent', 'Willy', 'Wizard'];

function Stat({ value, label }: { value: number; label: string }) {
  return <div className="stat"><strong>{value.toLocaleString()}</strong><span>{label}</span></div>;
}

function FarmMap({ summary, map, layers, selectedIds, previewIds, onSelect, onMove, onHover }: {
  summary: SaveSummary; map?: FarmMapLookup; layers: LayerState; selectedIds: string[]; previewIds: string[];
  onSelect: (entity: FarmEntity, additive: boolean) => void; onMove: (x: number, y: number) => void;
  onHover: (x: number, y: number) => void;
}) {
  const visible = summary.entities.filter((entity) => layers[entity.kind]);
  const maxX = map?.data.Width ?? Math.max(80, ...summary.entities.map((entity) => entity.x + entity.width + 2));
  const maxY = map?.data.Height ?? Math.max(65, ...summary.entities.map((entity) => entity.y + entity.height + 2));
  const buildablePath = useMemo(() => map ? tilePath(map.data.Buildable) : '', [map]);
  const waterPath = useMemo(() => map ? tilePath(map.data.Water) : '', [map]);
  const mapPoint = (event: { clientX: number; clientY: number }, svg: SVGSVGElement) => {
    const matrix = svg.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  };
  const moveToClick = (event: MouseEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest('.map-entity')) return;
    const point = mapPoint(event, event.currentTarget);
    if (point) onMove(Math.floor(point.x), Math.floor(point.y));
  };
  const previewMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = mapPoint(event, event.currentTarget);
    if (point) onHover(Math.floor(point.x), Math.floor(point.y));
  };
  return (
    <svg className="farm-map" viewBox={`0 0 ${maxX} ${maxY}`} role="img" aria-label={`${summary.layoutName} farm entity map`} onClick={moveToClick} onPointerMove={previewMove}>
      <defs>
        <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,.13)" strokeWidth=".055" />
        </pattern>
      </defs>
      <rect width={maxX} height={maxY} className="map-ground" />
      {map && <path d={buildablePath} className="map-buildable" />}
      {map && <path d={waterPath} className="map-water" />}
      <rect width={maxX} height={maxY} fill="url(#grid)" />
      {visible.map((entity, index) => {
        const color = COLORS[entity.kind];
        if (entity.kind === 'building' || entity.kind === 'clump') return (
          <rect key={entity.id} x={entity.x + .08} y={entity.y + .08} width={Math.max(.84, entity.width - .16)} height={Math.max(.84, entity.height - .16)} rx=".18" fill={color} className={`map-entity ${selectedIds.includes(entity.id) ? 'selected' : ''} ${previewIds.includes(entity.id) ? 'previewing' : ''}`} onClick={(event) => { event.stopPropagation(); onSelect(entity, event.shiftKey || event.ctrlKey || event.metaKey); }}>
            <title>{entity.name} · {entity.x}, {entity.y} · {entity.width}×{entity.height}</title>
          </rect>
        );
        return (
          <circle key={entity.id} cx={entity.x + .5} cy={entity.y + .5} r={entity.kind === 'tree' ? .43 : .31} fill={color} className={`map-entity ${selectedIds.includes(entity.id) ? 'selected' : ''} ${previewIds.includes(entity.id) ? 'previewing' : ''}`} onClick={(event) => { event.stopPropagation(); onSelect(entity, event.shiftKey || event.ctrlKey || event.metaKey); }}>
            <title>{entity.name} · {entity.x}, {entity.y}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function SelectionInspector({ entity, count, canDelete, onMove, onDelete, onClose }: {
  entity: FarmEntity; count: number; canDelete: boolean; onMove: (x: number, y: number) => void; onDelete: () => void; onClose: () => void;
}) {
  return <div className="selection-inspector">
    <button className="inspector-close" onClick={onClose}>×</button>
    <span className="entity-kind">{count > 1 ? `${count} items selected` : entity.kind}</span>
    <h3>{count > 1 ? 'Group selection' : entity.name}</h3>
    <p>{count > 1 ? 'Move the pointer for a live group preview, then click to place.' : `${entity.width}×${entity.height} tile${entity.width * entity.height === 1 ? '' : 's'} · move the pointer, then click to place`}</p>
    <div className="coordinate-edit">
      <label>X<input type="number" min="0" value={entity.x} onChange={(event) => onMove(Number(event.target.value), entity.y)}/></label>
      <label>Y<input type="number" min="0" value={entity.y} onChange={(event) => onMove(entity.x, Number(event.target.value))}/></label>
      <div className="nudge-pad">
        <button title="Move up" onClick={() => onMove(entity.x, Math.max(0, entity.y - 1))}>↑</button>
        <button title="Move left" onClick={() => onMove(Math.max(0, entity.x - 1), entity.y)}>←</button>
        <button title="Move down" onClick={() => onMove(entity.x, entity.y + 1)}>↓</button>
        <button title="Move right" onClick={() => onMove(entity.x + 1, entity.y)}>→</button>
      </div>
    </div>
    <button className="delete-entity" disabled={!canDelete} title={!canDelete ? 'Selection contains a required game building' : ''} onClick={onDelete}>{!canDelete ? 'Contains required building' : `Remove ${count > 1 ? `${count} items` : 'from farm'}`}</button>
  </div>;
}

function Welcome({ onFile, onNew }: { onFile: (file: File) => void; onNew: (layoutId: string, cabins: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [starterLayout, setStarterLayout] = useState('1');
  const [startingCabins, setStartingCabins] = useState(0);
  const receive = (files: FileList | null) => files?.[0] && onFile(files[0]);
  return (
    <main className="welcome">
      <div className="brand large"><span className="brand-mark">J</span><div><b>Junimo Drafts</b><small>Stardew save designer</small></div></div>
      <section className="hero">
        <div className="eyebrow">YOUR FARM, YOUR TIMELINE</div>
        <h1>Start with a plan,<br/><em>not a blank field.</em></h1>
        <p>Import a Stardew Valley save as a version-safe template. Choose your starting date, clean the land, and export a new save without uploading anything.</p>
        <div className="starter-choice"><label>Starter farm<select value={starterLayout} onChange={(event) => setStarterLayout(event.target.value)}>{Object.entries(FARM_LAYOUTS).map(([id, layout]) => <option key={id} value={id}>{layout.name}</option>)}</select></label><label>Starting cabins<select value={startingCabins} onChange={(event) => setStartingCabins(Number(event.target.value))}>{Array.from({ length: 8 }, (_, count) => <option key={count} value={count}>{count === 0 ? 'None' : count}</option>)}</select></label></div>
        <div className="welcome-actions"><button className="primary" onClick={() => onNew(starterLayout, startingCabins)}>Start a new {FARM_LAYOUTS[starterLayout].name} save <span>→</span></button><button className="secondary" onClick={() => input.current?.click()}>Import existing save</button></div>
        <input ref={input} hidden type="file" onChange={(event) => receive(event.target.files)} />
        <p className="privacy">● Local-only processing · your save never leaves this browser</p>
      </section>
      <section
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); receive(event.dataTransfer.files); }}
        onClick={() => input.current?.click()}
      >
        <div className="farm-sketch"><span>⌂</span><i/><i/><i/><i/></div>
        <strong>Drop your main save file here</strong>
        <span>It is named like <code>MyFarm_123456789</code>, not <code>SaveGameInfo</code>.</span>
      </section>
      <section className="catalog">
        <div><span className="catalog-number">8</span><p>layouts recognized from the 1.6 source</p></div>
        <div className="layout-pills">{Object.entries(FARM_LAYOUTS).map(([id, layout]) => <span key={id}>{layout.name}{layout.kind === 'data' && <sup>1.6</sup>}</span>)}</div>
      </section>
    </main>
  );
}

function App() {
  const [document, setDocument] = useState<XMLDocument | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<'new' | 'edit'>('new');
  const [summary, setSummary] = useState<SaveSummary | null>(null);
  const [settings, setSettings] = useState<SaveSettings | null>(null);
  const [activeTab, setActiveTab] = useState<'character' | 'landscape' | 'buildings' | 'relationships' | 'community'>('character');
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [farmEdits, setFarmEdits] = useState<FarmEdits>({});
  const [additions, setAdditions] = useState<FarmAddition[]>([]);
  const [materialLibrary, setMaterialLibrary] = useState<Array<{ entity: FarmEntity; xml: string; weight: number }>>([]);
  const [landscapeDensity, setLandscapeDensity] = useState(22);
  const [remixedStart, setRemixedStart] = useState(false);
  const [randomBuildingCount, setRandomBuildingCount] = useState(3);
  const [buildTemplate, setBuildTemplate] = useState<FarmEntity>();
  const [buildSpec, setBuildSpec] = useState<BuildingSpec>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number }>();
  const [placementError, setPlacementError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const cancelMapAction = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMapExpanded(false); setSelectedIds([]); setBuildTemplate(undefined); setBuildSpec(undefined); setPlacementError('');
    };
    window.addEventListener('keydown', cancelMapAction);
    return () => window.removeEventListener('keydown', cancelMapAction);
  }, []);

  const farmMap = useMemo(() => summary ? getFarmMap(summary.layoutId) : undefined, [summary]);

  const preview = useMemo(() => {
    if (!settings || !summary) return summary;
    const debris = new Set(['Weeds', 'Stone', 'Twig', 'Artifact Spot', 'Seed Spot']);
    const entities = [...summary.entities, ...additions.map((addition) => addition.entity)]
      .filter((entity) => !farmEdits[entity.id]?.deleted)
      .filter((entity) => !(settings.clearDebris && entity.kind === 'object' && debris.has(entity.name)))
      .filter((entity) => !(settings.clearGrass && entity.kind === 'grass'))
      .filter((entity) => !(settings.clearTrees && entity.kind === 'tree'))
      .filter((entity) => !(settings.clearClumps && entity.kind === 'clump'))
      .map((entity) => ({ ...entity, x: farmEdits[entity.id]?.x ?? entity.x, y: farmEdits[entity.id]?.y ?? entity.y }));
    return { ...summary, entities };
  }, [settings, summary, farmEdits, additions]);

  const selectedEntities = preview?.entities.filter((entity) => selectedIds.includes(entity.id)) ?? [];
  const selected = selectedEntities[0];
  const liveMoving = useMemo(() => {
    if (!hoverTile) return [];
    if (buildSpec) return [{ id: 'preview:add', kind: 'building' as const, name: buildSpec.Id, x: hoverTile.x, y: hoverTile.y, width: buildSpec.Width, height: buildSpec.Height }];
    if (buildTemplate) return [{ ...buildTemplate, id: 'preview:add', x: hoverTile.x, y: hoverTile.y }];
    if (!selectedEntities.length) return [];
    const dx = hoverTile.x - selectedEntities[0].x, dy = hoverTile.y - selectedEntities[0].y;
    return selectedEntities.map((entity) => ({ ...entity, x: entity.x + dx, y: entity.y + dy }));
  }, [hoverTile, buildSpec, buildTemplate, selectedEntities]);
  const livePlan: PlacementPlan | undefined = useMemo(() => farmMap && liveMoving.length && preview ? planPlacement(preview.entities, liveMoving, farmMap) : undefined, [farmMap, liveMoving, preview]);
  const displayedEntities = livePlan && !livePlan.error ? livePlan.entities : preview?.entities ?? [];
  const previewIds = livePlan && !livePlan.error ? [...Object.keys(livePlan.positions), ...liveMoving.map((entity) => entity.id)] : [];

  function loadDocument(doc: XMLDocument, newSave = false) {
    const next = summarize(doc);
    const nextSettings = newSave ? { ...next.settings, playerName: 'Farmer', farmName: 'New Farm', favoriteThing: 'Stardew', uniqueId: randomGameId() } : next.settings;
    const uniqueMaterials = new Map<string, { entity: FarmEntity; xml: string; weight: number }>();
    for (const entity of next.entities.filter((item) => item.kind !== 'building')) {
      const key = `${entity.kind}:${entity.name}`;
      const known = uniqueMaterials.get(key);
      if (known) { known.weight++; continue; }
      const xml = getEntityTemplateXml(doc, entity.id);
      if (xml) uniqueMaterials.set(key, { entity, xml, weight: 1 });
    }
    setMaterialLibrary([...uniqueMaterials.values()]);
    setWorkspaceMode(newSave ? 'new' : 'edit');
    setDocument(doc); setSummary(next); setSettings(nextSettings); setFarmEdits({}); setAdditions([]); setBuildTemplate(undefined); setBuildSpec(undefined); setSelectedIds([]);
  }

  async function openFile(file: File) {
    setError(''); setNotice('');
    try { loadDocument(parseSave(await file.text())); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read this save.'); }
  }

  async function startNew(layoutId: string, startingCabins = 0) {
    setError(''); setNotice('');
    try {
      const response = await fetch(templateUrl(layoutId));
      if (!response.ok) throw new Error('Bundled starter template could not be loaded.');
      const starterDocument = parseSave(await response.text());
      loadDocument(starterDocument, true);
      if (startingCabins > 0) {
        const starterSummary = summarize(starterDocument);
        const map = getFarmMap(layoutId);
        if (!map) throw new Error('Cabin locations are unavailable for this layout.');
        const styleOrders: Record<string, string[]> = {
          '1': ['Beach Cabin', 'Plank Cabin', 'Log Cabin', 'Neighbor Cabin', 'Trailer Cabin', 'Stone Cabin', 'Rustic Cabin'],
          '3': ['Stone Cabin', 'Log Cabin', 'Plank Cabin', 'Rustic Cabin', 'Trailer Cabin', 'Neighbor Cabin', 'Beach Cabin'],
          '4': ['Stone Cabin', 'Log Cabin', 'Plank Cabin', 'Rustic Cabin', 'Trailer Cabin', 'Neighbor Cabin', 'Beach Cabin'],
        };
        const styles = styleOrders[layoutId] ?? ['Log Cabin', 'Stone Cabin', 'Plank Cabin', 'Trailer Cabin', 'Neighbor Cabin', 'Rustic Cabin', 'Beach Cabin'];
        let placed = starterSummary.entities;
        const cabinAdditions: FarmAddition[] = [];
        const cabinEdits: FarmEdits = {};
        for (let index = 0; index < Math.min(startingCabins, map.data.Cabins.length); index++) {
          const [x, y] = map.data.Cabins[index];
          const entity: FarmEntity = { id: `add:${crypto.randomUUID()}`, kind: 'building', name: 'Cabin', x, y, width: STARTING_CABIN.Width, height: STARTING_CABIN.Height };
          const plan = planPlacement(placed, [entity], map);
          if (plan.error) throw new Error(`Could not place starting cabin ${index + 1}: ${plan.error}`);
          for (const [id, position] of Object.entries(plan.positions)) if (id !== entity.id) cabinEdits[id] = position;
          placed = plan.entities;
          const xml = cabinTemplate.replace('<skinId><string>Plank Cabin</string></skinId>', `<skinId><string>${styles[index]}</string></skinId>`);
          cabinAdditions.push({ id: entity.id, building: STARTING_CABIN, templateXml: xml, entity });
        }
        setFarmEdits(cabinEdits); setAdditions(cabinAdditions);
        setNotice(`Created ${FARM_LAYOUTS[layoutId].name} with ${cabinAdditions.length} starting cabin${cabinAdditions.length === 1 ? '' : 's'}.`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create a starter save.'); }
  }

  function update<K extends keyof SaveSettings>(key: K, value: SaveSettings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  }

  async function changeLayout(layoutId: string) {
    if (!settings || workspaceMode === 'edit' || layoutId === summary?.layoutId) return;
    try {
      const response = await fetch(templateUrl(layoutId));
      if (!response.ok) throw new Error('Game-generated layout template could not be loaded.');
      const nextDocument = parseSave(await response.text());
      loadDocument(nextDocument, true);
      setSettings(settings);
      setNotice(`Loaded an authentic Spring 1 ${FARM_LAYOUTS[layoutId].name} starter generated by Stardew Valley 1.6.15.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change farm layout.'); }
  }

  function commitEntityEdits(next: FarmEdits) {
    setAdditions((current) => current.map((addition) => {
      const edit = next[addition.id];
      return edit ? { ...addition, entity: { ...addition.entity, x: edit.x ?? addition.entity.x, y: edit.y ?? addition.entity.y } } : addition;
    }));
    setFarmEdits(Object.fromEntries(Object.entries(next).filter(([id]) => !id.startsWith('add:'))));
  }

  function commitPlan(plan: PlacementPlan) {
    if (plan.error) { setPlacementError(plan.error); return; }
    const updates: FarmEdits = { ...farmEdits };
    for (const [id, position] of Object.entries(plan.positions)) updates[id] = { ...updates[id], ...position };
    commitEntityEdits(updates);
    setPlacementError('');
    if (plan.displaced.length) setNotice(`Moved selection and shifted ${plan.displaced.length} occupied item${plan.displaced.length === 1 ? '' : 's'} aside.`);
  }

  function moveSelectedTo(x: number, y: number) {
    if (!selected || !farmMap || !preview || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const dx = Math.max(0, Math.floor(x)) - selected.x;
    const dy = Math.max(0, Math.floor(y)) - selected.y;
    if (!dx && !dy) return;
    commitPlan(planPlacement(preview.entities, selectedEntities.map((entity) => ({ ...entity, x: entity.x + dx, y: entity.y + dy })), farmMap));
  }

  function deleteEntity(entity: FarmEntity) {
    if (entity.id.startsWith('add:')) setAdditions((current) => current.filter((addition) => addition.id !== entity.id));
    else setFarmEdits((current) => ({ ...current, [entity.id]: { ...current[entity.id], deleted: true } }));
    setSelectedIds((current) => current.filter((id) => id !== entity.id));
  }

  function handleMapClick(x: number, y: number) {
    if (!farmMap || !preview) return;
    let moving: FarmEntity[] = [];
    if (buildSpec) moving = [{ id: 'preview:add', kind: 'building', name: buildSpec.Id, x, y, width: buildSpec.Width, height: buildSpec.Height }];
    else if (buildTemplate) moving = [{ ...buildTemplate, id: 'preview:add', x, y }];
    else if (selectedEntities.length) {
      const dx = x - selectedEntities[0].x, dy = y - selectedEntities[0].y;
      moving = selectedEntities.map((entity) => ({ ...entity, x: entity.x + dx, y: entity.y + dy }));
    }
    if (!moving.length) return;

    const plan = planPlacement(preview.entities, moving, farmMap);
    if (plan.error) { setPlacementError(plan.error); return; }
    const updates: FarmEdits = { ...farmEdits };
    for (const [id, position] of Object.entries(plan.positions)) if (id !== 'preview:add') updates[id] = { ...updates[id], ...position };
    commitEntityEdits(updates);

    if (buildTemplate || buildSpec) {
      const entity: FarmEntity = { ...moving[0], id: `add:${crypto.randomUUID()}` };
      const templateXml = buildTemplate
        ? materialLibrary.find((item) => item.entity.id === buildTemplate.id)?.xml
        : buildSpec ? getInteriorFixture(buildSpec.Id) : undefined;
      setAdditions((current) => [...current, { id: entity.id, templateId: buildTemplate?.id, templateXml, building: buildSpec, entity }]);
    }
    setSelectedIds([]);
    setPlacementError('');
    if (plan.displaced.length) setNotice(`Placed selection and shifted ${plan.displaced.length} item${plan.displaced.length === 1 ? '' : 's'} to the previewed positions.`);
  }

  function regenerateTemplate() {
    if (!farmMap || !summary || !settings || !materialLibrary.length) return;
    const randomIndex = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;
    const placed = summary.entities.filter((entity) => entity.kind === 'building');
    const generated: FarmAddition[] = [];
    const materialPool = materialLibrary.flatMap((template) => Array.from({ length: template.weight }, () => template));
    const targetCount = Math.round(farmMap.data.Buildable.length * landscapeDensity / 100);
    for (let index = 0; index < targetCount; index++) {
      const template = materialPool[randomIndex(materialPool.length)];
      for (let attempt = 0; attempt < 120; attempt++) {
        const [x, y] = farmMap.data.Buildable[randomIndex(farmMap.data.Buildable.length)];
        const entity: FarmEntity = { ...template.entity, id: `add:${crypto.randomUUID()}`, x, y };
        if (getPlacementError(entity, x, y, farmMap, placed)) continue;
        generated.push({ id: entity.id, templateId: template.entity.id, templateXml: template.xml, entity });
        placed.push(entity); break;
      }
    }
    if (remixedStart) for (let index = 0; index < randomBuildingCount; index++) {
      const spec = SAFE_BUILDINGS[randomIndex(SAFE_BUILDINGS.length)];
      for (let attempt = 0; attempt < 300; attempt++) {
        const [x, y] = farmMap.data.Buildable[randomIndex(farmMap.data.Buildable.length)];
        const entity: FarmEntity = { id: `add:${crypto.randomUUID()}`, kind: 'building', name: spec.Id, x, y, width: spec.Width, height: spec.Height };
        if (getPlacementError(entity, x, y, farmMap, placed)) continue;
        generated.push({ id: entity.id, building: spec, entity }); placed.push(entity); break;
      }
    }
    const deletions: FarmEdits = Object.fromEntries(summary.entities.filter((entity) => entity.kind !== 'building').map((entity) => [entity.id, { deleted: true }]));
    setSettings({ ...settings, clearDebris: false, clearGrass: false, clearTrees: false, clearClumps: false });
    setFarmEdits(deletions); setAdditions(generated); setSelectedIds([]);
    setNotice(`Generated ${generated.length} landscape items${remixedStart ? ` with ${Math.min(randomBuildingCount, generated.filter((item) => item.building).length)} bonus buildings` : ''}.`);
  }

  async function download() {
    if (!document || !settings) return;
    setExporting(true); setError(''); setNotice('');
    try {
      const result = await exportSave(document, settings, farmEdits, additions);
      const url = URL.createObjectURL(result.blob);
      const anchor = window.document.createElement('a');
      anchor.href = url; anchor.download = `${result.folderName}.zip`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(result.warnings.length ? `Exported with warnings: ${result.warnings.join(' ')}` : `Exported ${result.folderName}.zip`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export failed.'); }
    finally { setExporting(false); }
  }

  if (!document || !summary || !settings || !preview) return <><Welcome onFile={openFile} onNew={startNew}/>{error && <div className="toast error">{error}</div>}</>;

  const total = preview.entities.length;
  const palette = materialLibrary.map((item) => item.entity);
  const dirty = settings.clearDebris || settings.clearGrass || settings.clearTrees || settings.clearClumps || Object.keys(farmEdits).length > 0 || additions.length > 0;
  return (
    <div className="app-shell">
      <header>
        <div className="brand"><span className="brand-mark">J</span><div><b>Junimo Drafts</b><small>Save designer</small></div></div>
        <div className="save-meta"><span>{workspaceMode === 'edit' ? 'Editing imported save' : 'New save'}</span><span>{summary.layoutName}</span><span>v{summary.version}</span><span className="safe">Local only</span></div>
        <button className="text-button" onClick={() => { setDocument(null); setSummary(null); setSettings(null); setSelectedIds([]); }}>Open another</button>
        <button className="regenerate-button" onClick={regenerateTemplate}>Regenerate template ↻</button>
        <button className="primary compact" disabled={exporting} onClick={download}>{exporting ? 'Building…' : workspaceMode === 'edit' ? 'Export edited save' : 'Export new save'} <span>↓</span></button>
      </header>
      <aside className="editor-panel" data-active={activeTab}>
        <nav className="editor-tabs">
          {([['character','Character'],['landscape','Landscape'],['buildings','Buildings'],['relationships','Relationships'],['community','Progression']] as const).map(([id, label]) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label}</button>)}
        </nav>
        <div className="panel-intro tab-content tab-character"><span>01</span><div><h2>Save identity</h2><p>Written into the player record and export folder.</p></div></div>
        <div className="form-grid tab-content tab-character">
          <label>Player name<input value={settings.playerName} maxLength={40} onChange={(e) => update('playerName', e.target.value)}/></label>
          <label>Farm name<input value={settings.farmName} maxLength={40} onChange={(e) => update('farmName', e.target.value)}/></label>
          <label className="wide">Favorite thing<input value={settings.favoriteThing} maxLength={80} onChange={(e) => update('favoriteThing', e.target.value)}/></label>
          <label>Starting gold<input type="number" min="0" max="2147483647" value={settings.money} onChange={(e) => update('money', Number(e.target.value))}/></label>
          <label>Game ID<div className="input-action"><input inputMode="numeric" value={settings.uniqueId} onChange={(e) => update('uniqueId', e.target.value.replace(/\D/g, ''))}/><button title="Generate new ID" onClick={() => update('uniqueId', randomGameId())}>↻</button></div></label>
        </div>
        <div className="character-options tab-content tab-character">
          <label>Body type<select value={settings.gender} onChange={(e) => update('gender', e.target.value as SaveSettings['gender'])}><option>Male</option><option>Female</option></select></label>
          <label>Hair style<input type="number" min="0" max="200" value={settings.hair} onChange={(e) => update('hair', Number(e.target.value))}/></label>
          <label>Skin tone<input type="number" min="0" max="23" value={settings.skin} onChange={(e) => update('skin', Number(e.target.value))}/></label>
          <label>Accessory<input type="number" min="-1" max="30" value={settings.accessory} onChange={(e) => update('accessory', Number(e.target.value))}/></label>
          <label>Pet<select value={settings.petType} onChange={(e) => update('petType', e.target.value as SaveSettings['petType'])}><option>Cat</option><option>Dog</option></select></label>
          <label>Pet breed<input type="number" min="0" max="5" value={settings.petBreed} onChange={(e) => update('petBreed', Number(e.target.value))}/></label>
        </div>

        <div className="panel-intro section tab-content tab-community"><span>01</span><div><h2>Starting date</h2><p>A fresh-progression world with a custom calendar date.</p></div></div>
        <div className="date-row tab-content tab-community">
          <label>Season<select value={settings.season} onChange={(e: ChangeEvent<HTMLSelectElement>) => update('season', e.target.value as SaveSettings['season'])}>{SEASONS.map((season) => <option key={season}>{season}</option>)}</select></label>
          <label>Day<input type="number" min="1" max="28" value={settings.day} onChange={(e) => update('day', Number(e.target.value))}/></label>
          <label>Year<input type="number" min="1" max="999" value={settings.year} onChange={(e) => update('year', Number(e.target.value))}/></label>
        </div>
        <div className="date-card tab-content tab-community"><span className={`season-icon ${settings.season}`}>✿</span><div><strong>{settings.season[0].toUpperCase() + settings.season.slice(1)} {settings.day}</strong><small>Year {settings.year} · 6:00 AM</small></div></div>

        <div className="panel-intro section tab-content tab-landscape"><span>01</span><div><h2>Farm layout</h2><p>Switching layouts loads its game-generated Spring 1 starter.</p></div></div>
        <label className="layout-select tab-content tab-landscape">Map variant<select value={summary.layoutId} disabled={workspaceMode === 'edit'} title={workspaceMode === 'edit' ? 'Imported saves retain their original farm type and world state.' : ''} onChange={(event) => changeLayout(event.target.value)}>{Object.entries(FARM_LAYOUTS).map(([id, layout]) => <option key={id} value={id}>{layout.name}</option>)}</select></label>
        <div className="generator-options tab-content tab-landscape">
          <label>Landscape density <b>{landscapeDensity}%</b><input type="range" min="0" max="40" value={landscapeDensity} onChange={(event) => setLandscapeDensity(Number(event.target.value))}/></label>
          <label className="remix-toggle"><input type="checkbox" checked={remixedStart} onChange={(event) => setRemixedStart(event.target.checked)}/><span><b>Remixed start</b><small>Add random completed exterior buildings</small></span></label>
          {remixedStart && <label>Random buildings<input type="number" min="0" max="20" value={randomBuildingCount} onChange={(event) => setRandomBuildingCount(Math.max(0, Math.min(20, Number(event.target.value))))}/></label>}
          <button onClick={regenerateTemplate}>Generate a new roll ↻</button>
        </div>
        <div className="panel-intro section tab-content tab-landscape"><span>02</span><div><h2>Land preparation</h2><p>Optional destructive cleanup on the Farm location only.</p></div></div>
        <div className="check-list tab-content tab-landscape">
          {([
            ['clearDebris', 'Clear loose debris', 'weeds, stones, twigs and dig spots'],
            ['clearGrass', 'Clear grass', 'removes wild grass tiles'],
            ['clearTrees', 'Clear trees', 'removes all saved farm trees'],
            ['clearClumps', 'Clear resource clumps', 'stumps, logs and boulders'],
          ] as const).map(([key, title, detail]) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(e) => update(key, e.target.checked)}/><span><b>{title}</b><small>{detail}</small></span></label>)}
        </div>
        <div className="source-note tab-content tab-landscape"><b>{summary.layoutName} map active</b><span>{workspaceMode === 'edit' ? 'Imported-save mode preserves this save’s farm type, inventory, world locations, IDs, and unknown XML. Layout replacement is disabled to prevent accidental world replacement.' : 'Every variant starts from a complete save produced through Stardew Valley 1.6.15’s new-game initialization, including layout-specific state.'}</span></div>

        <div className="panel-intro section tab-content tab-community"><span>02</span><div><h2>Community Center</h2><p>Source-backed milestones applied coherently across related fields.</p></div></div>
        <div className="check-list progression-list tab-content tab-community">
          <label><input type="checkbox" checked={settings.greenhouseUnlocked} onChange={(e) => update('greenhouseUnlocked', e.target.checked)}/><span><b>Greenhouse repaired</b><small>unlocks entry and adds the Pantry completion mail</small></span></label>
          <label><input type="checkbox" checked={settings.communityCenterComplete} onChange={(e) => update('communityCenterComplete', e.target.checked)}/><span><b>Community Center restored</b><small>completes all six areas and their completion mail</small></span></label>
        </div>
        <div className="panel-intro section tab-content tab-community"><span>03</span><div><h2>Skills</h2><p>Set base skill levels and their matching minimum experience.</p></div></div>
        <div className="skill-list tab-content tab-community">
          {SKILLS.map(([key, label]) => <label key={key}><span>{label}<b>Level {settings.skills[key]}</b></span><input type="range" min="0" max="10" value={settings.skills[key]} onChange={(event) => {
            const level = Number(event.target.value);
            setSettings((current) => current ? { ...current, skills: { ...current.skills, [key]: level }, skillExperience: { ...current.skillExperience, [key]: SKILL_XP[level] } } : current);
          }}/></label>)}
        </div>
        {Object.values(settings.skills).some((level) => level >= 5) && <div className="source-note tab-content tab-community"><b>Profession choices</b><span>Skill XP and levels are synchronized. Existing profession choices are preserved; a separate profession editor is still needed for fresh level 5–10 characters.</span></div>}

        <div className="panel-intro section tab-content tab-community"><span>04</span><div><h2>World milestones</h2><p>Unlock major exploration rewards and permanent wallet abilities.</p></div></div>
        <div className="check-list progression-list tab-content tab-community">
          {([
            ['minesCompleted', 'Reached the bottom of the Mines', 'sets deepest floor to 120, records completion, and awards the Skull Key'],
            ['skullCavernUnlocked', 'Skull Cavern unlocked', 'adds the Skull Key and unlocks its desert door'],
            ['sewerUnlocked', 'Sewer unlocked', 'adds the Rusty Key'],
            ['dwarvishGuide', 'Dwarvish Translation Guide', 'allows conversations with Dwarves'],
            ['clubCard', 'Casino Club Card', 'unlocks the Casino'],
            ['magnifyingGlass', 'Magnifying Glass', 'allows Secret Notes to drop'],
            ['specialCharm', 'Special Charm', 'adds its permanent daily-luck bonus'],
            ['darkTalisman', 'Dark Talisman', 'opens the railroad cave route'],
            ['magicInk', 'Magic Ink returned', 'unlocks the Wizard building catalog'],
          ] as const).map(([key, title, detail]) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => update(key, event.target.checked)}/><span><b>{title}</b><small>{detail}</small></span></label>)}
        </div>
        <div className="source-note tab-content tab-community"><b>Bundle set: preserve template</b><span>Remixed bundles are generated from the game seed during new-game setup. They are not safely interchangeable after generation yet.</span></div>

        <div className="panel-intro section tab-content tab-relationships"><span>01</span><div><h2>Relationships</h2><p>Set friendship hearts. One heart equals 250 points.</p></div></div>
        <div className="friend-list tab-content tab-relationships">
          {RESIDENTS.map((name) => {
            const hearts = Math.round((settings.friendships[name] ?? 0) / 250);
            return <label key={name}><span>{name}<b>{hearts} ♥</b></span><input type="range" min="0" max="10" value={hearts} onChange={(event) => update('friendships', { ...settings.friendships, [name]: Number(event.target.value) * 250 })}/></label>;
          })}
        </div>

        <div className="panel-intro section tab-content tab-buildings"><span>01</span><div><h2>Build palette</h2><p>Choose an item, then click a valid map tile.</p></div></div>
        <h4 className="palette-heading tab-content tab-buildings">Complete exterior buildings</h4>
        <div className="build-palette tab-content tab-buildings">
          {SAFE_BUILDINGS.map((building) => <button key={building.Id} className={buildSpec?.Id === building.Id ? 'active' : ''} onClick={() => { setBuildSpec(buildSpec?.Id === building.Id ? undefined : building); setBuildTemplate(undefined); setSelectedIds([]); }}><i style={{ background: COLORS.building }}/><span>{building.Id}<small>{building.Width}×{building.Height} · complete</small></span></button>)}
        </div>
        <h4 className="palette-heading tab-content tab-buildings">Interior-backed buildings</h4>
        <div className="build-palette tab-content tab-buildings">
          {INTERIOR_BUILDINGS.map(({ spec, note }) => <button key={spec.Id} className={buildSpec?.Id === spec.Id ? 'active' : ''} onClick={() => { setBuildSpec(buildSpec?.Id === spec.Id ? undefined : spec); setBuildTemplate(undefined); setSelectedIds([]); }}><i style={{ background: COLORS.building }}/><span>{spec.Id}<small>{spec.Width}×{spec.Height} · {note}</small></span></button>)}
        </div>
        <h4 className="palette-heading tab-content tab-buildings">Save-native materials</h4>
        <div className="build-palette tab-content tab-buildings">
          {palette.map((entity) => <button key={`${entity.kind}:${entity.name}`} className={buildTemplate?.id === entity.id ? 'active' : ''} onClick={() => { setBuildTemplate(buildTemplate?.id === entity.id ? undefined : entity); setBuildSpec(undefined); setSelectedIds([]); }}><i style={{ background: COLORS[entity.kind] }}/><span>{entity.name}<small>{entity.kind}</small></span></button>)}
        </div>
        {(buildTemplate || buildSpec) && <button className="cancel-build tab-content tab-buildings" onClick={() => { setBuildTemplate(undefined); setBuildSpec(undefined); }}>Cancel placing {buildTemplate?.name ?? buildSpec?.Id}</button>}
        <div className="source-note tab-content tab-buildings"><b>Fixture-backed interiors</b><span>Coops now include a sanitized empty AnimalHouse interior with a fresh unique location ID. Barn, shed and slime-hutch fixtures remain staged separately until their type-specific indoor state is available.</span></div>
      </aside>

      <main className="canvas-panel">
        <div className="canvas-toolbar">
          <div><div className="eyebrow">ABSTRACT TILE MAP</div><h1>{settings.farmName || 'Untitled'} Farm</h1></div>
          <button className="expand-map" onClick={() => setMapExpanded(true)}>Expand map <span>⛶</span></button>
          <div className="stats"><Stat value={preview.counts?.building ?? summary.counts.building ?? 0} label="buildings"/><Stat value={total} label="entities"/><Stat value={Math.max(0, summary.entities.length - total)} label="removed"/></div>
        </div>
        <div className={`map-frame ${mapExpanded ? 'expanded' : ''}`}>
          {mapExpanded && <button className="collapse-map" onClick={() => setMapExpanded(false)}>Close expanded view ×</button>}
          <FarmMap
            summary={{ ...preview, entities: displayedEntities, counts: preview.entities.reduce<Record<string, number>>((all, item) => ({ ...all, [item.kind]: (all[item.kind] ?? 0) + 1 }), {}) }}
            map={farmMap} layers={layers} selectedIds={selectedIds} previewIds={previewIds}
            onSelect={(entity, additive) => {
              if (entity.id === 'preview:add') { handleMapClick(hoverTile?.x ?? entity.x, hoverTile?.y ?? entity.y); return; }
              if (!additive && (selectedIds.length > 0 || buildTemplate || buildSpec)) { handleMapClick(hoverTile?.x ?? entity.x, hoverTile?.y ?? entity.y); return; }
              setSelectedIds((current) => additive ? (current.includes(entity.id) ? current.filter((id) => id !== entity.id) : [...current, entity.id]) : [entity.id]);
              setPlacementError('');
            }}
            onMove={handleMapClick} onHover={(x, y) => setHoverTile({ x, y })}
          />
          {selected && <SelectionInspector entity={selected} count={selectedEntities.length} canDelete={!selectedEntities.some((entity) => entity.kind === 'building' && ['Farmhouse', 'Greenhouse', 'Shipping Bin', 'Pet Bowl'].includes(entity.name))} onMove={(x, y) => moveSelectedTo(x, y)} onDelete={() => selectedEntities.forEach(deleteEntity)} onClose={() => { setSelectedIds([]); setPlacementError(''); }}/>} 
          {(livePlan?.error || placementError) && <div className="placement-error">⚠ {livePlan?.error || placementError}</div>}
          {(buildTemplate || buildSpec) && <div className="build-cursor">Placing {buildTemplate?.name ?? buildSpec?.Id} · move to preview, click to place</div>}
          <div className="map-badge">{summary.layoutName}<small>{FARM_LAYOUTS[summary.layoutId]?.map ?? summary.layoutId}</small></div>
          <div className="map-caption">Green = buildable · blue = water · tan = restricted. Hover an entity for details.</div>
        </div>
        <div className="legend">
          <strong>Layers</strong>
          {farmMap && <><span className="terrain-key"><i className="buildable-swatch"/>buildable</span><span className="terrain-key"><i className="water-swatch"/>water</span></>}
          {Object.entries(COLORS).map(([kind, color]) => <label key={kind}><input type="checkbox" checked={layers[kind]} onChange={(e) => setLayers((current) => ({ ...current, [kind]: e.target.checked }))}/><i style={{ background: color }}/>{kind}</label>)}
          {(Object.keys(farmEdits).length > 0 || additions.length > 0) && <button className="reset-edits" onClick={() => { setFarmEdits({}); setAdditions([]); setSelectedIds([]); }}>Reset placements</button>}
        </div>
        <div className="export-strip"><div><b>{dirty ? 'Edit preview active' : workspaceMode === 'edit' ? 'Imported save preserved' : 'Template preserved'}</b><span>{workspaceMode === 'edit' ? 'Inventory and untouched world data remain intact. Export creates a replacement-ready save folder and matching SaveGameInfo.' : 'The starter template remains untouched. Export creates a new full save and matching SaveGameInfo.'}</span></div><button className="primary" onClick={download}>Export ready-to-install ZIP →</button></div>
      </main>
      {(error || notice) && <div className={`toast ${error ? 'error' : ''}`}>{error || notice}</div>}
    </div>
  );
}

export default App;
