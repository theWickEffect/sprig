import { V2, V } from "../matrix/sprig-matrix.js";
import { packI16s } from "../utils/util.js";
export function createHexGrid() {
    const _grid = new Map();
    return {
        _grid,
        has: (q, r) => _grid.has(packI16s(q, r)),
        set: (q, r, d) => _grid.set(packI16s(q, r), d),
        get: (q, r) => _grid.get(packI16s(q, r)),
        delete: (q, r) => _grid.delete(packI16s(q, r)),
    };
}
const q_y_spc = Math.sqrt(3) / 2;
const r_y_spc = Math.sqrt(3);
const q_x_spc = 3 / 2;
export function hexY(q, r, size) {
    return -size * (q_y_spc * q + r_y_spc * r);
}
export function hexX(q, r, size) {
    return size * q_x_spc * q;
}
export function hexXYZ(out, q, r, size) {
    out[0] = hexX(q, r, size);
    out[1] = hexY(q, r, size);
    out[2] = 0;
    return out;
}
const sqrt_3_3 = Math.sqrt(3) / 3;
export function xyToHex(x, y, size) {
    const q = ((2 / 3) * x) / size;
    const r = ((-1 / 3) * x + sqrt_3_3 * -y) / size;
    return hexRound(q, r);
}
export function hexRound(qf, rf) {
    const sf = -qf - rf;
    let q = Math.round(qf);
    let r = Math.round(rf);
    let s = Math.round(sf);
    const q_diff = Math.abs(q - qf);
    const r_diff = Math.abs(r - rf);
    const s_diff = Math.abs(s - sf);
    if (q_diff > r_diff && q_diff > s_diff)
        q = -r - s;
    else if (r_diff > s_diff)
        r = -q - s;
    else
        s = -q - r;
    return [q, r];
}
export function hexDist(q1, r1, q2, r2) {
    const dq = q2 - q1;
    const dr = r2 - r1;
    return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}
export function* hexesWithin(cq, cr, radius) {
    const w = Math.floor(radius);
    for (let q = -w; q <= w; q++) {
        for (let r = -w; r <= w; r++) {
            for (let s = -w; s <= w; s++) {
                if (q + r + s === 0) {
                    yield [q + cq, r + cr];
                }
            }
        }
    }
}
// TODO(@darzu): verify this dir stuff still works
// flat-top; +q along +x ; +r along -y|-x;
export const HEX_DIRS = [
    V(+0, -1),
    V(+1, -1),
    V(+1, -0),
    V(-0, +1),
    V(-1, +1),
    V(-1, +0),
];
export const HEX_N_IDX = 0;
export const HEX_NE_IDX = 1;
export const HEX_SE_IDX = 2;
export const HEX_S_IDX = 3;
export const HEX_SW_IDX = 4;
export const HEX_NW_IDX = 5;
export const HEX_N = HEX_DIRS[0];
export const HEX_NE = HEX_DIRS[1];
export const HEX_SE = HEX_DIRS[2];
export const HEX_S = HEX_DIRS[3];
export const HEX_SW = HEX_DIRS[4];
export const HEX_NW = HEX_DIRS[5];
export const HEX_E_DIR = [+1, -0.5, -0.5];
export const HEX_W_DIR = [-1, +0.5, +0.5];
export function hexDirAdd(dirIdx, n) {
    return (dirIdx + HEX_DIRS.length + n) % HEX_DIRS.length;
}
export function hexLeft(dirIdx) {
    return (dirIdx + HEX_DIRS.length - 1) % HEX_DIRS.length;
}
export function hexRight(dirIdx) {
    return (dirIdx + 1) % HEX_DIRS.length;
}
export function hexNeighborDirs(dirIdx = 0) {
    return [
        HEX_DIRS[dirIdx],
        HEX_DIRS[hexDirAdd(dirIdx, 1)],
        HEX_DIRS[hexDirAdd(dirIdx, 2)],
        HEX_DIRS[hexDirAdd(dirIdx, 3)],
        HEX_DIRS[hexDirAdd(dirIdx, 4)],
        HEX_DIRS[hexDirAdd(dirIdx, 5)],
    ];
}
export function hexDirCCW90(dirIdx = 0) {
    return hexAvg(HEX_DIRS[hexDirAdd(dirIdx, HEX_SW_IDX)], HEX_DIRS[hexDirAdd(dirIdx, HEX_NW_IDX)]);
}
export function hexDirCW90(dirIdx = 0) {
    return hexAvg(HEX_DIRS[hexDirAdd(dirIdx, HEX_SE_IDX)], HEX_DIRS[hexDirAdd(dirIdx, HEX_NE_IDX)]);
}
export function hexNeighbors(q, r, dirIdx = 0) {
    const qr = [q, r];
    return hexNeighborDirs(dirIdx).map((d) => V2.add(qr, d, V(0, 0)));
}
export function hexAvg(qr1, qr2) {
    return V((qr1[0] + qr2[0]) * 0.5, (qr1[1] + qr2[1]) * 0.5, (-qr1[0] - qr1[1] - qr2[0] - qr2[1]) * 0.5);
}
//# sourceMappingURL=hex.js.map