using System.Text.Json;
using Microsoft.Xna.Framework.Content;
using xTile;
using xTile.Layers;
using xTile.Tiles;
using StardewValley.GameData.Buildings;

if (args.Length < 2)
{
    Console.Error.WriteLine("Usage: MapExtractor <Content directory> <output directory>");
    return 1;
}

var contentRoot = Path.GetFullPath(args[0]);
var outputRoot = Path.GetFullPath(args[1]);
Directory.CreateDirectory(outputRoot);

var layouts = new Dictionary<string, string>
{
    ["0"] = "Farm",
    ["1"] = "Farm_Fishing",
    ["2"] = "Farm_Foraging",
    ["3"] = "Farm_Mining",
    ["4"] = "Farm_Combat",
    ["5"] = "Farm_FourCorners",
    ["6"] = "Farm_Island",
    ["MeadowlandsFarm"] = "Farm_Ranching",
};

using var content = new ContentManager(new NullServices(), contentRoot);
var options = new JsonSerializerOptions { WriteIndented = false };
foreach (var (id, asset) in layouts)
{
    var map = content.Load<Map>($"Maps/{asset}");
    var back = map.GetLayer("Back") ?? throw new InvalidDataException($"{asset} has no Back layer");
    var buildings = map.GetLayer("Buildings") ?? throw new InvalidDataException($"{asset} has no Buildings layer");
    var paths = map.GetLayer("Paths") ?? throw new InvalidDataException($"{asset} has no Paths layer");
    var water = new List<int[]>();
    var blocked = new List<int[]>();
    var buildable = new List<int[]>();

    for (var y = 0; y < back.LayerHeight; y++)
    for (var x = 0; x < back.LayerWidth; x++)
    {
        var backTile = back.Tiles[x, y];
        var buildingTile = buildings.Tiles[x, y];
        var isWater = Property(backTile, "Water") is not null;
        var noFurniture = Property(backTile, "NoFurniture") is not null;
        var backBlocks = Property(backTile, "Passable") is not null;
        var buildingBlocks = buildingTile is not null && Property(buildingTile, "Shadow") is null && Property(buildingTile, "Passable") is null;
        var explicitBuildable = Property(backTile, "Buildable");
        var diggable = Property(backTile, "Diggable") is not null;
        var canBuild = backTile is not null && !isWater && !noFurniture && !backBlocks && !buildingBlocks
            && !string.Equals(explicitBuildable, "F", StringComparison.OrdinalIgnoreCase)
            && (diggable || string.Equals(explicitBuildable, "T", StringComparison.OrdinalIgnoreCase)
                         || string.Equals(explicitBuildable, "true", StringComparison.OrdinalIgnoreCase));

        if (isWater) water.Add([x, y]);
        if (backTile is null || backBlocks || buildingBlocks || noFurniture) blocked.Add([x, y]);
        if (canBuild) buildable.Add([x, y]);
    }

    var cabinLocations = new List<(int Order, int[] Position)>();
    for (var y = 0; y < paths.LayerHeight; y++)
    for (var x = 0; x < paths.LayerWidth; x++)
    {
        var tile = paths.Tiles[x, y];
        if (tile?.TileIndex == 29 && int.TryParse(Property(tile, "Order"), out var order)) cabinLocations.Add((order, [x, y]));
    }
    var cabins = cabinLocations.OrderBy(entry => entry.Order).Select(entry => entry.Position).ToList();
    var propertyNames = new[] { "FarmHouseEntry", "GreenhouseLocation", "ShippingBinLocation", "PetBowlLocation" };
    var properties = propertyNames.Where(name => map.Properties.ContainsKey(name)).ToDictionary(name => name, name => map.Properties[name].ToString());
    var data = new MapData(id, asset, back.LayerWidth, back.LayerHeight, water, blocked, buildable, cabins, properties);
    await File.WriteAllTextAsync(Path.Combine(outputRoot, $"{id}.json"), JsonSerializer.Serialize(data, options));
    Console.WriteLine($"{id,-18} {asset,-18} {back.LayerWidth}x{back.LayerHeight}: water={water.Count}, blocked={blocked.Count}, buildable={buildable.Count}");
}

var buildingCatalog = content.Load<Dictionary<string, BuildingData>>("Data/Buildings")
    .Where(pair => pair.Value.BuildingToUpgrade is null)
    .Select(pair => new BuildingCatalogEntry(
        pair.Key, pair.Value.Size.X, pair.Value.Size.Y,
        pair.Value.HumanDoor.X, pair.Value.HumanDoor.Y,
        pair.Value.AnimalDoor.X, pair.Value.AnimalDoor.Y,
        pair.Value.IndoorMap, pair.Value.IndoorMapType, pair.Value.NonInstancedIndoorLocation, pair.Value.BuildingType,
        pair.Value.MaxOccupants, pair.Value.MagicalConstruction
    ))
    .OrderBy(entry => entry.Id)
    .ToList();
await File.WriteAllTextAsync(Path.Combine(outputRoot, "buildings.json"), JsonSerializer.Serialize(buildingCatalog, options));
Console.WriteLine($"buildings          {buildingCatalog.Count} catalog entries");
return 0;

static string? Property(Tile? tile, string name)
{
    if (tile is null) return null;
    if (tile.Properties.TryGetValue(name, out var value)) return value.ToString();
    if (tile.TileIndexProperties.TryGetValue(name, out value)) return value.ToString();
    return null;
}

sealed class NullServices : IServiceProvider
{
    public object? GetService(Type serviceType) => null;
}

sealed record MapData(string Id, string Asset, int Width, int Height, List<int[]> Water, List<int[]> Blocked, List<int[]> Buildable, List<int[]> Cabins, Dictionary<string, string> Properties);
sealed record BuildingCatalogEntry(string Id, int Width, int Height, int HumanDoorX, int HumanDoorY, int AnimalDoorX, int AnimalDoorY, string? IndoorMap, string? IndoorMapType, string? NonInstancedIndoorLocation, string? BuildingType, int MaxOccupants, bool Magical);
