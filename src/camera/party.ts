import { EM } from "../ecs/ecs.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { OBB } from "../physics/obb.js";

export const PartyDef = EM.defineResource("party", () => ({
  obb: OBB.mk(),
  pos: V3.mk(),
  dir: V3.mk(),
}));

EM.addLazyInit([], [PartyDef], () => {
  EM.addResource(PartyDef);
});
