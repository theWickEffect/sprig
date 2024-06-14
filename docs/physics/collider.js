import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { getAABBFromMesh } from "../meshes/mesh.js";
import { RenderableDef } from "../render/renderer-ecs.js";
export const DefaultLayer = 0b0000000000000001;
export const AllLayer = 0b1111111111111111;
export const NoLayer = 0b0000000000000000;
export function isAABBCollider(c) {
    return c.shape === "AABB";
}
// TODO(@darzu): ensure we support swapping colliders?
export const ColliderDef = EM.defineNonupdatableComponent("collider", (c) => {
    return (c ??
        {
            shape: "Empty",
            solid: false,
        });
});
const __COLLIDER_ASSERT = true;
export const ColliderFromMeshDef = EM.defineComponent("colliderFromMesh", () => ({ solid: true }), (p, solid) => {
    p.solid = solid ?? p.solid;
    return p;
});
EM.addSystem("colliderFromMeshDef", Phase.GAME_WORLD, [ColliderFromMeshDef, RenderableDef], [], (es, res) => {
    for (let e of es) {
        if (ColliderDef.isOn(e))
            continue;
        // TODO(@darzu): cache these? Or get them from the GameObject?
        const aabb = getAABBFromMesh(e.renderable.meshHandle.mesh);
        EM.set(e, ColliderDef, {
            shape: "AABB",
            aabb,
            solid: e.colliderFromMesh.solid,
        });
    }
});
//# sourceMappingURL=collider.js.map