import { CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { Resources } from "../ecs/em-resources.js";
import { Phase } from "../ecs/sys-phase.js";
import { defineObj } from "../ecs/em-objects.js";
import { V, quat } from "../matrix/sprig-matrix.js";
import { RudderPrimMesh } from "../meshes/mesh-list.js";
import { MeDef, AuthorityDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import {
  PositionDef,
  RotationDef,
  PhysicsParentDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { constructNetTurret, TurretDef } from "../turret/turret.js";
import { YawPitchDef } from "../turret/yawpitch.js";
import { addGizmoChild } from "../utils/utils-game.js";

const RUDDER_ROTATION_RATE = 0.01;

export const RudderDef = EM.defineComponent("rudder", () => true);

export const HasRudderObj = defineObj({
  name: "hasRudder",
  components: [],
  physicsParentChildren: true,
  children: {
    rudder: [
      RudderDef,
      YawPitchDef,
      // TurretDef,
      // CameraFollowDef,
      // AuthorityDef,
      RotationDef,
      PositionDef,
    ],
  },
} as const);
export const HasRudderDef = HasRudderObj.props;

// TODO(@darzu): Use Objects and mixins
export function createRudder() {
  const rudder = EM.mk();
  EM.set(rudder, RudderDef);
  EM.set(rudder, RenderableConstructDef, RudderPrimMesh);
  // EM.set(ent, ColorDef, V(0.2, 0.1, 0.05));
  EM.set(rudder, ColorDef, ENDESGA16.midBrown);
  EM.set(rudder, PositionDef);
  EM.set(rudder, RotationDef);
  EM.set(rudder, YawPitchDef);

  return rudder;
}

export function createRudderTurret(res: Resources<[typeof MeDef]>) {
  const rudder = createRudder();

  addGizmoChild(rudder, 4);

  const interactBox = EM.mk();
  EM.set(interactBox, PhysicsParentDef, rudder.id);
  EM.set(interactBox, PositionDef);
  EM.set(interactBox, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: {
      min: V(-1, -2, -2),
      max: V(1, 2.5, 2.5),
    },
  });
  constructNetTurret(
    rudder,
    0,
    0,
    interactBox,
    0.0 * Math.PI,
    // -Math.PI / 8,
    -Math.PI / 12,
    1.6,
    // V(0, 20, 50),
    V(0, -30, 10), // camera offset
    true,
    1,
    Math.PI,
    "W/S: unfurl/furl sail, A/D: turn, E: drop rudder"
  );

  rudder.turret.maxPitch = 0;
  rudder.turret.minPitch = 0;
  rudder.turret.maxYaw = Math.PI / 6;
  rudder.turret.minYaw = -Math.PI / 6;
  rudder.turret.invertYaw = true;

  return rudder;
}

EM.addEagerInit([RudderDef], [], [], () => {
  // If a rudder isn't being manned, smooth it back towards straight
  EM.addSystem(
    "easeRudder",
    Phase.GAME_WORLD,
    [RudderDef, YawPitchDef],
    [MeDef],
    (rudders, res) => {
      for (let r of rudders) {
        if (AuthorityDef.isOn(r) && r.authority.pid !== res.me.pid) continue;
        if (TurretDef.isOn(r) && r.turret.mannedId !== 0) continue;
        if (Math.abs(r.yawpitch.yaw) < 0.01) r.yawpitch.yaw = 0;
        r.yawpitch.yaw *= 0.9;
      }
    }
  );

  EM.addSystem(
    "rudderTurn",
    Phase.GAME_PLAYERS,
    [HasRudderDef, RotationDef],
    [],
    (es) => {
      for (let e of es) {
        // rudder
        let yaw = e.hasRudder.rudder.yawpitch.yaw;
        quat.yaw(e.rotation, yaw * RUDDER_ROTATION_RATE, e.rotation);
      }
    }
  );
});
