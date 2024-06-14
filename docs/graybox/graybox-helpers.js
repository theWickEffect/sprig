import { CameraFollowDef, applyCameraSettings, getCameraSettings, } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { GhostDef, createGhost } from "../debug/ghost.js";
import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { V } from "../matrix/sprig-matrix.js";
import { CubeMesh } from "../meshes/mesh-list.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { RenderableConstructDef, } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { assert } from "../utils/util.js";
import { createObj } from "../ecs/em-objects.js";
import { GAME_LOADER } from "../game-loader.js";
export function createSun() {
    const sun = createObj([PointLightDef, ColorDef, PositionDef, RenderableConstructDef], [
        {
            constant: 1.0,
            linear: 0.0,
            quadratic: 0.0,
            ambient: V(0.2, 0.2, 0.2),
            diffuse: V(0.5, 0.5, 0.5),
        },
        [1, 1, 1],
        [50, 10, 300],
        [CubeMesh, false],
    ]);
    return sun;
}
// hover near origin
const defaultCam = {
    position: [7.97, -12.45, 10.28],
    rotation: [0.0, 0.0, 0.27, 0.96],
    positionOffset: [0.0, 0.0, 0.0],
    yawOffset: 0.0,
    pitchOffset: -0.55,
};
export function initGhost(mesh) {
    const g = createGhost(mesh ?? CubeMesh);
    g.controllable.speed *= 10;
    g.controllable.sprintMul = 0.2;
    const gameName = GAME_LOADER.getGameName();
    // TODO(@darzu): ABSTRACT / GENERALIZE so other systems can save/load state
    const storageKey = `ghostCam_${gameName}`;
    let ghostCam;
    let ghostCamStr = localStorage.getItem(storageKey);
    if (!ghostCamStr) {
        ghostCam = defaultCam;
    }
    else {
        // TODO(@darzu): VALIDATE!
        ghostCam = JSON.parse(ghostCamStr);
    }
    applyCameraSettings(g, ghostCam);
    let _lastSettings = "";
    EM.addSystem("saveGhostCamera", Phase.GAME_WORLD, [GhostDef, PositionDef, RotationDef, CameraFollowDef], [TimeDef], (es, res) => {
        // save once every ~second
        if (res.time.step % 60 !== 0)
            return;
        if (!es.length)
            return;
        assert(es.length === 1);
        const e = es[0];
        // get settings
        const settings = getCameraSettings(e);
        const str = JSON.stringify(settings);
        // have settings changed?
        if (str == _lastSettings)
            return;
        // save
        localStorage.setItem(storageKey, str);
    });
    return g;
}
//# sourceMappingURL=graybox-helpers.js.map