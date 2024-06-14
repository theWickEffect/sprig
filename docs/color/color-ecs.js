import { EM } from "../ecs/ecs.js";
import { V3, V } from "../matrix/sprig-matrix.js";
export const ColorDef = EM.defineComponent("color", () => V(0, 0, 0), (p, c) => (c ? V3.copy(p, c) : p));
EM.registerSerializerPair(ColorDef, (o, writer) => {
    writer.writeVec3(o);
}, (o, reader) => {
    reader.readVec3(o);
});
export const TintsDef = EM.defineComponent("tints", () => new Map());
export function applyTints(tints, tint) {
    tints.forEach((c) => V3.add(tint, c, tint));
}
export function setTint(tints, name, tint) {
    let current = tints.get(name);
    if (!current) {
        current = V3.mk();
        tints.set(name, current);
    }
    V3.copy(current, tint);
}
export function clearTint(tints, name) {
    let current = tints.get(name);
    if (current) {
        V3.set(0, 0, 0, current);
    }
}
export const AlphaDef = EM.defineComponent("alpha", () => 1.0, (p, c) => c ?? p);
//# sourceMappingURL=color-ecs.js.map