import { V, mat3, orthonormalize, quat, V3 } from "../matrix/sprig-matrix.js";
import { PI, PIn2 } from "./util-no-import.js";
import { assert } from "./util.js";
import { quatDbg, vec3Dbg } from "./utils-3d.js";
// functions
export function sum(ns) {
    return ns.reduce((p, n) => p + n, 0);
}
export function max(ns) {
    return ns.reduce((p, n) => (p > n ? p : n), -Infinity);
}
export function avg(ns) {
    return sum(ns) / ns.length;
}
export function clamp(n, min, max) {
    return Math.max(Math.min(n, max), min);
}
export function wrap(n, min, max) {
    // TODO(@darzu): use while instead?
    if (n < min)
        n += max - min;
    if (max < n)
        n -= max - min;
    return n;
}
export function min(ns) {
    return ns.reduce((p, n) => (p < n ? p : n), Infinity);
}
export function even(n) {
    return n % 2 == 0;
}
// TODO(@darzu): useful? idea from freya
// TODO(@darzu): extend number's prototype?
export function atLeast(val, min) {
    return Math.max(val, min);
}
export function atMost(val, max) {
    return Math.min(val, max);
}
export const radToDeg = 180 / Math.PI;
// TODO(@darzu): MOVE all random stuff into rand.ts; reconcile with the pseudo random generators
export function jitter(radius) {
    return (Math.random() - 0.5) * radius * 2;
}
// inclusive of min, inclusive of max
export function randInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}
export function randRadian(min = 0, max = Math.PI * 2.0) {
    return Math.random() * (max - min) + min;
}
export function align(x, size) {
    return Math.ceil(x / size) * size;
}
export function alignDown(x, size) {
    return Math.floor(x / size) * size;
}
export function chance(zeroToOne = 0.5) {
    return Math.random() < zeroToOne;
}
export function randBool() {
    return chance(0.5);
}
// maps a number from [inMin, inMax] to [outMin, outMax]
export function remap(n, inMin, inMax, outMin, outMax) {
    // TODO(@darzu): actually, this works even if inMin > inMax, and/or outMin > outMax. idk why
    // assert(inMin < inMax, "must be: inMin < inMax");
    // assert(outMin <= outMax, "must be: outMin <= outMax");
    // assert(inMin <= n && n <= inMax, "must be: inMin <= n && n <= inMax");
    const progress = unlerp(inMin, inMax, n);
    return lerp(outMin, outMax, progress);
}
export function remapEase(n, inMin, inMax, outMin, outMax, easeFn) {
    assert(inMin < inMax, "must be: inMin < inMax");
    assert(outMin <= outMax, "must be: outMin <= outMax");
    n = Math.max(n, inMin);
    n = Math.min(n, inMax);
    let progress = unlerp(inMin, inMax, n);
    if (easeFn)
        progress = easeFn(progress);
    return lerp(outMin, outMax, progress);
}
// returns [a,b,c] from y = a*x^2 + b*x + c
// given [x0, y0], [x1, y1], [x2, y2]
export function parabolaFromPoints(x0, y0, x1, y1, x2, y2) {
    const inv = mat3.invert([
        // column 1
        x0 ** 2,
        x1 ** 2,
        x2 ** 2,
        // column 2
        x0,
        x1,
        x2,
        // column 3
        1,
        1,
        1,
    ]);
    const abc = V3.tMat3([y0, y1, y2], inv, V3.mk());
    return abc;
    // // parabola test:
    // // y = x**2 + 1 from [0,1], [-2, 5], [1,2]
    // console.log(`parabolaFromPoints test: `);
    // console.log(vec3Dbg(parabolaFromPoints(0, 1, -2, 5, 1, 2)));
    // // y = 1.2x**2 -1x+ 2.3
    // console.log(
    //   vec3Dbg(parabolaFromPoints(1, 2.5, -0.48, 3.056, 3, 10.1))
    // );
}
export function sphereRadiusFromVolume(v) {
    return Math.pow(((3 / 4) * v) / Math.PI, 1 / 3);
}
export function sphereVolumeFromRadius(r) {
    return (4 / 3) * Math.PI * Math.pow(r, 3);
}
export function lerp(a, b, t) {
    return (1.0 - t) * a + t * b;
}
export function unlerp(min, max, val) {
    return (val - min) / (max - min);
}
// enable w/ RUN_UNIT_TESTS
export function testMath() {
    const fwd = V(0, 1, 0);
    const upish = V(0.2, 0.2, 1.0);
    // const right = V(0, 0, 0);
    const right = new Float32Array([0, 0, 0]);
    // console.log("orthonormalize:");
    // console.log(`fwd: ${vec3Dbg(fwd)}`);
    // console.log(`up: ${vec3Dbg(upish)}`);
    // console.log(`right: ${vec3Dbg(right)}`);
    // console.log("->");
    orthonormalize(fwd, upish, right);
    // console.log(`fwd: ${vec3Dbg(fwd)}`);
    // console.log(`up: ${vec3Dbg(upish)}`);
    // console.log(`right: ${vec3Dbg(right)}`);
    assert(V3.dist(right, [1, 0, 0]) < 0.3, "orthonormalize test");
    // test quat.fromForward
    {
        const vs = [
            V(0, 3, 0),
            V(3, 3, 0),
            V(0, 3, 3),
            V(0, 0, 3),
            V(3, 3, 3),
            V(0, 0, -3),
            V(-3, -3, 3),
            V(0, -3, 0),
            V(0, 0.3, 0),
            V(0.3, 0, 0),
        ];
        console.log("test quat.fromForward");
        const fwd = V(0, 1, 0);
        for (let v of vs) {
            const rot = quat.fromForward(v);
            const v2 = V3.tQuat(fwd, rot, V3.mk());
            console.log(`${vec3Dbg(v)} ==${quatDbg(rot)}==> ${vec3Dbg(v2)}`);
        }
    }
    // understand atan2
    // output is -PI to PI
    // positive when +Y, negative when -Y
    if (true) {
        const dir = V(1, 0, 0);
        const steps = 10;
        const stepRad = (Math.PI * 2) / steps;
        for (let i = 0; i < steps; i++) {
            V3.rotZ(dir, [0, 0, 0], stepRad, dir);
            const angle = Math.atan2(dir[1], dir[0]);
            console.log(`dir: ${vec3Dbg(dir)}, atan2: ${angle}`);
        }
    }
}
export function normAngle(a) {
    return ((a % PIn2) + PIn2) % PIn2;
}
export function angularDiff(a, b, large = false) {
    a = normAngle(a);
    b = normAngle(b);
    const d = normAngle(a - b);
    const isLarge = d > PI;
    if (isLarge !== large)
        return d - PIn2;
    return d;
}
export function testAngularDiff() {
    console.log("normAngle");
    console.log("normAngle(0.1) = " + normAngle(0.1));
    console.log("normAngle(-0.1) = " + normAngle(-0.1));
    console.log("normAngle(0.1- -0.1) = " + normAngle(0.1 + 0.1));
    console.log("normAngle(-0.1 - 0.1) = " + normAngle(-0.1 - 0.1));
    const ab = [
        { a: 0.2, b: 0.2, large: false, t: 0.0 },
        { a: 0.2, b: -0.3, large: false, t: 0.5 },
        { a: 0.2, b: PIn2 - 0.3, large: false, t: 0.5 },
        { a: -0.2, b: 0.3, large: false, t: -0.5 },
        { a: PIn2 - 0.2, b: 0.3, large: false, t: -0.5 },
        { a: 0.1, b: 0.11, large: true, t: PIn2 - 0.01 },
        { a: 0.1, b: 0.09, large: true, t: 0.01 - PIn2 },
        { a: 0.1, b: -0.1, large: true, t: 0.2 - PIn2 },
        { a: 0.1, b: PIn2 - 0.1, large: true, t: 0.2 - PIn2 },
        { a: -0.1, b: 0.1, large: true, t: -0.2 + PIn2 },
        { a: PIn2 - 0.1, b: 0.1, large: true, t: -0.2 + PIn2 },
    ];
    console.log("testAngularDiff");
    let pass = true;
    for (let { a, b, large, t } of ab) {
        const r = angularDiff(a, b, large);
        const eq = Math.abs(r - t) < 0.01;
        pass &&= eq;
        console.log(`angularDiff(${a}, ${b}, ${large}) -> ${r} ${eq ? "~=" : "!="} ${t}; b+r=${b + r} vs ${a}`);
    }
    console.log(pass ? "PASS" : "FAIL!");
}
// testAngularDiff();
//# sourceMappingURL=math.js.map