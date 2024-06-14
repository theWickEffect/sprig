import { DBG_TMP_LEAK, DBG_TMP_STACK_MATCH, PERF_DBG_F32S, PERF_DBG_F32S_BLAME, PERF_DBG_F32S_TEMP_BLAME, } from "../flags.js";
import { assert, dbgAddBlame, dbgClearBlame } from "../utils/util-no-import.js";
import * as GLM from "./gl-matrix.js";
/*
Note on notation:
[1, 0, 0, 0,
 0, 1, 0, 0,
 0, 0, 1, 0,
 tx, ty, tz, 0]
 tx,ty,tz = translate x,y,z
*/
const EPSILON = 0.000001;
// TODO(@darzu): All cases of:
//    vec*.clone([...])
//  should be
//    vec*.fromValues(...)
//  or something simpler (v3(), vc3(), ...)
// TODO(@darzu): CONSIDER "forever", "readonly", and literals with something like:
/*
interface ReadonlyFloat32ArrayOfLength<N extends number>
  extends Omit<
    Float32ArrayOfLength<N>,
    "copyWithin" | "fill" | "reverse" | "set" | "sort"
  > {
  readonly [n: number]: number;
}

declare const _forever: unique symbol;

// a vec3 "forever", means it isn't temp
export type vec3f =
  | [number, number, number]
  | (Float32ArrayOfLength<3> & { [_forever]: true });
// a vec3 "readonly", means the vec won't be modified through that alias
export type vec3r =
  | readonly [number, number, number]
  | ReadonlyFloat32ArrayOfLength<3>;
// a vec3 is either forever or temp, but it can't be
export type vec3 = vec3f | Float32ArrayOfLength<3>;

let eg_vec3f: vec3f = [0, 0, 0] as vec3f;
let eg_vec3r: vec3r = [0, 0, 0] as vec3r;
let eg_vec3: V3 = vec3.create() as V3;

// eg_vec3 = eg_vec3r; // illegal (weakens "readonly")
// eg_vec3 = eg_vec3f; // legal (unspecified if its temp or forever)
// eg_vec3r = eg_vec3; // legal (strengthens alias promise)
// eg_vec3r = eg_vec3f; // legal (strengthens alias promise)
// eg_vec3f = eg_vec3; // illegal (could be temp)
// eg_vec3f = eg_vec3r; // illegal (could be temp)
// eg_vec3fr = eg_vec3; // illegal (could be temp)
// eg_vec3fr = eg_vec3f; // legal (strengthening w/ readonly promise)
// eg_vec3fr = eg_vec3r; // illegal (could be temp)

Should be able to overload vec3.add like so:
vec3.add(a: T, b: T): tT;
vec3.add<OT extends T | tT>(a: T, b: T, out: OT): OT;
so if given an out, it'll be that type, otherwise it'll be a temp
*/
export let _f32sCount = 0; // TODO(@darzu): PERF DBG!
// TODO(@darzu): perhaps all non-temp (and temp) vecs should be suballocations on bigger Float32Arrays
//    this might give some perf wins w/ cache hits
function float32ArrayOfLength(n) {
    if (PERF_DBG_F32S)
        _f32sCount += n; // TODO(@darzu): PERF. very inner-loop. does this have a perf cost even when the flag is disabled?
    // console.log(new Error().stack!);
    if (PERF_DBG_F32S_BLAME) {
        dbgAddBlame("f32s", n);
    }
    return new Float32Array(n);
}
let _tmpResetGen = 1;
let _tmpGenHints = ["<zero>", "<one>"];
function mkTmpProxyHandler(gen) {
    const err = () => {
        throw new Error(`Leak! Using tmp from gen ${gen} "${_tmpGenHints[gen]}" in gen ${_tmpResetGen} "${_tmpGenHints[_tmpResetGen]}"`);
    };
    const tmpProxyHandler = {
        get: (v, prop) => {
            if (gen !== _tmpResetGen)
                err();
            // TODO(@darzu): huh is TS's ProxyHandler typing wrong? cus this seems to work?
            return v[prop];
        },
        set: (v, prop, val) => {
            if (gen !== _tmpResetGen)
                err();
            v[prop] = val;
            return true;
        },
    };
    return tmpProxyHandler;
}
let _tmpProxyHandler = mkTmpProxyHandler(_tmpResetGen);
//was 8000;
const BUFFER_SIZE = 8000;
const buffer = new ArrayBuffer(BUFFER_SIZE);
let bufferIndex = 0;
function tmpArray(n) {
    if (bufferIndex + n * Float32Array.BYTES_PER_ELEMENT > BUFFER_SIZE) {
        if (PERF_DBG_F32S_TEMP_BLAME) {
            if (window.dbg) {
                // TODO(@darzu): HACK debugging
                window.dbg.tempf32sBlame();
            }
        }
        throw `Too many temp Float32Arrays allocated! Use PERF_DBG_F32S_TEMP_BLAME to find culprit. Or if you must, try increasing BUFFER_SIZE (currently ${(Float32Array.BYTES_PER_ELEMENT * BUFFER_SIZE) / 1024}kb)`;
    }
    // TODO(@darzu): For blame, have a mode that exludes stack mark n' pop'ed!
    if (PERF_DBG_F32S_TEMP_BLAME) {
        dbgAddBlame("temp_f32s", n);
    }
    const arr = new Float32Array(buffer, bufferIndex, n);
    bufferIndex += arr.byteLength;
    if (DBG_TMP_LEAK) {
        const prox = new Proxy(arr, _tmpProxyHandler);
        return prox;
    }
    return arr;
}
export function resetTempMatrixBuffer(hint) {
    if (_tmpMarkStack.length)
        throw `mismatched tmpMark & tmpPop! ${_tmpMarkStack.length} unpopped`;
    bufferIndex = 0;
    if (DBG_TMP_LEAK) {
        _tmpResetGen += 1;
        if (_tmpGenHints.length < 1000)
            _tmpGenHints[_tmpResetGen] = hint;
        _tmpProxyHandler = mkTmpProxyHandler(_tmpResetGen);
    }
    if (PERF_DBG_F32S_TEMP_BLAME) {
        dbgClearBlame("temp_f32s");
    }
}
// TODO(@darzu): can i track leaking temps?
/*
  mark all temps w/ a generation
  wrap all temps w/ a proxy?
  if a temp is used, check the current generation
  if generation mismatch, throw error

  can we track all usage?
*/
// TODO(@darzu): have a version of PERF_DBG_F32S_TEMP_BLAME that tracks blame on unmarked/popped!
// TODO(@darzu): is there some dbg way we could track to see if any tmps are used after free? maybe a generation tracker?
//                conceivably w/ WeakRef? Maybe w/ FinalizationRegistry?
//                  if i do a mark and then the scoped obj is collected before a pop happens, we know we have a missing pop
// TODO(@darzu): eventually we'll get scoped using statements in JS which will make this hideous mess a little better?
// TODO(@darzu): should these be called for every system and every init?
const _tmpMarkStack = [];
const _tmpMarkIdStack = [];
let _tmpStackNextId = 1;
const _cheapPop = { pop: tmpPop, popAndRemark: tmpPopAndRemark };
// const _tmpStackFinReg: FinalizationRegistry<null> | undefined =
//   DBG_TMP_STACK_MATCH
//     ? new FinalizationRegistry(tmpStackFinHandler)
//     : undefined;
export function tmpStack() {
    if (!DBG_TMP_STACK_MATCH) {
        tmpMark();
        return _cheapPop;
    }
    _tmpStackNextId += 1;
    const id = _tmpStackNextId;
    _tmpMarkStack.push(bufferIndex);
    _tmpMarkIdStack.push(id);
    const res = { pop, popAndRemark };
    // assert(_tmpStackFinReg);
    // _tmpStackFinReg.register(res, null);
    function pop() {
        if (_tmpMarkStack.length === 0)
            throw "tmpStack.pop with zero size stack!";
        const popId = _tmpMarkIdStack.pop();
        if (popId !== id)
            throw "tmpStack pop mismatch! Did a stack cross async boundries?";
        bufferIndex = _tmpMarkStack.pop();
    }
    function popAndRemark() {
        if (_tmpMarkStack.length === 0)
            throw "tmpStack.pop with zero size stack!";
        const popId = _tmpMarkIdStack[_tmpMarkIdStack.length - 1];
        if (popId !== id)
            throw "tmpStack pop mismatch! Did a stack cross async boundries?";
        bufferIndex = _tmpMarkStack[_tmpMarkStack.length - 1];
    }
    return res;
}
// function tmpStackFinHandler() {
// }
function tmpMark() {
    _tmpMarkStack.push(bufferIndex);
}
function tmpPop() {
    if (_tmpMarkStack.length === 0)
        throw "tmpPop with zero size stack!";
    bufferIndex = _tmpMarkStack.pop();
}
function tmpPopAndRemark() {
    if (_tmpMarkStack.length === 0)
        throw "tmpPop with zero size stack!";
    bufferIndex = _tmpMarkStack[_tmpMarkStack.length - 1];
}
export function isTmpVec(v) {
    return v.buffer === buffer;
}
// TODO(@darzu): generalize and put in util.ts?
export function findAnyTmpVec(obj, maxDepth = 100, path = "") {
    if (maxDepth <= 0) {
        return null;
    }
    else if (!obj) {
        return null;
    }
    else if (obj instanceof Float32Array) {
        return isTmpVec(obj) ? path : null;
    }
    else if (obj instanceof Array) {
        return obj.reduce((p, n, i) => p ? p : findAnyTmpVec(n, maxDepth - 1, `${path}[${i}]`), null);
    }
    else if (obj instanceof Map) {
        for (let [k, v] of obj.entries()) {
            const found = findAnyTmpVec(v, maxDepth - 1, `${path}.get(${k})`);
            if (found)
                return found;
        }
        return null;
    }
    // NOTE: primatives (string, bool, number) and functions all return empty list for Object.keys
    return Object.keys(obj).reduce((p, n, i) => p ? p : findAnyTmpVec(obj[n], maxDepth - 1, `${path}.${n}`), null);
}
export function cloneTmpsInObj(obj, maxDepth = 100) {
    if (maxDepth <= 0) {
        throw `Object too deep or rescursive!`;
    }
    else if (!obj) {
        return obj;
    }
    else if (obj instanceof Float32Array) {
        if (isTmpVec(obj)) {
            const n = float32ArrayOfLength(obj.length);
            n.forEach((_, i) => (n[i] = obj[i]));
            return n;
        }
        return obj;
    }
    else if (obj instanceof Array) {
        return obj.map((v) => cloneTmpsInObj(v, maxDepth - 1));
    }
    else if (obj instanceof Map) {
        const res = new Map();
        for (let [k, v] of obj.entries()) {
            const v2 = cloneTmpsInObj(v, maxDepth - 1);
            res.set(k, v2);
        }
        return res;
    }
    else if (typeof obj === "object") {
        const res = { ...obj };
        for (let k of Object.keys(res)) {
            const v2 = cloneTmpsInObj(obj[k], maxDepth - 1);
            res[k] = v2;
        }
        return res;
    }
    else {
        return obj;
    }
}
export function V(...xs) {
    if (xs.length === 3)
        return V3.fromValues(xs[0], xs[1], xs[2]);
    else if (xs.length === 4)
        return V4.fromValues(xs[0], xs[1], xs[2], xs[3]);
    else if (xs.length === 2)
        return V2.fromValues(xs[0], xs[1]);
    else
        throw new Error(`Unsupported vec size: ${xs.length}`);
}
export function tV(...xs) {
    if (xs.length === 4)
        return V4.set(xs[0], xs[1], xs[2], xs[3]);
    else if (xs.length === 3)
        return V3.set(xs[0], xs[1], xs[2]);
    else if (xs.length === 2)
        return V2.set(xs[0], xs[1]);
    else
        throw new Error(`Unsupported vec size: ${xs.length}`);
}
export var V2;
(function (V2) {
    const GL = GLM.vec2;
    function tmp() {
        return tmpArray(2);
    }
    V2.tmp = tmp;
    function mk() {
        return float32ArrayOfLength(2);
    }
    V2.mk = mk;
    function clone(v) {
        return GL.clone(v);
    }
    V2.clone = clone;
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    V2.copy = copy;
    function zero(out) {
        return GL.zero(out ?? tmp());
    }
    V2.zero = zero;
    function set(n0, n1, out) {
        out = out ?? tmp();
        out[0] = n0;
        out[1] = n1;
        return out;
    }
    V2.set = set;
    function fromValues(n0, n1) {
        const out = mk();
        out[0] = n0;
        out[1] = n1;
        return out;
    }
    V2.fromValues = fromValues;
    function lerp(v1, v2, n, out) {
        return GL.lerp(out ?? tmp(), v1, v2, n);
    }
    V2.lerp = lerp;
    // NOTE: output is normalized
    function fromRadians(radians, out) {
        return set(Math.cos(radians), Math.sin(radians), out);
    }
    V2.fromRadians = fromRadians;
    V2.ZEROS = fromValues(0, 0);
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    V2.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    V2.exactEquals = exactEquals;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    V2.add = add;
    function sub(v1, v2, out) {
        return GL.sub(out ?? tmp(), v1, v2);
    }
    V2.sub = sub;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    V2.mul = mul;
    function div(v1, v2, out) {
        return GL.div(out ?? tmp(), v1, v2);
    }
    V2.div = div;
    function norm(v1, out) {
        return GL.normalize(out ?? tmp(), v1);
    }
    V2.norm = norm;
    function len(v1) {
        return GL.length(v1);
    }
    V2.len = len;
    function dot(v1, v2) {
        return GL.dot(v1, v2);
    }
    V2.dot = dot;
    function cross(v1, v2, out) {
        return GL.cross(out ?? V3.tmp(), v1, v2);
    }
    V2.cross = cross;
    function scale(v1, n, out) {
        return GL.scale(out ?? tmp(), v1, n);
    }
    V2.scale = scale;
    function neg(v1, out) {
        return GL.negate(out ?? tmp(), v1);
    }
    V2.neg = neg;
    function dist(v1, v2) {
        return GL.dist(v1, v2);
    }
    V2.dist = dist;
    function mid(a, b, out) {
        out = out ?? tmp();
        out[0] = (a[0] + b[0]) * 0.5;
        out[1] = (a[1] + b[1]) * 0.5;
        return out;
    }
    V2.mid = mid;
    function sqrDist(v1, v2) {
        return GL.sqrDist(v1, v2);
    }
    V2.sqrDist = sqrDist;
    function rotate(v1, v2, rad, out) {
        return GL.rotate(out ?? tmp(), v1, v2, rad);
    }
    V2.rotate = rotate;
    function getYaw(v) {
        return _getYaw(v[0], v[1]);
    }
    V2.getYaw = getYaw;
})(V2 || (V2 = {}));
// NOTE: assumes +Y is forward so [0,1] is 0 yaw;
//       yaw is positive to the right so
function _getYaw(x, y) {
    // NOTE: atan2 output is [-PI,PI]; positive iff Y is positive
    //  since we want positive to the "right", we negate
    //  since we want 0 to be +Y, we add PI/2
    return -Math.atan2(y, x) + Math.PI * 0.5;
}
export const getYaw = _getYaw;
// TODO(@darzu): use "namespace" keyword instead of "module" (re: https://www.typescriptlang.org/docs/handbook/namespaces.html)
export var V3;
(function (V3) {
    const GL = GLM.vec3;
    V3.ZEROS = fromValues(0, 0, 0);
    V3.ONES = fromValues(1, 1, 1);
    V3.FWD = fromValues(0, 1, 0);
    V3.BACK = fromValues(0, -1, 0);
    V3.UP = fromValues(0, 0, 1);
    V3.DOWN = fromValues(0, 0, -1);
    V3.RIGHT = fromValues(1, 0, 0);
    V3.LEFT = fromValues(-1, 0, 0);
    V3.X = fromValues(1, 0, 0);
    V3.Y = fromValues(0, 1, 0);
    V3.Z = fromValues(0, 0, 1);
    // export default = fromValues;
    function tmp() {
        return tmpArray(3);
    }
    V3.tmp = tmp;
    // TODO(@darzu): rename mk()
    function mk() {
        return float32ArrayOfLength(3);
    }
    V3.mk = mk;
    function clone(v) {
        return GL.clone(v);
    }
    V3.clone = clone;
    // TODO(@darzu): maybe copy should have an optional out param?
    // TODO(@darzu): rename cpy
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    V3.copy = copy;
    // TODO(@darzu): "set" should probably follow copy and have the out param first and required
    function set(n0, n1, n2, out) {
        out = out ?? tmp();
        out[0] = n0;
        out[1] = n1;
        out[2] = n2;
        return out;
    }
    V3.set = set;
    function fromValues(n0, n1, n2) {
        const out = mk();
        out[0] = n0;
        out[1] = n1;
        out[2] = n2;
        return out;
    }
    V3.fromValues = fromValues;
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    V3.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    V3.exactEquals = exactEquals;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    V3.add = add;
    function abs(v, out) {
        out = out ?? tmp();
        out[0] = Math.abs(v[0]);
        out[1] = Math.abs(v[1]);
        out[2] = Math.abs(v[2]);
        return out;
    }
    V3.abs = abs;
    function sum(out, ...vs) {
        out[0] = vs.reduce((p, n) => p + n[0], 0);
        out[1] = vs.reduce((p, n) => p + n[1], 0);
        out[2] = vs.reduce((p, n) => p + n[2], 0);
        return out;
    }
    V3.sum = sum;
    function sub(v1, v2, out) {
        return GL.sub(out ?? tmp(), v1, v2);
    }
    V3.sub = sub;
    // returns a unit vector that points from src to trg like V3.norm(V3.sub(trg, src))
    function dir(trg, src, out) {
        out = out ?? tmp();
        sub(trg, src, out);
        norm(out, out);
        return out;
    }
    V3.dir = dir;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    V3.mul = mul;
    function div(v1, v2, out) {
        return GL.div(out ?? tmp(), v1, v2);
    }
    V3.div = div;
    function norm(v1, out) {
        return GL.normalize(out ?? tmp(), v1);
    }
    V3.norm = norm;
    function len(v1) {
        return GL.length(v1);
    }
    V3.len = len;
    function dot(v1, v2) {
        return GL.dot(v1, v2);
    }
    V3.dot = dot;
    function cross(v1, v2, out) {
        return GL.cross(out ?? tmp(), v1, v2);
    }
    V3.cross = cross;
    function scale(v1, n, out) {
        return GL.scale(out ?? tmp(), v1, n);
    }
    V3.scale = scale;
    function neg(v1, out) {
        return GL.negate(out ?? tmp(), v1);
    }
    V3.neg = neg;
    function dist(v1, v2) {
        return GL.dist(v1, v2);
    }
    V3.dist = dist;
    function mid(a, b, out) {
        out = out ?? tmp();
        out[0] = (a[0] + b[0]) * 0.5;
        out[1] = (a[1] + b[1]) * 0.5;
        out[2] = (a[2] + b[2]) * 0.5;
        return out;
    }
    V3.mid = mid;
    // TODO(@darzu): RENAME: all "sqr" -> "sq"
    function sqrDist(v1, v2) {
        return GL.sqrDist(v1, v2);
    }
    V3.sqrDist = sqrDist;
    function sqrLen(v) {
        return GL.sqrLen(v);
    }
    V3.sqrLen = sqrLen;
    function lerp(v1, v2, n, out) {
        return GL.lerp(out ?? tmp(), v1, v2, n);
    }
    V3.lerp = lerp;
    // TODO(@darzu): RENAME to transformQuat. tQuat, tMat is dense but too hard to remember.
    // TODO(@darzu): replace many usages with getFwd, getUp, getRight, etc.
    function tQuat(a, q, out) {
        out = out ?? tmp();
        // benchmarks: https://jsperf.com/quaternion-transform-vec3-implementations-fixed
        var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
        var x = a[0], y = a[1], z = a[2]; // var qvec = [qx, qy, qz];
        // var uv = vec3.cross([], qvec, a);
        var uvx = qy * z - qz * y, uvy = qz * x - qx * z, uvz = qx * y - qy * x; // var uuv = vec3.cross([], qvec, uv);
        var uuvx = qy * uvz - qz * uvy, uuvy = qz * uvx - qx * uvz, uuvz = qx * uvy - qy * uvx; // vec3.scale(uv, uv, 2 * w);
        var w2 = qw * 2;
        uvx *= w2;
        uvy *= w2;
        uvz *= w2; // vec3.scale(uuv, uuv, 2);
        uuvx *= 2;
        uuvy *= 2;
        uuvz *= 2; // return vec3.add(out, a, vec3.add(out, uv, uuv));
        out[0] = x + uvx + uuvx;
        out[1] = y + uvy + uuvy;
        out[2] = z + uvz + uuvz;
        return out;
    }
    V3.tQuat = tQuat;
    function tMat4(v1, v2, out) {
        return GL.transformMat4(out ?? tmp(), v1, v2);
    }
    V3.tMat4 = tMat4;
    function tMat3(v, m, out) {
        out = out ?? tmp();
        var x = v[0], y = v[1], z = v[2];
        out[0] = x * m[0] + y * m[3] + z * m[6];
        out[1] = x * m[1] + y * m[4] + z * m[7];
        out[2] = x * m[2] + y * m[5] + z * m[8];
        return out;
    }
    V3.tMat3 = tMat3;
    // NOTE: transpose matrix then transform V3 by it
    function ttMat3(v, m, out) {
        out = out ?? tmp();
        var x = v[0], y = v[1], z = v[2];
        out[0] = x * m[0] + y * m[1] + z * m[2];
        out[1] = x * m[3] + y * m[4] + z * m[5];
        out[2] = x * m[6] + y * m[7] + z * m[8];
        return out;
    }
    V3.ttMat3 = ttMat3;
    function zero(out) {
        out = out ?? tmp();
        out[0] = 0;
        out[1] = 0;
        out[2] = 0;
        return out;
    }
    V3.zero = zero;
    function rotX(point, origin, rad, out) {
        return GL.rotateX(out ?? tmp(), point, origin, rad);
    }
    V3.rotX = rotX;
    function rotY(point, origin, rad, out) {
        return GL.rotateY(out ?? tmp(), point, origin, rad);
    }
    V3.rotY = rotY;
    function rotZ(point, origin, rad, out) {
        return GL.rotateZ(out ?? tmp(), point, origin, rad);
    }
    V3.rotZ = rotZ;
    // NOTE: the yaw/pitch/roll functions ASSUME Z-up, Y-fwd, X-right
    function yaw(point, rad, 
    // origin: InputT = ZEROS,
    out) {
        return GL.rotateZ(out ?? tmp(), point, V3.ZEROS, -rad);
    }
    V3.yaw = yaw;
    function pitch(point, rad, 
    // origin: InputT = ZEROS,
    out) {
        return GL.rotateX(out ?? tmp(), point, V3.ZEROS, rad);
    }
    V3.pitch = pitch;
    function roll(point, rad, 
    // origin: InputT = ZEROS,
    out) {
        return GL.rotateY(out ?? tmp(), point, V3.ZEROS, rad);
    }
    V3.roll = roll;
    function fromYaw(yaw, out) {
        return V3.yaw(V3.FWD, yaw, out);
    }
    V3.fromYaw = fromYaw;
    // TODO(@darzu): fromYawPitchRoll
    // TODO(@darzu): add yaw/pitch/roll fns
    function reverse(v, out) {
        return set(v[2], v[1], v[0], out);
    }
    V3.reverse = reverse;
    function getYaw(v) {
        return _getYaw(v[0], v[1]);
    }
    V3.getYaw = getYaw;
})(V3 || (V3 = {}));
export var V4;
(function (V4) {
    const GL = GLM.vec4;
    function tmp() {
        return tmpArray(4);
    }
    V4.tmp = tmp;
    function mk() {
        return float32ArrayOfLength(4);
    }
    V4.mk = mk;
    function clone(v) {
        return GL.clone(v);
    }
    V4.clone = clone;
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    V4.copy = copy;
    function set(n0, n1, n2, n3, out) {
        out = out ?? tmp();
        out[0] = n0;
        out[1] = n1;
        out[2] = n2;
        out[3] = n3;
        return out;
    }
    V4.set = set;
    function fromValues(n0, n1, n2, n3) {
        const out = mk();
        out[0] = n0;
        out[1] = n1;
        out[2] = n2;
        out[3] = n3;
        return out;
    }
    V4.fromValues = fromValues;
    V4.ZEROS = fromValues(0, 0, 0, 0);
    V4.ONES = fromValues(1, 1, 1, 1);
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    V4.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    V4.exactEquals = exactEquals;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    V4.add = add;
    function sub(v1, v2, out) {
        return GL.sub(out ?? tmp(), v1, v2);
    }
    V4.sub = sub;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    V4.mul = mul;
    function div(v1, v2, out) {
        return GL.div(out ?? tmp(), v1, v2);
    }
    V4.div = div;
    function norm(v1, out) {
        return GL.normalize(out ?? tmp(), v1);
    }
    V4.norm = norm;
    function len(v1) {
        return GL.length(v1);
    }
    V4.len = len;
    function dot(v1, v2) {
        return GL.dot(v1, v2);
    }
    V4.dot = dot;
    function scale(v1, n, out) {
        return GL.scale(out ?? tmp(), v1, n);
    }
    V4.scale = scale;
    function neg(v1, out) {
        return GL.negate(out ?? tmp(), v1);
    }
    V4.neg = neg;
    function dist(v1, v2) {
        return GL.dist(v1, v2);
    }
    V4.dist = dist;
    function sqrDist(v1, v2) {
        return GL.sqrDist(v1, v2);
    }
    V4.sqrDist = sqrDist;
    function lerp(v1, v2, n, out) {
        return GL.lerp(out ?? tmp(), v1, v2, n);
    }
    V4.lerp = lerp;
    function tQuat(v1, v2, out) {
        return GL.transformQuat(out ?? tmp(), v1, v2);
    }
    V4.tQuat = tQuat;
    function tMat4(v1, v2, out) {
        return GL.transformMat4(out ?? tmp(), v1, v2);
    }
    V4.tMat4 = tMat4;
    function zero(out) {
        return GL.zero(out ?? tmp());
    }
    V4.zero = zero;
    function reverse(v, out) {
        return set(v[3], v[2], v[1], v[0], out);
    }
    V4.reverse = reverse;
})(V4 || (V4 = {}));
export var quat;
(function (quat) {
    const GL = GLM.quat;
    function tmp() {
        return tmpArray(4);
    }
    quat.tmp = tmp;
    function mk() {
        const out = float32ArrayOfLength(4);
        out[3] = 1;
        return out;
    }
    quat.mk = mk;
    function clone(v) {
        return GL.clone(v);
    }
    quat.clone = clone;
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    quat.copy = copy;
    function set(x, y, z, w, out) {
        return GL.set(out ?? tmp(), x, y, z, w);
    }
    quat.set = set;
    quat.IDENTITY = identity(mk());
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    quat.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    quat.exactEquals = exactEquals;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    quat.add = add;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    quat.mul = mul;
    function slerp(v1, v2, n, out) {
        return GL.slerp(out ?? tmp(), v1, v2, n);
    }
    quat.slerp = slerp;
    function normalize(v1, out) {
        return GL.normalize(out ?? tmp(), v1);
    }
    quat.normalize = normalize;
    function identity(out) {
        return GL.identity(out ?? tmp());
    }
    quat.identity = identity;
    function conjugate(v1, out) {
        return GL.conjugate(out ?? tmp(), v1);
    }
    quat.conjugate = conjugate;
    function invert(v1, out) {
        return GL.invert(out ?? tmp(), v1);
    }
    quat.invert = invert;
    function setAxisAngle(axis, rad, out) {
        return GL.setAxisAngle(out ?? tmp(), axis, rad);
    }
    quat.setAxisAngle = setAxisAngle;
    function getAxisAngle(q, out) {
        return GL.getAxisAngle(out ?? tmp(), q);
    }
    quat.getAxisAngle = getAxisAngle;
    function getAngle(q1, q2) {
        return GL.getAngle(q1, q2);
    }
    quat.getAngle = getAngle;
    function rotX(v1, n, out) {
        return GL.rotateX(out ?? tmp(), v1, n);
    }
    quat.rotX = rotX;
    function rotY(v1, n, out) {
        return GL.rotateY(out ?? tmp(), v1, n);
    }
    quat.rotY = rotY;
    function rotZ(v1, n, out) {
        return GL.rotateZ(out ?? tmp(), v1, n);
    }
    quat.rotZ = rotZ;
    // export function rotateMat3(v1: InputT, m: mat3, out?: T) {
    //   // TODO(@darzu): IMPL!
    // }
    function fromEuler(x, y, z, out) {
        return GL.fromEuler(out ?? tmp(), x, y, z);
    }
    quat.fromEuler = fromEuler;
    function fromMat3(m, out) {
        return GL.fromMat3(out ?? tmp(), m);
    }
    quat.fromMat3 = fromMat3;
    const __quat_fromMat4_tmp = float32ArrayOfLength(9);
    function fromMat4(m, out) {
        // TODO(@darzu): PERF. Inline to make efficient.
        return fromMat3(mat3.fromMat4(m, __quat_fromMat4_tmp), out);
    }
    quat.fromMat4 = fromMat4;
    // NOTE: the yaw/pitch/roll functions ASSUME Z-up, Y-fwd, X-right
    function yaw(v1, n, out) {
        return GL.rotateZ(out ?? tmp(), v1, -n);
    }
    quat.yaw = yaw;
    function pitch(v1, n, out) {
        return GL.rotateX(out ?? tmp(), v1, n);
    }
    quat.pitch = pitch;
    function roll(v1, n, out) {
        return GL.rotateY(out ?? tmp(), v1, n);
    }
    quat.roll = roll;
    function fromYawPitchRoll(yaw = 0, pitch = 0, roll = 0, out) {
        return GL.fromEuler(out ?? tmp(), pitch, roll, -yaw);
    }
    quat.fromYawPitchRoll = fromYawPitchRoll;
    // TODO(@darzu): this is annoying that it shows up in auto-complete. remove this
    // TODO(@darzu): little hacky, this matches our YawPitchDef but doesn't match other sprig-matrix patterns
    function fromYawPitch(yp, out) {
        return fromYawPitchRoll(yp.yaw, yp.pitch, 0, out);
    }
    quat.fromYawPitch = fromYawPitch;
    const _t6 = V3.mk();
    function getYaw(q) {
        // TODO(@darzu): PERF. can improve by inlining and simplifying
        const f = fwd(q, _t6);
        return V3.getYaw(f);
    }
    quat.getYaw = getYaw;
    // TODO(@darzu): IMPL toYawPitchRoll
    /*
    https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
    // this implementation assumes normalized quaternion
    // converts to Euler angles in 3-2-1 sequence
    EulerAngles ToEulerAngles(Quaternion q) {
        EulerAngles angles;
  
        // roll (x-axis rotation)
        double sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
        double cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
        angles.roll = std::atan2(sinr_cosp, cosr_cosp);
  
        // pitch (y-axis rotation)
        double sinp = std::sqrt(1 + 2 * (q.w * q.y - q.x * q.z));
        double cosp = std::sqrt(1 - 2 * (q.w * q.y - q.x * q.z));
        angles.pitch = 2 * std::atan2(sinp, cosp) - M_PI / 2;
  
        // yaw (z-axis rotation)
        double siny_cosp = 2 * (q.w * q.z + q.x * q.y);
        double cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
        angles.yaw = std::atan2(siny_cosp, cosy_cosp);
  
        return angles;
    }
    */
    // NOTE: assumes these are orthonormalized
    function fromXYZ(x, y, z, out) {
        return quat.fromMat3([
            // colum 1
            x[0],
            x[1],
            x[2],
            // colum 2
            y[0],
            y[1],
            y[2],
            // colum 3
            z[0],
            z[1],
            z[2],
        ], out);
    }
    quat.fromXYZ = fromXYZ;
    const _t1 = V3.mk();
    const _t2 = V3.mk();
    const _t3 = V3.mk();
    function fromYAndZish(newY, newZish, out) {
        // TODO(@darzu): PERF. this could be sped up by inline a lot of this and simplifying
        const x = _t1;
        const y = V3.copy(_t2, newY);
        const z = V3.copy(_t3, newZish);
        orthonormalize(y, z, x);
        return fromXYZ(x, y, z, out);
    }
    quat.fromYAndZish = fromYAndZish;
    // NOTE: assumes identity rotation corrisponds to Y+ being forward and Z+ being up
    function fromForwardAndUpish(forward, upish, out) {
        return fromYAndZish(forward, upish, out);
    }
    quat.fromForwardAndUpish = fromForwardAndUpish;
    // Creates a rotation that will move <0,1,0> to point towards forward; no guarantees are made
    //  about its other axis orientations!
    const _t4 = V3.mk();
    function fromForward(forward, out) {
        // console.log(`fromForward, fwd:${vec3Dbg(forward)}`);
        const y = V3.copy(_t4, forward);
        V3.norm(y, y);
        // console.log(`normalized y: ${vec3Dbg(y)}`);
        // find an up-ish vector
        const upish = tV(0, 0, 1);
        if (Math.abs(V3.dot(y, upish)) > 0.9)
            V3.set(0, 1, 0, upish);
        // console.log(`upish: ${vec3Dbg(upish)}`);
        // orthonormalize
        const x = V3.tmp();
        V3.cross(y, upish, x);
        V3.norm(x, x);
        // console.log(`x: ${vec3Dbg(x)}`);
        V3.cross(x, y, upish);
        // console.log(`new upish: ${vec3Dbg(upish)}`);
        // console.log(`x: ${vec3Dbg(x)}, y: ${vec3Dbg(y)}, z: ${vec3Dbg(upish)}`);
        return fromXYZ(x, y, upish, out);
    }
    quat.fromForward = fromForward;
    // TODO(@darzu): UNIFY w/ fromForward etc
    const _t5 = V3.mk();
    function fromUp(up, out) {
        const z = V3.copy(_t5, up);
        V3.norm(z, z);
        // find an x-ish vector
        const x = tV(1, 0, 0);
        if (Math.abs(V3.dot(z, x)) > 0.9)
            V3.set(0, 1, 0, x);
        // orthonormalize
        const y = V3.tmp();
        orthonormalize(z, x, y);
        return fromXYZ(x, y, z, out);
    }
    quat.fromUp = fromUp;
    function right(q, out) {
        return V3.tQuat(V3.RIGHT, q, out);
    }
    quat.right = right;
    function fwd(q, out) {
        return V3.tQuat(V3.FWD, q, out);
    }
    quat.fwd = fwd;
    function up(q, out) {
        return V3.tQuat(V3.UP, q, out);
    }
    quat.up = up;
    function left(q, out) {
        return V3.tQuat(V3.LEFT, q, out);
    }
    quat.left = left;
    function back(q, out) {
        return V3.tQuat(V3.BACK, q, out);
    }
    quat.back = back;
    function down(q, out) {
        return V3.tQuat(V3.DOWN, q, out);
    }
    quat.down = down;
    // TODO(@darzu): REFACTOR: add all swizzle like .xy(), .x(), .zyx(), etc.
})(quat || (quat = {}));
// TODO(@darzu): HACK FOR DEBUGGING
// function vec3Dbg(v?: V3.InputT): string {
//   return v
//     ? `[${v[0].toFixed(2)},${v[1].toFixed(2)},${v[2].toFixed(2)}]`
//     : "NIL";
// }
export var mat4;
(function (mat4) {
    const GL = GLM.mat4;
    function tmp() {
        return tmpArray(16);
    }
    mat4.tmp = tmp;
    // TODO(@darzu): RENAME mk()
    function create() {
        const out = float32ArrayOfLength(16);
        out[0] = 1;
        out[5] = 1;
        out[10] = 1;
        out[15] = 1;
        return out;
    }
    mat4.create = create;
    function clone(v) {
        return GL.clone(v);
    }
    mat4.clone = clone;
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    mat4.copy = copy;
    mat4.IDENTITY = identity(create());
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    mat4.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    mat4.exactEquals = exactEquals;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    mat4.add = add;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    mat4.mul = mul;
    function identity(out) {
        return GL.identity(out ?? tmp());
    }
    mat4.identity = identity;
    function invert(v1, out) {
        const r = GL.invert(out ?? tmp(), v1);
        // TODO(@darzu): allow invert matrix to fail?
        assert(r, `can't invert matrix! Probably NaNs or bad src matrix: ${JSON.stringify(v1)}`);
        return r;
    }
    mat4.invert = invert;
    function scale(a, v, out) {
        return GL.scale(out ?? tmp(), a, v);
    }
    mat4.scale = scale;
    function fromRotationTranslation(q, v, out) {
        return GL.fromRotationTranslation(out ?? tmp(), q, v);
    }
    mat4.fromRotationTranslation = fromRotationTranslation;
    function fromRotationTranslationScale(q, v, s, out) {
        return GL.fromRotationTranslationScale(out ?? tmp(), q, v, s);
    }
    mat4.fromRotationTranslationScale = fromRotationTranslationScale;
    function fromRotationTranslationScaleOrigin(q, v, s, o, out) {
        return GL.fromRotationTranslationScaleOrigin(out ?? tmp(), q, v, s, o);
    }
    mat4.fromRotationTranslationScaleOrigin = fromRotationTranslationScaleOrigin;
    function fromScaling(v, out) {
        return GL.fromScaling(out ?? tmp(), v);
    }
    mat4.fromScaling = fromScaling;
    function fromTranslation(v, out) {
        return GL.fromTranslation(out ?? tmp(), v);
    }
    mat4.fromTranslation = fromTranslation;
    function fromXRotation(rad, out) {
        return GL.fromXRotation(out ?? tmp(), rad);
    }
    mat4.fromXRotation = fromXRotation;
    function fromYRotation(rad, out) {
        return GL.fromYRotation(out ?? tmp(), rad);
    }
    mat4.fromYRotation = fromYRotation;
    function fromZRotation(rad, out) {
        return GL.fromZRotation(out ?? tmp(), rad);
    }
    mat4.fromZRotation = fromZRotation;
    function fromQuat(q, out) {
        return GL.fromQuat(out ?? tmp(), q);
    }
    mat4.fromQuat = fromQuat;
    function getRotation(m, out) {
        return GL.getRotation(out ?? quat.tmp(), m);
    }
    mat4.getRotation = getRotation;
    function getTranslation(m, out) {
        return GL.getTranslation(out ?? V3.tmp(), m);
    }
    mat4.getTranslation = getTranslation;
    function getScaling(m, out) {
        return GL.getScaling(out ?? V3.tmp(), m);
    }
    mat4.getScaling = getScaling;
    // TODO(@darzu): wait what, these should all rotate clockwise?
    //  comment was: "NOTE: rotates CCW"
    function rotateX(v1, n, out) {
        return GL.rotateX(out ?? tmp(), v1, n);
    }
    mat4.rotateX = rotateX;
    function rotateY(v1, n, out) {
        return GL.rotateY(out ?? tmp(), v1, n);
    }
    mat4.rotateY = rotateY;
    function rotateZ(v1, n, out) {
        return GL.rotateZ(out ?? tmp(), v1, n);
    }
    mat4.rotateZ = rotateZ;
    // NOTE: the yaw/pitch/roll functions ASSUME Z-up, Y-fwd, X-right
    function yaw(v1, n, out) {
        return GL.rotateZ(out ?? tmp(), v1, -n);
    }
    mat4.yaw = yaw;
    function pitch(v1, n, out) {
        return GL.rotateX(out ?? tmp(), v1, n);
    }
    mat4.pitch = pitch;
    function roll(v1, n, out) {
        return GL.rotateY(out ?? tmp(), v1, n);
    }
    mat4.roll = roll;
    function fromYaw(rad, out) {
        return GL.fromZRotation(out ?? tmp(), -rad);
    }
    mat4.fromYaw = fromYaw;
    function fromPitch(rad, out) {
        return GL.fromXRotation(out ?? tmp(), rad);
    }
    mat4.fromPitch = fromPitch;
    function fromRoll(rad, out) {
        return GL.fromYRotation(out ?? tmp(), rad);
    }
    mat4.fromRoll = fromRoll;
    function fromYawPitchRoll(yaw = 0, pitch = 0, roll = 0, out) {
        // TODO(@darzu): PERF! impl directly
        return fromQuat(quat.fromYawPitchRoll(yaw, pitch, roll), out);
    }
    mat4.fromYawPitchRoll = fromYawPitchRoll;
    function frustum(left, right, bottom, top, near, far, out) {
        return GL.frustum(out ?? tmp(), left, right, bottom, top, near, far);
    }
    mat4.frustum = frustum;
    /*
    Generates a orthogonal projection matrix with the given bounds
  
    It's a scale and translation matrix.
    Smooshes left/right/top/bottom/near/far
    from y-up, right-handed into [-1,-1,0]x[1,1,1], y-up, left-handed (WebGPU NDC clip-space)
    */
    // TODO(@darzu): Z_UP?
    function ortho(left, right, bottom, top, near, far, out) {
        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);
        const nf = 1 / (near - far);
        const _out = out ?? mat4.tmp();
        _out[0] = -2 * lr;
        _out[1] = 0;
        _out[2] = 0;
        _out[3] = 0;
        _out[4] = 0;
        _out[5] = -2 * bt;
        _out[6] = 0;
        _out[7] = 0;
        _out[8] = 0;
        _out[9] = 0;
        // _out[10] = 2 * nf; // For WebGL NDC
        _out[10] = nf; // For WebGPU NDC
        _out[11] = 0;
        _out[12] = (left + right) * lr;
        _out[13] = (top + bottom) * bt;
        // _out[14] = (far + near) * nf; // For WebGL NDC
        _out[14] = near * nf; // For WebGPU NDC
        _out[15] = 1;
        return _out;
    }
    mat4.ortho = ortho;
    /**
    Generates a perspective projection matrix with the given bounds.
    Passing null/undefined/no value for far will generate infinite projection matrix.
    
    Seems to output into [-1,-1,0]x[1,1,1], y-up, left-handed (WebGPU NDC clip-space)
  
    @param {number} fovy Vertical field of view in radians
    @param {number} aspect Aspect ratio. typically viewport width/height
    @param {number} near Near bound of the frustum, must be >0
    @param {number} far Far bound of the frustum, can be null or Infinity
    @param {mat4} out mat4 frustum matrix will be written into
    @returns {mat4} out
    */
    function perspective(fovy, aspect, near, far, out) {
        out = out ?? tmp();
        const f = 1.0 / Math.tan(fovy / 2);
        out[0] = f / aspect;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        out[4] = 0;
        out[5] = f;
        out[6] = 0;
        out[7] = 0;
        out[8] = 0;
        out[9] = 0;
        out[11] = -1;
        out[12] = 0;
        out[13] = 0;
        out[15] = 0;
        if (far != null && far !== Infinity) {
            const nf = 1 / (near - far);
            out[10] = (far + near) * nf;
            out[14] = 2 * far * near * nf;
        }
        else {
            out[10] = -1;
            out[14] = -2 * near;
        }
        return out;
    }
    mat4.perspective = perspective;
    /*
    Generates a look-at matrix with the given eye position, focal point, and up axis.
    If you want a matrix that actually makes an object look at another object, you should use targetTo instead.
  
    This is an optimized version of:
    - translate the eye to (0,0,0)
    - rotate to the camera's view:
        create an orthonormalized set of basis vectors from camera forward, up, right
    */
    // TODO(@darzu): extract orthonormalization / Gram–Schmidt process?
    function lookAt(eye, center, up, out) {
        const eyex = eye[0];
        const eyey = eye[1];
        const eyez = eye[2];
        const upx = up[0];
        const upy = up[1];
        const upz = up[2];
        const centerx = center[0];
        const centery = center[1];
        const centerz = center[2];
        if (Math.abs(eyex - centerx) < EPSILON &&
            Math.abs(eyey - centery) < EPSILON &&
            Math.abs(eyez - centerz) < EPSILON) {
            return identity(out);
        }
        let z0 = eyex - centerx;
        let z1 = eyey - centery;
        let z2 = eyez - centerz;
        let len = 1 / Math.hypot(z0, z1, z2);
        z0 *= len;
        z1 *= len;
        z2 *= len;
        let x0 = upy * z2 - upz * z1;
        let x1 = upz * z0 - upx * z2;
        let x2 = upx * z1 - upy * z0;
        len = Math.hypot(x0, x1, x2);
        if (!len) {
            x0 = 0;
            x1 = 0;
            x2 = 0;
        }
        else {
            len = 1 / len;
            x0 *= len;
            x1 *= len;
            x2 *= len;
        }
        let y0 = z1 * x2 - z2 * x1;
        let y1 = z2 * x0 - z0 * x2;
        let y2 = z0 * x1 - z1 * x0;
        len = Math.hypot(y0, y1, y2);
        if (!len) {
            y0 = 0;
            y1 = 0;
            y2 = 0;
        }
        else {
            len = 1 / len;
            y0 *= len;
            y1 *= len;
            y2 *= len;
        }
        const _out = out ?? mat4.tmp();
        _out[0] = x0;
        _out[1] = y0;
        _out[2] = z0;
        _out[3] = 0;
        _out[4] = x1;
        _out[5] = y1;
        _out[6] = z1;
        _out[7] = 0;
        _out[8] = x2;
        _out[9] = y2;
        _out[10] = z2;
        _out[11] = 0;
        _out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
        _out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
        _out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
        _out[15] = 1;
        return _out;
    }
    mat4.lookAt = lookAt;
    function translate(m, v, out) {
        return GL.translate(out ?? tmp(), m, v);
    }
    mat4.translate = translate;
})(mat4 || (mat4 = {}));
export var mat3;
(function (mat3) {
    const GL = GLM.mat3;
    function tmp() {
        return tmpArray(9);
    }
    mat3.tmp = tmp;
    // TODO(@darzu): RENAME to mk()
    /* creates identity matrix */
    function create() {
        const out = float32ArrayOfLength(9);
        out[0] = 1;
        out[4] = 1;
        out[8] = 1;
        return out;
    }
    mat3.create = create;
    function fromValues(m00, m01, m02, m10, m11, m12, m20, m21, m22) {
        var out = float32ArrayOfLength(9);
        out[0] = m00;
        out[1] = m01;
        out[2] = m02;
        out[3] = m10;
        out[4] = m11;
        out[5] = m12;
        out[6] = m20;
        out[7] = m21;
        out[8] = m22;
        return out;
    }
    mat3.fromValues = fromValues;
    function clone(v) {
        return GL.clone(v);
    }
    mat3.clone = clone;
    function copy(out, v1) {
        return GL.copy(out, v1);
    }
    mat3.copy = copy;
    mat3.IDENTITY = identity(create());
    function equals(v1, v2) {
        return GL.equals(v1, v2);
    }
    mat3.equals = equals;
    function exactEquals(v1, v2) {
        return GL.exactEquals(v1, v2);
    }
    mat3.exactEquals = exactEquals;
    function set(m00, m01, m02, m10, m11, m12, m20, m21, m22, out) {
        return GL.set(out ?? tmp(), m00, m01, m02, m10, m11, m12, m20, m21, m22);
    }
    mat3.set = set;
    function add(v1, v2, out) {
        return GL.add(out ?? tmp(), v1, v2);
    }
    mat3.add = add;
    function mul(v1, v2, out) {
        return GL.mul(out ?? tmp(), v1, v2);
    }
    mat3.mul = mul;
    function identity(out) {
        return GL.identity(out ?? tmp());
    }
    mat3.identity = identity;
    function invert(v1, out) {
        return GL.invert(out ?? tmp(), v1);
    }
    mat3.invert = invert;
    function transpose(v1, out) {
        return GL.transpose(out ?? tmp(), v1);
    }
    mat3.transpose = transpose;
    // TODO(@darzu): bug ? scale V2 input?
    function scale(a, v, out) {
        return GL.scale(out ?? tmp(), a, v);
    }
    mat3.scale = scale;
    function fromScaling(v, out) {
        return GL.fromScaling(out ?? tmp(), v);
    }
    mat3.fromScaling = fromScaling;
    function fromQuat(q, out) {
        return GL.fromQuat(out ?? tmp(), q);
    }
    mat3.fromQuat = fromQuat;
    function fromMat4(q, out) {
        return GL.fromMat4(out ?? tmp(), q);
    }
    mat3.fromMat4 = fromMat4;
})(mat3 || (mat3 = {}));
// Other utils:
// mutates all three vectors so they are all perpendicular and unit
//  orthogonal to eachother.
export function orthonormalize(v, perpIsh, outPerp2) {
    // TODO(@darzu): there's a pattern somewhat similar in many places:
    //    orthonormalizing, Gram–Schmidt
    //    quatFromUpForward, getControlPoints, tripleProd?
    //    targetTo, lookAt ?
    // Also this can be more efficient by inlining
    V3.norm(v, v);
    V3.cross(v, perpIsh, outPerp2);
    V3.norm(outPerp2, outPerp2);
    V3.cross(outPerp2, v, perpIsh);
}
//# sourceMappingURL=sprig-matrix.js.map