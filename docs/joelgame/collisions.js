import { V3 } from "../matrix/sprig-matrix.js";
import { J3 } from "./joel-game.js";
export function checkForCollision(start, end, object, marginOfError) {
    const t = -1 * V3.dot(J3.sub(start, object, true), J3.sub(end, start, true)) / Math.pow(J3.len(J3.sub(end, start, true)), 2);
    if (t < 0 || t > 1.3)
        return false;
    const pointOnLineAtT = J3.add(start, J3.scale(J3.sub(end, start), t));
    const distFromLine = J3.dist(pointOnLineAtT, object);
    return distFromLine <= marginOfError;
}
//# sourceMappingURL=collisions.js.map