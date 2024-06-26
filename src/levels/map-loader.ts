import { EM } from "../ecs/ecs.js";

// TODO(@darzu): games should be able to specify their map path
// const DEFAULT_MAP_PATH = "assets/ld52_maps/";
//const DEFAULT_MAP_PATH = "assets/smol_maps/";
const DEFAULT_MAP_PATH = "assets/ld53_maps/";

// export const MapPaths = [
//   "map1",
//   "map2",
//   "map3",
//   "map4",
//   "map_maze",
//   "map_narrow",
// ] as const;
export const MapPaths = [
  "tutorial-dock-under-cannon",
  "tutorial-attack-the-towers",
  "dont-go-right",
  "thread-needle",
  "every-which-way",
  "tacking",
  "surprise",

  // "rangetest",
] as const;

export type MapName = (typeof MapPaths)[number];

export const MapHelp: Partial<Record<MapName, string>> = {
  "tutorial-attack-the-towers":
    "the dock is straight ahead. use your cannons on these towers!",
  "tutorial-dock-under-cannon": "sail to the green dock to deliver your cargo!",
  "dont-go-right":
    "shoot out a complete ring of bricks to quickly destroy a tower!",
  "thread-needle":
    "smooth sailing! remember: fighting isn't always the answer!",
};

export interface MapBytes {
  bytes: Uint8ClampedArray;
  width: number;
  height: number;
}

export type MapBytesSet = { [P in MapName]: MapBytes };

export const MapBytesSetDef = EM.defineResource(
  "mapBytesSet",
  (mapBytesSet: MapBytesSet) => mapBytesSet
);

async function loadMapsData(): Promise<MapBytesSet> {
  // TODO(@darzu): PERF. Load on demand instead of all at once
  const mapPromises = MapPaths.map(async (name) => {
    const path = `${DEFAULT_MAP_PATH}${name}.png`;
    // return getBytes(path);

    return new Promise<MapBytes>((resolve, reject) => {
      const img = new Image();
      img.src = path;
      img.onload = function (e) {
        // TODO(@darzu): move to webget.ts
        // create in-memory canvas to grab the image data (wierd)
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);
        const imgData = context.getImageData(0, 0, img.width, img.height);
        const map: MapBytes = {
          bytes: imgData.data,
          width: img.width,
          height: img.height,
        };
        resolve(map);
      };
    });
  });

  const maps = await Promise.all(mapPromises);

  const set: Partial<MapBytesSet> = {};

  for (let i = 0; i < MapPaths.length; i++) {
    set[MapPaths[i]] = maps[i];
  }

  return set as MapBytesSet;
}

EM.addLazyInit([], [MapBytesSetDef], async () => {
  // start loading of maps
  const result = await loadMapsData();
  EM.addResource(MapBytesSetDef, result);
});
