import { clamp } from "../utils/math.js";
import { V, V3 } from "../matrix/sprig-matrix.js";
import { range } from "../utils/util.js";
import { vec3Dbg2 } from "../utils/utils-3d.js";
const TRACK_AABB = true;
export function __resetAABBDbgCounters() {
    _doesOverlapAABBs = 0;
    _enclosedBys = 0;
}
export let _doesOverlapAABBs = 0;
export function doesOverlapAABB(a, b) {
    if (TRACK_AABB)
        _doesOverlapAABBs++;
    // TODO(@darzu): less then or less then and equal?
    return (b.min[0] < a.max[0] &&
        b.min[1] < a.max[1] &&
        b.min[2] < a.max[2] &&
        a.min[0] < b.max[0] &&
        a.min[1] < b.max[1] &&
        a.min[2] < b.max[2]);
}
export let _enclosedBys = 0;
export function enclosedBy(inner, outer) {
    if (TRACK_AABB)
        _enclosedBys++;
    return (inner.max[0] < outer.max[0] &&
        inner.max[1] < outer.max[1] &&
        inner.max[2] < outer.max[2] &&
        outer.min[0] < inner.min[0] &&
        outer.min[1] < inner.min[1] &&
        outer.min[2] < inner.min[2]);
}
export function doesTouchAABB(a, b, threshold) {
    if (TRACK_AABB)
        _doesOverlapAABBs++;
    return (b.min[0] < a.max[0] + threshold &&
        b.min[1] < a.max[1] + threshold &&
        b.min[2] < a.max[2] + threshold &&
        a.min[0] < b.max[0] + threshold &&
        a.min[1] < b.max[1] + threshold &&
        a.min[2] < b.max[2] + threshold);
}
export function createAABB(min, max) {
    return {
        min: min ?? V(Infinity, Infinity, Infinity),
        max: max ?? V(-Infinity, -Infinity, -Infinity),
    };
}
export function createAABB2(min, max) {
    return {
        min: min ?? V(Infinity, Infinity),
        max: max ?? V(-Infinity, -Infinity),
    };
}
export function copyAABB(out, a) {
    V3.copy(out.min, a.min);
    V3.copy(out.max, a.max);
    return out;
}
export function clampToAABB(v, aabb, out) {
    out = out ?? V3.tmp();
    out[0] = clamp(v[0], aabb.min[0], aabb.max[0]);
    out[1] = clamp(v[1], aabb.min[1], aabb.max[1]);
    out[2] = clamp(v[2], aabb.min[2], aabb.max[2]);
    return out;
}
export function pointInAABB(aabb, p) {
    return (aabb.min[0] < p[0] &&
        aabb.min[1] < p[1] &&
        aabb.min[2] < p[2] &&
        p[0] < aabb.max[0] &&
        p[1] < aabb.max[1] &&
        p[2] < aabb.max[2]);
}
// TODO(@darzu): too much alloc
// export function getAABBCorners(aabb: AABB): V3[] {
//   const points: V3[] = [
//     V(aabb.max[0], aabb.max[1], aabb.max[2]),
//     V(aabb.max[0], aabb.max[1], aabb.min[2]),
//     V(aabb.max[0], aabb.min[1], aabb.max[2]),
//     V(aabb.max[0], aabb.min[1], aabb.min[2]),
//     V(aabb.min[0], aabb.max[1], aabb.max[2]),
//     V(aabb.min[0], aabb.max[1], aabb.min[2]),
//     V(aabb.min[0], aabb.min[1], aabb.max[2]),
//     V(aabb.min[0], aabb.min[1], aabb.min[2]),
//   ];
//   return points;
// }
const _tempAabbCorners = range(8).map((_) => V3.mk());
export function getAABBCornersTemp(aabb) {
    V3.set(aabb.max[0], aabb.max[1], aabb.max[2], _tempAabbCorners[0]);
    V3.set(aabb.max[0], aabb.max[1], aabb.min[2], _tempAabbCorners[1]);
    V3.set(aabb.max[0], aabb.min[1], aabb.max[2], _tempAabbCorners[2]);
    V3.set(aabb.max[0], aabb.min[1], aabb.min[2], _tempAabbCorners[3]);
    V3.set(aabb.min[0], aabb.max[1], aabb.max[2], _tempAabbCorners[4]);
    V3.set(aabb.min[0], aabb.max[1], aabb.min[2], _tempAabbCorners[5]);
    V3.set(aabb.min[0], aabb.min[1], aabb.max[2], _tempAabbCorners[6]);
    V3.set(aabb.min[0], aabb.min[1], aabb.min[2], _tempAabbCorners[7]);
    return _tempAabbCorners;
}
// const tempAabbXZCorners = range(4).map((_) => V2.create()) as [
//   vec2,
//   vec2,
//   vec2,
//   vec2
// ];
// export function getAabbXZCornersTemp(aabb: AABB): [vec2, vec2, vec2, vec2] {
//   V2.set(aabb.max[0], aabb.max[2], tempAabbXZCorners[0]);
//   V2.set(aabb.max[0], aabb.min[2], tempAabbXZCorners[1]);
//   V2.set(aabb.min[0], aabb.max[2], tempAabbXZCorners[2]);
//   V2.set(aabb.min[0], aabb.min[2], tempAabbXZCorners[3]);
//   return tempAabbXZCorners;
// }
export function transformAABB(out, t) {
    // TODO(@darzu): PERF. is there a more performant way to do this?
    const wCorners = getAABBCornersTemp(out);
    wCorners.forEach((p) => V3.tMat4(p, t, p));
    getAABBFromPositions(out, wCorners);
    return out;
}
export function aabbCenter(out, a) {
    out[0] = (a.min[0] + a.max[0]) * 0.5;
    out[1] = (a.min[1] + a.max[1]) * 0.5;
    out[2] = (a.min[2] + a.max[2]) * 0.5;
    return out;
}
export function updateAABBWithPoint(aabb, pos) {
    return updateAABBWithPoint_(aabb, pos[0], pos[1], pos[2]);
}
export function updateAABBWithPoint_(aabb, x, y, z) {
    aabb.min[0] = Math.min(x, aabb.min[0]);
    aabb.min[1] = Math.min(y, aabb.min[1]);
    aabb.min[2] = Math.min(z, aabb.min[2]);
    aabb.max[0] = Math.max(x, aabb.max[0]);
    aabb.max[1] = Math.max(y, aabb.max[1]);
    aabb.max[2] = Math.max(z, aabb.max[2]);
    return aabb;
}
export function mergeAABBs(out, a, b) {
    out.min[0] = Math.min(a.min[0], b.min[0]);
    out.min[1] = Math.min(a.min[1], b.min[1]);
    out.min[2] = Math.min(a.min[2], b.min[2]);
    out.max[0] = Math.max(a.max[0], b.max[0]);
    out.max[1] = Math.max(a.max[1], b.max[1]);
    out.max[2] = Math.max(a.max[2], b.max[2]);
    return out;
}
export function getAABBFromPositions(out, positions) {
    V3.set(Infinity, Infinity, Infinity, out.min);
    V3.set(-Infinity, -Infinity, -Infinity, out.max);
    for (let pos of positions) {
        updateAABBWithPoint(out, pos);
    }
    return out;
}
export function updateAABBWithPoint2(aabb, pos) {
    return updateAABBWithPoint2_(aabb, pos[0], pos[1]);
}
export function updateAABBWithPoint2_(aabb, x, y) {
    aabb.min[0] = Math.min(x, aabb.min[0]);
    aabb.min[1] = Math.min(y, aabb.min[1]);
    aabb.max[0] = Math.max(x, aabb.max[0]);
    aabb.max[1] = Math.max(y, aabb.max[1]);
    return aabb;
}
export function aabbCenter2(out, a) {
    out[0] = (a.min[0] + a.max[0]) * 0.5;
    out[1] = (a.min[1] + a.max[1]) * 0.5;
    return out;
}
// TODO(@darzu): MOVE to gl-matrix
export function getCenterFromAABB(aabb, out) {
    return V3.mid(aabb.min, aabb.max, out);
}
export function getSizeFromAABB(aabb, out) {
    out = out ?? V3.tmp();
    out[0] = aabb.max[0] - aabb.min[0];
    out[1] = aabb.max[1] - aabb.min[1];
    out[2] = aabb.max[2] - aabb.min[2];
    return out;
}
export function getHalfsizeFromAABB(aabb, out) {
    out = out ?? V3.tmp();
    out[0] = (aabb.max[0] - aabb.min[0]) * 0.5;
    out[1] = (aabb.max[1] - aabb.min[1]) * 0.5;
    out[2] = (aabb.max[2] - aabb.min[2]) * 0.5;
    return out;
}
export function aabbListToStr(aabbs) {
    let resStr = "";
    resStr += `const aabbs: AABB[] = [`;
    for (let aabb of aabbs) {
        resStr += `{min: ${vec3Dbg2(aabb.min)}, max: ${vec3Dbg2(aabb.max)}},`;
    }
    resStr += `];`;
    return resStr;
}
export function isValidVec3(v) {
    return (!isNaN(v[0]) &&
        isFinite(v[0]) &&
        !isNaN(v[1]) &&
        isFinite(v[1]) &&
        !isNaN(v[2]) &&
        isFinite(v[2]));
}
export function isValidAABB(aabb) {
    const validBounds = aabb.min[0] <= aabb.max[0] &&
        aabb.min[1] <= aabb.max[1] &&
        aabb.min[2] <= aabb.max[2];
    const validNums = isValidVec3(aabb.min) && isValidVec3(aabb.max);
    return validBounds && validNums;
}
//# sourceMappingURL=aabb.js.map