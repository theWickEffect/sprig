import { EM } from "../ecs/ecs.js";
import { PredictDef } from "./components.js";
import { V3, quat } from "../matrix/sprig-matrix.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import { Phase } from "../ecs/sys-phase.js";
export function initNetPredictSystems() {
    EM.addSystem("netPredict", Phase.NETWORK, [PredictDef, PositionDef, LinearVelocityDef], [], (entities) => {
        for (let entity of entities) {
            if (entity.predict.dt > 0) {
                // TODO: non-ballistic prediction?
                let deltaV = V3.scale(entity.linearVelocity, entity.predict.dt);
                V3.add(entity.position, deltaV, entity.position);
                if (AngularVelocityDef.isOn(entity) && RotationDef.isOn(entity)) {
                    let normalizedVelocity = V3.norm(entity.angularVelocity);
                    let angle = V3.len(entity.angularVelocity) * entity.predict.dt;
                    let deltaRotation = quat.setAxisAngle(normalizedVelocity, angle);
                    quat.normalize(deltaRotation, deltaRotation);
                    // note--quat multiplication is not commutative, need to multiply on the left
                    // note--quat multiplication is not commutative, need to multiply on the left
                    quat.mul(deltaRotation, entity.rotation, entity.rotation);
                }
            }
            entity.predict.dt = 0;
        }
    });
}
//# sourceMappingURL=predict.js.map