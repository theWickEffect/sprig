// TODO(@darzu): move other common infrastructure here?
import { CameraFollowDef, setCameraFollowPosition } from "../camera/camera.js";
import { EM } from "../ecs/ecs.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { ControllableDef } from "../input/controllable.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
// TODO(@darzu): HACK. we need a better way to programmatically create sandbox games
export const gameplaySystems = [];
export const GhostDef = EM.defineComponent("ghost", () => ({}));
export function createGhost(mesh, visible = true) {
    const g = EM.mk();
    EM.set(g, GhostDef);
    EM.set(g, ControllableDef);
    g.controllable.modes.canFall = false;
    g.controllable.modes.canJump = false;
    // g.controllable.modes.canYaw = true;
    // g.controllable.modes.canPitch = true;
    EM.set(g, CameraFollowDef, 1);
    setCameraFollowPosition(g, "firstPerson");
    EM.set(g, PositionDef);
    EM.set(g, RotationDef);
    // quat.rotateY(g.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
    // quat.rotateX(g.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
    EM.set(g, LinearVelocityDef);
    EM.set(g, RenderableConstructDef, mesh, visible);
    return g;
}
//# sourceMappingURL=ghost.js.map