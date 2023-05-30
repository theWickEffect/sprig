import { EntityManager } from "./ecs/entity-manager.js";
import {
  initNetStateEventSystems,
  initNetSendOutboxes,
} from "./net/network-event-handler.js";
import { initNetJoinSystems } from "./net/join.js";
import {
  initNetSyncSystem,
  initNetUpdateSystems,
  initNetAckUpdateSystem,
} from "./net/sync.js";
import { initNetPredictSystems } from "./net/predict.js";
import { initNetGameEventSystems } from "./net/events.js";
import { initRiggedRenderablesSystems } from "./render/renderer-ecs.js";
import { init3DModeler } from "./meshes/modeler.js";
import {
  initNetMotionRecordingSystem,
  initMotionSmoothingSystems,
} from "./render/motion-smoothing.js";
import { initPhysicsSystems } from "./physics/phys.js";
import { initNetDebugSystem } from "./net/net-debug.js";
import { callInitFns } from "./init.js";
import { initHtmlUI } from "./gui/ui.js";
import { initDevConsole } from "./debug/console.js";
import { initNetSystems } from "./net/net.js";
import { ENABLE_NET } from "./flags.js";
import { initClothSystems } from "./cloth/cloth.js";
import { initSpringSystems } from "./cloth/spring.js";
import { initSkeletalAnimSystems } from "./animation/skeletal.js";
import { initStdMeshUpload } from "./render/pipelines/std-mesh.js";
import { initOceanDataUpload } from "./render/pipelines/std-ocean.js";
import { initDbgViewModes } from "./debug/view-modes.js";
import { initWoodSplinterSystem } from "./wood/wood-splinters.js";
import { initWoodSystems } from "./wood/wood.js";

export function initCommonSystems(em: EntityManager) {
  if (ENABLE_NET) {
    initNetSystems(em);
  }
  initNetStateEventSystems(em);
  initNetMotionRecordingSystem(em);
  initNetUpdateSystems(em);
  initNetPredictSystems(em);
  initNetJoinSystems(em);

  initNetDebugSystem(em);
  initNetAckUpdateSystem(em);
  initNetSyncSystem(em);
  initNetSendOutboxes(em);
  initNetGameEventSystems(em);

  initHtmlUI(em);
  initDevConsole(em);

  initPhysicsSystems(em);

  initMotionSmoothingSystems(em);
  initDbgViewModes(em);
  initRiggedRenderablesSystems(em);
  initClothSystems();
  initSpringSystems();
  initSkeletalAnimSystems();
  initStdMeshUpload();
  initOceanDataUpload();
  initWoodSplinterSystem();
  initWoodSystems();

  callInitFns(em);
}
