import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { quat, V3 } from "../matrix/sprig-matrix.js";
import { ArrowMesh } from "../meshes/mesh-list.js";
import { PhysicsParentDef, PositionDef, RotationDef, ScaleDef, } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
export const VecDbgDef = EM.defineNonupdatableComponent("vecDbg", (v, scale) => ({ v, scale }), { multiArg: true });
// TODO(@darzu): HACK! This whole system works by tracking a reference to a vector
EM.addEagerInit([VecDbgDef], [], [], () => {
    EM.addSystem("updateVecDebugVisuals", Phase.POST_GAME_WORLD, [VecDbgDef, ScaleDef, RotationDef], [], (es, res) => {
        for (let e of es) {
            updateVecDbgVis(e.vecDbg.v, e.vecDbg.scale, e);
        }
    });
});
export const DefaultVecDbgVisOpts = {
    origin: [0, 0, 0],
    scale: 1,
    parentId: 0,
    color: ENDESGA16.lightGreen,
};
export function drawUpdatingVector(v, opts) {
    const o = { ...DefaultVecDbgVisOpts, ...opts };
    const ent = drawVector(v, o);
    EM.set(ent, VecDbgDef, v, o.scale);
    return ent;
}
export function drawVector(v, opts) {
    const o = { ...DefaultVecDbgVisOpts, ...opts };
    const ent = EM.mk();
    EM.set(ent, PositionDef, o.origin);
    EM.set(ent, RenderableConstructDef, ArrowMesh);
    EM.set(ent, ColorDef, o.color);
    EM.set(ent, ScaleDef);
    EM.set(ent, RotationDef);
    if (o.parentId !== 0)
        EM.set(ent, PhysicsParentDef, o.parentId);
    updateVecDbgVis(v, o.scale, ent);
    return ent;
}
function updateVecDbgVis(v, s, e) {
    // update scale
    const scale = s * V3.len(v);
    // vec3.set(1, scale, 1, e.scale);
    V3.set(scale * 0.5, scale, scale * 0.5, e.scale);
    // update rotation
    quat.fromForward(v, e.rotation);
}
//# sourceMappingURL=util-vec-dbg.js.map