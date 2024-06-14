import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { PhysicsResultsDef } from "./nonintersection.js";
// TODO(@darzu): make this friendly with multiplayer event system?
// TODO(@darzu): support narrowphase check? e.g. SphereBV vs OBB
export function onCollides(as, bs, rs, callback) {
    const aName = as.map((a) => a.name).join("_");
    const bName = bs.map((b) => b.name).join("_");
    const sysName = `Collides_${aName}_v_${bName}`;
    EM.addSystem(sysName, Phase.GAME_WORLD, as, [PhysicsResultsDef, ...rs], (aas, _res) => {
        // TODO(@darzu): TypeScript. Doesn't believe these:
        const res1 = _res;
        const res2 = _res;
        for (let _a of aas) {
            const a = _a; // TODO(@darzu): TypeScript. Doesn't believe this by default.
            let others = res1.physicsResults.collidesWith.get(a.id);
            if (!others)
                continue;
            for (let bId of others) {
                const b = EM.findEntity(bId, bs);
                if (!b)
                    continue;
                callback(a, b, res2);
            }
        }
    });
}
//# sourceMappingURL=phys-helpers.js.map