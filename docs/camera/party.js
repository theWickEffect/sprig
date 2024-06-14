import { EM } from "../ecs/ecs.js";
import { V3 } from "../matrix/sprig-matrix.js";
import { OBB } from "../physics/obb.js";
export const PartyDef = EM.defineResource("party", () => ({
    obb: OBB.mk(),
    pos: V3.mk(),
    dir: V3.mk(),
}));
EM.addLazyInit([], [PartyDef], () => {
    EM.addResource(PartyDef);
});
//# sourceMappingURL=party.js.map