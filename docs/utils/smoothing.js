import { V3, quat } from "../matrix/sprig-matrix.js";
const ERROR_SMOOTHING_FACTOR = 0.9 ** (60 / 1000);
const EPSILON = 0.0001;
const QUAT_EPSILON = 0.001;
const identityQuat = quat.identity(quat.mk());
function isVec3(v) {
    return v.length === 3;
}
export function reduceError(v, dt, smoothing_factor = ERROR_SMOOTHING_FACTOR) {
    if (isVec3(v)) {
        const magnitude = V3.len(v);
        if (magnitude > EPSILON) {
            V3.scale(v, smoothing_factor ** dt, v);
        }
        else if (magnitude > 0) {
            V3.set(0, 0, 0, v);
        }
    }
    else {
        const magnitude = Math.abs(quat.getAngle(v, identityQuat));
        if (magnitude > QUAT_EPSILON) {
            quat.slerp(v, identityQuat, 1 - smoothing_factor ** dt, v);
            quat.normalize(v, v);
        }
        else if (magnitude > 0) {
            quat.copy(v, identityQuat);
        }
    }
}
export function computeNewError(old, curr, error) {
    if (isVec3(old)) {
        V3.add(error, old, error);
        V3.sub(error, curr, error);
    }
    else {
        const prevComputed = quat.mul(old, error);
        quat.invert(curr, error);
        quat.mul(error, prevComputed, prevComputed);
        quat.copy(error, prevComputed);
        quat.normalize(error, error);
    }
}
//# sourceMappingURL=smoothing.js.map