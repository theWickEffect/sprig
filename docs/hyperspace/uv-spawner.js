import { AnimateToDef } from "../animation/animate-to.js";
import { createRef } from "../ecs/em-helpers.js";
import { EM } from "../ecs/ecs.js";
import { V2, V3, quat } from "../matrix/sprig-matrix.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { eventWizard } from "../net/events.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PhysicsParentDef, PositionDef, RotationDef, } from "../physics/transform.js";
import { spawnEnemyShip } from "./uv-enemy-ship.js";
import { UVDirDef, UVPosDef } from "../ocean/ocean.js";
import { Phase } from "../ecs/sys-phase.js";
// TODO(@darzu): generalize for spawning non-enemy entities in the ocean
const ChildCS = [
    PositionDef,
    RotationDef,
    WorldFrameDef,
    PhysicsParentDef,
];
export const SpawnerDef = EM.defineComponent("spawner", function () {
    return {
        childrenToRelease: [],
        hasSpawned: false,
    };
}, (p, s) => Object.assign(p, s));
export function createSpawner(uvPos, uvDir, animate) {
    const e = EM.mk();
    EM.set(e, SpawnerDef);
    EM.set(e, UVPosDef, uvPos);
    EM.set(e, UVDirDef, uvDir);
    EM.set(e, PositionDef);
    EM.set(e, RotationDef);
    // TODO(@darzu): put AuthorityDef and sync stuff on spawner
    if (animate)
        EM.set(e, AnimateToDef, animate);
    return e;
}
export function registerUvSpawnSystems() {
    EM.addSystem("spawnOnTile", Phase.GAME_WORLD, [SpawnerDef, UVPosDef, UVDirDef], [MeDef], (tiles, res) => {
        for (let t of tiles) {
            if (AuthorityDef.isOn(t) && t.authority.pid !== res.me.pid)
                continue;
            if (t.spawner.hasSpawned)
                continue;
            // TODO(@darzu): move to util, very useful
            // const angle = Math.atan2(
            //   t.spawner.towardsPlayerDir[2],
            //   -t.spawner.towardsPlayerDir[0]
            // );
            // TODO(@darzu): parameterize what is spawned
            const b = spawnEnemyShip(V2.copy(V2.mk(), t.uvPos), t.id, V2.copy(V2.mk(), t.uvDir));
            // console.log(`spawning ${b.id} from ${t.id} at ${performance.now()}`);
            t.spawner.childrenToRelease.push(createRef(b.id, [...ChildCS]));
            t.spawner.hasSpawned = true;
        }
    });
    // TODO(@darzu): this seems really general
    const runUnparent = eventWizard("unparent", [[PhysicsParentDef, PositionDef, RotationDef, WorldFrameDef]], ([c]) => {
        // TODO(@darzu): DBG
        // console.log(`unparent on: ${c.id}`);
        V3.copy(c.position, c.world.position);
        quat.copy(c.rotation, c.world.rotation);
        c.physicsParent.id = 0;
    });
    // TODO(@darzu): can we make this more ground agnostic?
    EM.addSystem("spawnFinishAnimIn", Phase.GAME_WORLD, [SpawnerDef, RotationDef, PositionDef], [MeDef], (tiles, res) => {
        const toRemove = [];
        for (let t of tiles) {
            if (AuthorityDef.isOn(t) && t.authority.pid !== res.me.pid)
                continue;
            // TODO(@darzu): is spawner still relevant?
            // is the ground ready?
            // if (!t.groundLocal.readyForSpawn) continue;
            // TODO(@darzu): it'd be nice to have a non-network event system
            // are we still animating?
            if (AnimateToDef.isOn(t))
                continue;
            // unparent children
            // console.log(`childrenToRelease: ${t.spawner.childrenToRelease.length}`);
            for (let i = t.spawner.childrenToRelease.length - 1; i >= 0; i--) {
                const c = t.spawner.childrenToRelease[i]();
                if (c) {
                    // console.log(
                    //   `unparenting ${c.id} from ${t.id} at ${performance.now()}`
                    // );
                    // TODO(@darzu): we're doing duplicate work here. we do it so that at least
                    //  on the host there is less position flickering
                    V3.copy(c.position, c.world.position);
                    quat.copy(c.rotation, c.world.rotation);
                    c.physicsParent.id = 0;
                    runUnparent(c);
                    t.spawner.childrenToRelease.splice(i);
                }
            }
            // do we still have children to release?
            if (!t.spawner.childrenToRelease.length) {
                toRemove.push(t.id); // if not, remove the spawner
            }
        }
        for (let id of toRemove) {
            EM.removeComponent(id, SpawnerDef);
        }
    });
}
//# sourceMappingURL=uv-spawner.js.map