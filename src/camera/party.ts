import { EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";

export const PartyDef = EM.defineResource("party", () => ({
  pos: vec3.create(),
  dir: vec3.create(),
}));

EM.addLazyInit([], [PartyDef], () => {
  EM.addResource(PartyDef);
});