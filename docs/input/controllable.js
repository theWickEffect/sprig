import { AnimateToDef } from "../animation/animate-to.js";
import { CameraFollowDef } from "../camera/camera.js";
import { CanvasDef } from "../render/canvas.js";
import { EM } from "../ecs/ecs.js";
import { V3, quat } from "../matrix/sprig-matrix.js";
import { InputsDef } from "./inputs.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { RotationDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "../ecs/sys-phase.js";
/*
TODO key mapping

controllable:
  WASD / left stick -> xz movement
  Space / A -> jump
  Space / A -> fly up
  c / B -> fly down
  Shift / left stick press -> speed up

  camera: behind, over-shoulder, first person, rts
  cursor (when over-shoulder)

  e / X -> interact
  click / trigger -> shoot

  debug:
  r -> ray
  t -> re-parent
  backspace -> delete obj
*/
export const ControllableDef = EM.defineComponent("controllable", () => {
    return {
        speed: 0.0005,
        sprintMul: 3,
        gravity: 0.1 / 1000,
        jumpSpeed: 0.003,
        turnSpeed: 0.001,
        requiresPointerLock: true,
        modes: {
            canFall: true,
            canFly: true,
            canSprint: true,
            canJump: true,
            canPitch: true,
            canYaw: true,
            // TODO(@darzu): this isn't clean...
            canCameraYaw: false,
            canMove: true,
        },
    };
});
EM.addEagerInit([ControllableDef], [], [], () => {
    const steerVel = V3.mk();
    // dbgLogOnce(`adding controllableInput`);
    EM.addSystem("controllableInput", Phase.GAME_PLAYERS, [ControllableDef, RotationDef, WorldFrameDef], [InputsDef, MeDef, CanvasDef, TimeDef], (controllables, res) => {
        for (let c of controllables) {
            if (AuthorityDef.isOn(c) && c.authority.pid !== res.me.pid)
                continue;
            // don't control things when we're not locked onto the canvas
            if (c.controllable.requiresPointerLock &&
                !res.htmlCanvas.hasMouseLock())
                continue;
            // TODO(@darzu): need a far more general way to handle things like this
            // don't control things that are animating
            if (AnimateToDef.isOn(c))
                continue;
            // dbgLogOnce(`Controlling ${c.id}`);
            V3.zero(steerVel);
            const modes = c.controllable.modes;
            let speed = c.controllable.speed * res.time.dt;
            if (modes.canSprint)
                if (res.inputs.keyDowns["shift"])
                    speed *= c.controllable.sprintMul;
            if (modes.canMove) {
                if (res.inputs.keyDowns["a"])
                    steerVel[0] -= speed;
                if (res.inputs.keyDowns["d"])
                    steerVel[0] += speed;
                if (res.inputs.keyDowns["w"])
                    steerVel[1] += speed;
                if (res.inputs.keyDowns["s"])
                    steerVel[1] -= speed;
                if (modes.canFly) {
                    if (res.inputs.keyDowns[" "])
                        steerVel[2] += speed;
                    if (res.inputs.keyDowns["c"])
                        steerVel[2] -= speed;
                }
            }
            EM.set(c, LinearVelocityDef);
            if (modes.canFall)
                c.linearVelocity[2] -= c.controllable.gravity * res.time.dt;
            if (modes.canJump)
                if (res.inputs.keyClicks[" "])
                    c.linearVelocity[2] = c.controllable.jumpSpeed * res.time.dt;
            // apply our steering velocity
            V3.tQuat(steerVel, c.rotation, steerVel);
            c.linearVelocity[0] = steerVel[0];
            c.linearVelocity[1] = steerVel[1];
            if (modes.canFly)
                c.linearVelocity[2] = steerVel[2];
            if (modes.canYaw)
                quat.rotZ(c.rotation, -res.inputs.mouseMov[0] * c.controllable.turnSpeed, c.rotation);
        }
    });
    EM.addSystem("controllableCameraFollow", Phase.GAME_PLAYERS, [ControllableDef, CameraFollowDef], [InputsDef, MeDef, CanvasDef], (controllables, res) => {
        for (let c of controllables) {
            if (AuthorityDef.isOn(c) && c.authority.pid !== res.me.pid)
                continue;
            if (c.controllable.requiresPointerLock &&
                !res.htmlCanvas.hasMouseLock())
                continue;
            // TODO(@darzu): probably need to use yaw-pitch :(
            if (c.controllable.modes.canCameraYaw) {
                c.cameraFollow.yawOffset +=
                    res.inputs.mouseMov[0] * c.controllable.turnSpeed;
            }
            if (c.controllable.modes.canPitch)
                c.cameraFollow.pitchOffset +=
                    -res.inputs.mouseMov[1] * c.controllable.turnSpeed;
        }
    });
});
//# sourceMappingURL=controllable.js.map