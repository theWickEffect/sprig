import { CameraDef } from "../camera.js";
import { ColorDef } from "../color.js";
import { EntityManager } from "../entity-manager.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { blurPipelines } from "../render/pipelines/std-blur.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { shadowPipeline } from "../render/pipelines/std-shadow.js";
import { initStars, renderStars } from "../render/pipelines/std-stars.js";
import { AssetsDef } from "./assets.js";
import { MeDef } from "../net/components.js";
import { createPlayer } from "./player.js";
import { createShip } from "./ship.js";
import { GameStateDef } from "./gamestate.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { noisePipes } from "../render/pipelines/std-noise.js";
import { DevConsoleDef } from "../console.js";
import { initOcean, OceanDef, oceanJfa, UVDef, UVDirDef } from "./ocean.js";
import { awaitTimeout } from "../util.js";

// export let jfaMaxStep = VISUALIZE_JFA ? 0 : 999;

export async function initHyperspaceGame(em: EntityManager) {
  const camera = em.addSingletonComponent(CameraDef);
  camera.fov = Math.PI * 0.5;

  em.addSingletonComponent(GameStateDef);

  // if (hosting) {
  createShip([0.1, 0.1]);
  // }

  em.whenResources([MeDef, OceanDef]).then(async () => {
    // await awaitTimeout(1000); // TODO(@darzu): what is happening
    createPlayer(em);
  });

  em.registerSystem(
    [],
    [],
    () => {
      // console.log("debugLoop");
      // em.whyIsntSystemBeingCalled("oceanGPUWork");
    },
    "debugLoop"
  );

  // const grid = [
  //   //
  //   [oceanJfa._inputMaskTex, oceanJfa._uvMaskTex],
  //   //
  //   [oceanJfa.voronoiTex, uvToPosTex],
  // ];
  // let grid = noiseGridFrame;
  // const grid = [[oceanJfa._voronoiTexs[0]], [oceanJfa._voronoiTexs[1]]];

  let gridCompose = createGridComposePipelines(oceanJfa._debugGrid);

  em.registerSystem(
    null,
    [RendererDef, DevConsoleDef],
    (_, res) => {
      res.renderer.pipelines = [
        shadowPipeline,
        stdRenderPipeline,
        outlineRender,
        renderStars,
        ...blurPipelines,

        postProcess,
        ...(res.dev.showConsole ? gridCompose : []),
      ];
    },
    "hyperspaceGame"
  );

  const res = await em.whenResources([AssetsDef, RendererDef]);

  // const ghost = createGhost(em);
  // em.ensureComponentOn(ghost, RenderableConstructDef, res.assets.cube.proto);
  // ghost.controllable.speed *= 3;
  // ghost.controllable.sprintMul *= 3;

  {
    // // debug camera
    // vec3.copy(ghost.position, [-185.02, 66.25, -69.04]);
    // quat.copy(ghost.rotation, [0.0, -0.92, 0.0, 0.39]);
    // vec3.copy(ghost.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // ghost.cameraFollow.yawOffset = 0.0;
    // ghost.cameraFollow.pitchOffset = -0.465;
    // let g = ghost;
    // vec3.copy(g.position, [-208.43, 29.58, 80.05]);
    // quat.copy(g.rotation, [0.0, -0.61, 0.0, 0.79]);
    // vec3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    // g.cameraFollow.yawOffset = 0.0;
    // g.cameraFollow.pitchOffset = -0.486;
  }

  // one-time GPU jobs
  res.renderer.renderer.submitPipelines([], [...noisePipes, initStars]);

  initOcean();

  // em.ensureComponentOn(ocean, PositionDef, [120, 0, 0]);
  // vec3.scale(ocean.position, ocean.position, scale);
  // const scale = 100.0;
  // const scale = 1.0;
  // em.ensureComponentOn(ocean, ScaleDef, [scale, scale, scale]);
  // em.ensureComponentOn(ocean, AngularVelocityDef, [0.0001, 0.0001, 0.0001]);

  // TODO(@darzu): DEBUG quad mesh stuff
  const fabric = em.newEntity();
  em.ensureComponentOn(
    fabric,
    RenderableConstructDef,
    res.assets.fabric.proto
    // true,
    // 0
    // UVUNWRAP_MASK
  );
  em.ensureComponentOn(fabric, PositionDef, [10, 10, 10]);
  // em.ensureComponentOn(fabric, AngularVelocityDef, [1.0, 10.0, 0.1]);

  const buoy = em.newEntity();
  em.ensureComponentOn(buoy, PositionDef);
  em.ensureComponentOn(buoy, RenderableConstructDef, res.assets.ship.proto);
  em.ensureComponentOn(buoy, ScaleDef, [1.0, 1.0, 1.0]);
  em.ensureComponentOn(buoy, ColorDef, [0.2, 0.8, 0.2]);
  em.ensureComponentOn(buoy, UVDef, [0.1, 0.1]);
  em.ensureComponentOn(buoy, UVDirDef, [1.0, 0.0]);
}