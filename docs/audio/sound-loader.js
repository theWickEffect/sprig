import { AudioDef } from "./audio.js";
import { EM } from "../ecs/ecs.js";
const DEFAULT_SOUND_PATH = "assets/sounds/";
export const SoundPaths = [
    "cannonS.mp3",
    "cannonL.mp3",
    "stonebreak.wav",
    "woodbreak.mp3",
    "sword.mp3",
];
export const SoundSetDef = EM.defineResource("soundSet", (soundSet) => soundSet);
async function loadSoundsData() {
    console.log("loading sound data");
    // TODO(@darzu): PERF. Load on demand instead of all at once
    const soundPromises = SoundPaths.map(async (name) => {
        const path = `${DEFAULT_SOUND_PATH}${name}`;
        // return getBytes(path);
        // Decode asynchronously
        return new Promise((resolve, _) => {
            var request = new XMLHttpRequest();
            request.open("GET", path, true);
            request.responseType = "arraybuffer";
            request.onload = function () {
                new AudioContext().decodeAudioData(request.response, function (buffer) {
                    resolve(buffer);
                });
            };
            request.send();
        });
    });
    const sounds = await Promise.all(soundPromises);
    const set = {};
    for (let i = 0; i < SoundPaths.length; i++) {
        set[SoundPaths[i]] = sounds[i];
    }
    return set;
}
EM.addLazyInit([AudioDef], [SoundSetDef], async (res) => {
    // start loading of sounds
    const result = await loadSoundsData();
    EM.addResource(SoundSetDef, result);
});
//# sourceMappingURL=sound-loader.js.map