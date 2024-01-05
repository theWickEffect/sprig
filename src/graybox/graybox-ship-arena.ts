import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { createGhost } from "../debug/ghost.js";
import { createGizmoMesh } from "../debug/gizmos.js";
import { EM } from "../ecs/entity-manager.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import { CubeMesh, HexMesh } from "../meshes/mesh-list.js";
import { cloneMesh, normalizeMesh, scaleMesh3 } from "../meshes/mesh.js";
import { mkCubeMesh } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { addGizmoChild, addWorldGizmo } from "../utils/utils-game.js";
import { initGhost, initWorld } from "./graybox-helpers.js";

const DBG_GHOST = true;
const DBG_GIZMO = true;

export async function initGrayboxShipArena() {
  initWorld();

  // ocean
  const ocean = EM.new();
  EM.set(ocean, ColorDef, ENDESGA16.blue);
  EM.set(ocean, PositionDef, V(0, 0, 0));
  EM.set(ocean, RenderableConstructDef, CubeMesh);
  EM.set(ocean, ScaleDef, V(100, 100, 0.1));

  createShip();

  // dbg ghost
  if (DBG_GHOST) {
    initGhost();
  }
}

function createShip() {
  // ship
  const ship = EM.new();
  EM.set(ship, ColorDef, ENDESGA16.midBrown);
  EM.set(ship, PositionDef, V(40, 40, 3));
  const shipMesh = mkCubeMesh();
  scaleMesh3(shipMesh, [8, 16, 2]);
  EM.set(ship, RenderableConstructDef, shipMesh);
  EM.set(ship, CameraFollowDef);
  vec3.copy(ship.cameraFollow.positionOffset, [0.0, -50.0, 0]);
  ship.cameraFollow.pitchOffset = -Math.PI * 0.25;

  if (DBG_GIZMO) addGizmoChild(ship, 10);
}
