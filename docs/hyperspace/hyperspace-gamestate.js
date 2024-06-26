import { DeletedDef } from "../ecs/delete.js";
import { EM } from "../ecs/ecs.js";
import { V3, quat, V } from "../matrix/sprig-matrix.js";
import { AuthorityDef, HostDef, MeDef } from "../net/components.js";
import { eventWizard } from "../net/events.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PhysicsParentDef, PositionDef, RotationDef, } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { LifetimeDef } from "../ecs/lifetime.js";
import { LocalPlayerEntityDef, HsPlayerDef, } from "./hs-player.js";
import { createHsShip, HsShipLocalDef, HsShipPropsDef, } from "./hyperspace-ship.js";
import { AudioDef } from "../audio/audio.js";
import { Phase } from "../ecs/sys-phase.js";
import { CanManDef } from "../turret/turret.js";
const RESTART_TIME_MS = 5000;
// TODO(@darzu): MULTIPLAYER. Generalized version:
//  n game states (enum generic?)
//  onXGameState
//  setGameState
//  maybe a generalized state machine?
export var HyperspaceGameState;
(function (HyperspaceGameState) {
    HyperspaceGameState[HyperspaceGameState["LOBBY"] = 0] = "LOBBY";
    HyperspaceGameState[HyperspaceGameState["PLAYING"] = 1] = "PLAYING";
    HyperspaceGameState[HyperspaceGameState["GAMEOVER"] = 2] = "GAMEOVER";
})(HyperspaceGameState || (HyperspaceGameState = {}));
export const HSGameStateDef = EM.defineResource("hsGameState", () => {
    return { state: HyperspaceGameState.LOBBY, time: 0 };
});
export const startGame = eventWizard("start-game", () => [[HsPlayerDef]], () => {
    EM.getResource(HSGameStateDef).state = HyperspaceGameState.PLAYING;
}, {
    legalEvent: () => EM.getResource(HSGameStateDef).state === HyperspaceGameState.LOBBY,
});
export const endGame = eventWizard("end-game", () => [[HsShipPropsDef, HsShipLocalDef, PositionDef]], ([ship]) => {
    console.log("end");
    const res = EM.getResources([AudioDef, HSGameStateDef, MeDef]);
    res.music.playChords([1, 2, 3, 4, 4], "minor");
    res.hsGameState.state = HyperspaceGameState.GAMEOVER;
    res.hsGameState.time = 0;
    for (const partRef of ship.hsShipLocal.parts) {
        const part = partRef();
        if (part)
            EM.set(part, DeletedDef);
    }
    EM.set(ship, DeletedDef);
    if (ship.hsShipProps.cannonLId)
        EM.ensureComponent(ship.hsShipProps.cannonLId, DeletedDef);
    if (ship.hsShipProps.cannonRId)
        EM.ensureComponent(ship.hsShipProps.cannonRId, DeletedDef);
    const players = EM.filterEntities_uncached([
        HsPlayerDef,
        CanManDef,
        PositionDef,
        RotationDef,
        AuthorityDef,
        PhysicsParentDef,
        WorldFrameDef,
    ]);
    for (let p of players) {
        p.canMan.manning = false;
        if (p.authority.pid === res.me.pid) {
            p.physicsParent.id = 0;
            V3.copy(p.position, p.world.position);
            quat.copy(p.rotation, p.world.rotation);
        }
    }
    const gem = EM.findEntity(ship.hsShipProps.gemId, [
        WorldFrameDef,
        PositionDef,
        PhysicsParentDef,
    ]);
    V3.copy(gem.position, gem.world.position);
    EM.set(gem, RotationDef);
    quat.copy(gem.rotation, gem.world.rotation);
    EM.set(gem, LinearVelocityDef, V(0, 0.01, 0));
    EM.removeComponent(gem.id, PhysicsParentDef);
    EM.set(gem, LifetimeDef, 4000);
}, {
    legalEvent: () => EM.getResource(HSGameStateDef).state === HyperspaceGameState.PLAYING,
});
export const restartGame = eventWizard("restart-game", () => [[HsShipPropsDef]], ([ship]) => {
    console.log("restart");
    const res = EM.getResources([HSGameStateDef, LocalPlayerEntityDef]);
    res.hsGameState.state = HyperspaceGameState.LOBBY;
    const player = EM.findEntity(res.localPlayerEnt.playerId, [HsPlayerDef]);
    player.hsPlayer.lookingForShip = true;
    // res.score.currentScore = 0;
    // const groundSys = EM.getResource(GroundSystemDef);
    // if (groundSys) {
    //   groundSys.needsInit = true;
    // }
}, {
    legalEvent: () => EM.getResource(HSGameStateDef).state === HyperspaceGameState.GAMEOVER,
});
export function registerGameStateSystems() {
    EM.addSystem("restartTimer", Phase.GAME_WORLD, null, [HSGameStateDef, TimeDef, HostDef], ([], res) => {
        if (res.hsGameState.state === HyperspaceGameState.GAMEOVER) {
            res.hsGameState.time += res.time.dt;
            if (res.hsGameState.time > RESTART_TIME_MS) {
                // Do we have a ship to restart onto yet?
                const ship = EM.filterEntities_uncached([
                    HsShipPropsDef,
                    HsShipLocalDef,
                ])[0];
                if (ship) {
                    restartGame(ship);
                }
                else {
                    createHsShip();
                }
            }
        }
    });
}
//# sourceMappingURL=hyperspace-gamestate.js.map