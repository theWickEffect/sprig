import { EM } from "../ecs/ecs.js";
import { V3, quat, mat4 } from "../matrix/sprig-matrix.js";
import { TimeDef } from "../time/time.js";
import { PositionDef, PhysicsParentDef, RotationDef, TransformDef, copyFrame, updateFrameFromPosRotScale, updateFrameFromTransform, createFrame, } from "../physics/transform.js";
import { computeNewError, reduceError } from "../utils/smoothing.js";
import { RemoteUpdatesDef } from "../net/components.js";
import { Phase } from "../ecs/sys-phase.js";
import { RenderableDef, RendererWorldFrameDef } from "./renderer-ecs.js";
import { DONT_SMOOTH_WORLD_FRAME } from "../flags.js";
import { DeletedDef } from "../ecs/delete.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
// Determined via binary search--smaller -> jerky, larger -> floaty
const ERROR_SMOOTHING_FACTOR = 0.75 ** (60 / 1000);
const BLEND_SIMULATION_FRAMES_STRATEGY = "none";
let _simulationAlpha = 0.0;
export function setSimulationAlpha(to) {
    _simulationAlpha = to;
}
export const MotionSmoothingDef = EM.defineComponent("motionSmoothing", () => {
    return {
        havePrevious: false,
        prevParentId: 0,
        prevPosition: V3.mk(),
        prevRotation: quat.mk(),
        positionError: V3.mk(),
        rotationError: quat.mk(),
    };
});
const _hasRendererWorldFrame = new Set();
export const SmoothedWorldFrameDef = EM.defineComponent("smoothedWorldFrame", () => createFrame());
export const PrevSmoothedWorldFrameDef = EM.defineComponent("prevSmoothedWorldFrame", () => createFrame());
function updateSmoothedWorldFrame(o) {
    if (DeletedDef.isOn(o))
        return;
    if (!TransformDef.isOn(o))
        return;
    let parent = null;
    if (PhysicsParentDef.isOn(o) && o.physicsParent.id) {
        if (!_hasRendererWorldFrame.has(o.physicsParent.id)) {
            updateSmoothedWorldFrame(EM.findEntity(o.physicsParent.id, []));
        }
        parent = EM.findEntity(o.physicsParent.id, [SmoothedWorldFrameDef]);
        if (!parent)
            return;
    }
    let firstFrame = false;
    if (!SmoothedWorldFrameDef.isOn(o))
        firstFrame = true;
    EM.set(o, SmoothedWorldFrameDef);
    EM.set(o, PrevSmoothedWorldFrameDef);
    copyFrame(o.prevSmoothedWorldFrame, o.smoothedWorldFrame);
    mat4.copy(o.smoothedWorldFrame.transform, o.transform);
    updateFrameFromTransform(o.smoothedWorldFrame);
    if (MotionSmoothingDef.isOn(o)) {
        V3.add(o.smoothedWorldFrame.position, o.motionSmoothing.positionError, o.smoothedWorldFrame.position);
        quat.mul(o.smoothedWorldFrame.rotation, o.motionSmoothing.rotationError, o.smoothedWorldFrame.rotation);
        updateFrameFromPosRotScale(o.smoothedWorldFrame);
    }
    if (parent) {
        mat4.mul(parent.smoothedWorldFrame.transform, o.smoothedWorldFrame.transform, o.smoothedWorldFrame.transform);
        updateFrameFromTransform(o.smoothedWorldFrame);
    }
    if (firstFrame)
        copyFrame(o.prevSmoothedWorldFrame, o.smoothedWorldFrame);
    _hasRendererWorldFrame.add(o.id);
}
EM.addEagerInit([MotionSmoothingDef], [], [], () => {
    EM.addSystem("recordPreviousLocations", Phase.NETWORK, [MotionSmoothingDef], [], (es) => {
        for (let e of es) {
            e.motionSmoothing.havePrevious = true;
            if (PositionDef.isOn(e))
                V3.copy(e.motionSmoothing.prevPosition, e.position);
            if (RotationDef.isOn(e))
                quat.copy(e.motionSmoothing.prevRotation, e.rotation);
            e.motionSmoothing.prevParentId = PhysicsParentDef.isOn(e)
                ? e.physicsParent.id
                : 0;
        }
    });
    EM.addSystem("smoothMotion", Phase.PRE_RENDER, [MotionSmoothingDef], [TimeDef], (es, res) => {
        for (let e of es) {
            reduceError(e.motionSmoothing.positionError, res.time.dt, ERROR_SMOOTHING_FACTOR);
            reduceError(e.motionSmoothing.rotationError, res.time.dt, ERROR_SMOOTHING_FACTOR);
        }
    });
    EM.addSystem("updateMotionSmoothing", Phase.PRE_RENDER, [MotionSmoothingDef], [], (es) => {
        for (let e of es) {
            if (RemoteUpdatesDef.isOn(e) && e.motionSmoothing.havePrevious) {
                const parentId = PhysicsParentDef.isOn(e) ? e.physicsParent.id : 0;
                if (parentId === e.motionSmoothing.prevParentId) {
                    computeNewError(e.motionSmoothing.prevPosition, PositionDef.isOn(e) ? e.position : V3.mk(), e.motionSmoothing.positionError);
                    computeNewError(e.motionSmoothing.prevRotation, RotationDef.isOn(e) ? e.rotation : quat.identity(quat.mk()), e.motionSmoothing.rotationError);
                }
                else {
                    // if we change parents just snap to the new location
                    V3.set(0, 0, 0, e.motionSmoothing.positionError);
                    quat.identity(e.motionSmoothing.rotationError);
                }
            }
        }
    });
});
EM.addEagerInit([RenderableDef, TransformDef], [], [], () => {
    EM.addSystem("updateSmoothedWorldFrames", Phase.PRE_RENDER, [RenderableDef, TransformDef], [], (objs, res) => {
        _hasRendererWorldFrame.clear();
        for (const o of objs) {
            // TODO(@darzu): PERF HACK!
            if (DONT_SMOOTH_WORLD_FRAME) {
                EM.set(o, SmoothedWorldFrameDef);
                EM.set(o, PrevSmoothedWorldFrameDef);
                continue;
            }
            updateSmoothedWorldFrame(o);
        }
    });
    EM.addSystem("updateRendererWorldFrames", Phase.RENDER_WORLDFRAMES, [SmoothedWorldFrameDef, PrevSmoothedWorldFrameDef], [], (objs) => {
        for (let o of objs) {
            if (DONT_SMOOTH_WORLD_FRAME) {
                // TODO(@darzu): HACK!
                if (WorldFrameDef.isOn(o)) {
                    EM.set(o, RendererWorldFrameDef);
                    copyFrame(o.rendererWorldFrame, o.world);
                    // (o as any).rendererWorldFrame = o.world;
                }
                continue;
            }
            EM.set(o, RendererWorldFrameDef);
            switch (BLEND_SIMULATION_FRAMES_STRATEGY) {
                case "interpolate":
                    interpolateFrames(_simulationAlpha, o.rendererWorldFrame, o.prevSmoothedWorldFrame, o.smoothedWorldFrame);
                    break;
                case "extrapolate":
                    extrapolateFrames(_simulationAlpha, o.rendererWorldFrame, o.prevSmoothedWorldFrame, o.smoothedWorldFrame);
                    break;
                default:
                    copyFrame(o.rendererWorldFrame, o.smoothedWorldFrame);
            }
        }
    });
});
function interpolateFrames(alpha, out, prev, next) {
    V3.lerp(prev.position, next.position, alpha, out.position);
    quat.slerp(prev.rotation, next.rotation, alpha, out.rotation);
    V3.lerp(prev.scale, next.scale, alpha, out.scale);
    updateFrameFromPosRotScale(out);
}
function extrapolateFrames(alpha, out, prev, next) {
    // out.position = next.position + alpha * (next.position - prev.position)
    // out.position = next.position + alpha * (next.position - prev.position)
    V3.sub(next.position, prev.position, out.position);
    V3.scale(out.position, alpha, out.position);
    V3.add(out.position, next.position, out.position);
    // see https://answers.unity.com/questions/168779/extrapolating-quaternion-rotation.html
    // see https://answers.unity.com/questions/168779/extrapolating-quaternion-rotation.html
    quat.invert(prev.rotation, out.rotation);
    quat.mul(next.rotation, out.rotation, out.rotation);
    const axis = V3.tmp();
    let angle = quat.getAxisAngle(out.rotation, axis);
    // ensure we take the shortest path
    if (angle > Math.PI) {
        angle -= Math.PI * 2;
    }
    if (angle < -Math.PI) {
        angle += Math.PI * 2;
    }
    angle = angle * alpha;
    quat.setAxisAngle(axis, angle, out.rotation);
    quat.mul(out.rotation, next.rotation, out.rotation);
    // out.scale = next.scale + alpha * (next.scale - prev.scale)
    // out.scale = next.scale + alpha * (next.scale - prev.scale)
    V3.sub(next.scale, prev.scale, out.scale);
    V3.scale(out.scale, alpha, out.scale);
    V3.add(out.scale, next.scale, out.scale);
    updateFrameFromPosRotScale(out);
}
//# sourceMappingURL=motion-smoothing.js.map