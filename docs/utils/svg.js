import { ENDESGA16 } from "../color/palettes.js";
import { V, V2, V3, tV, tmpStack } from "../matrix/sprig-matrix.js";
import { createAABB2 } from "../physics/aabb.js";
import { angularDiff, sum } from "./math.js";
import { sketchDot, sketchLine, sketchPoints } from "./sketch.js";
import { PI, never } from "./util-no-import.js";
import { assert, range } from "./util.js";
import { vec2Dbg } from "./utils-3d.js";
// TODO(@darzu): make table..
export function svgInstrIsStraight({ i }) {
    if (i === "M")
        return true;
    else if (i === "a")
        return false;
    else if (i === "h")
        return true;
    else if (i === "v")
        return true;
    else if (i === "m")
        return true;
    else
        never(i);
}
function _testSvg() {
    const aabb = createAABB2(V(-1, -2), V(3, 4));
    const radius = 3;
    const width = 5;
    const height = 7;
    const foo = [
        { i: "M", x: aabb.min[0] - radius, y: aabb.min[1] },
        { i: "v", dy: height },
        { i: "a", rx: radius, dx: +radius, dy: +radius },
        { i: "h", dx: width },
        { i: "a", rx: radius, dx: +radius, dy: -radius },
        { i: "v", dy: -height },
        { i: "a", rx: radius, dx: -radius, dy: -radius },
        { i: "h", dx: -width },
        { i: "a", rx: radius, dx: -radius, dy: +radius },
    ];
}
// TODO(@darzu): MOVE elsewhere
export function getCircleCenter(x0, y0, x1, y1, r, cw, // TODO(@darzu): RENAME. cw isn't quite right since a large arc travel could be ccw
out) {
    // https://math.stackexchange.com/questions/1781438/finding-the-center-of-a-circle-given-two-points-and-a-radius-algebraically
    const x01 = (x1 - x0) * 0.5;
    const y01 = (y1 - y0) * 0.5;
    const aSqr = x01 ** 2 + y01 ** 2;
    const a = Math.sqrt(aSqr);
    const b = Math.sqrt(r ** 2 - aSqr);
    assert(!isNaN(b), `radius smaller than travel`);
    const ba = b / a;
    const cx = x0 + x01 + ba * y01 * cw;
    const cy = y0 + y01 - ba * x01 * cw;
    out = out ?? V2.tmp();
    out[0] = cx;
    out[1] = cy;
    return out;
}
// NOTE: assumes t is in [0,1]
function svgPosAndLen(start, t, instr, out) {
    out = out ?? V2.tmp();
    if (instr.i === "M") {
        V2.lerp(start, [instr.x, instr.y], t, out);
        return 0;
    }
    else if (instr.i === "m") {
        out[0] = start[0] + instr.dx * t;
        out[1] = start[1] + instr.dy * t;
        return V2.len([instr.dx, instr.dy]);
    }
    else if (instr.i === "h") {
        out[0] = start[0] + instr.dx * t;
        out[1] = start[1];
        return Math.abs(instr.dx);
    }
    else if (instr.i === "v") {
        out[0] = start[0];
        out[1] = start[1] + instr.dy * t;
        return Math.abs(instr.dy);
    }
    else if (instr.i === "a") {
        const vx = start[0] + instr.dx;
        const vy = start[1] + instr.dy;
        const s = instr.sweep ? -1 : 1; // TODO(@darzu): TEST AND VERIFY!
        assert(!instr.xAxisRot, `TODO: xAxisRot`);
        assert(!instr.ry, `TODO: ry`);
        // assert(!instr.largeArc, `TODO: largeArc`);
        // assert(!instr.sweep, `TODO: sweep`);
        // const s = 1;
        const c = getCircleCenter(start[0], start[1], vx, vy, instr.rx, s);
        const sTheta = Math.atan2(start[1] - c[1], start[0] - c[0]);
        const eTheta = Math.atan2(vy - c[1], vx - c[0]);
        const largeArc = !!instr.largeArc;
        const sToETheta = angularDiff(eTheta, sTheta, largeArc);
        const theta = sTheta + sToETheta * t;
        const l = 2 * PI * Math.abs(sToETheta) * t;
        out[0] = c[0] + Math.cos(theta) * instr.rx;
        out[1] = c[1] + Math.sin(theta) * instr.rx;
        return l;
    }
    else
        never(instr);
}
function svgEnd(start, instr, out) {
    out = out ?? V2.tmp();
    if (instr.i === "M") {
        out[0] = instr.x;
        out[1] = instr.y;
    }
    else if (instr.i === "m") {
        out[0] = start[0] + instr.dx;
        out[1] = start[1] + instr.dy;
    }
    else if (instr.i === "h") {
        out[0] = start[0] + instr.dx;
        out[1] = start[1];
    }
    else if (instr.i === "v") {
        out[0] = start[0];
        out[1] = start[1] + instr.dy;
    }
    else if (instr.i === "a") {
        out[0] = start[0] + instr.dx;
        out[1] = start[1] + instr.dy;
    }
    else
        never(instr);
    return out;
}
export function compileSVG(svg) {
    const verts = range(svg.length + 1).map((_) => V(0, 0));
    const lengths = [];
    // TODO(@darzu): PERF! For arcs, save the intermediate thetas, center etc.
    svg.forEach((instr, i) => {
        const start = verts[i];
        const end = verts[i + 1];
        const l = svgPosAndLen(start, 1, instr, end);
        assert(l >= 0, `BUG: ${l} = svgPosAndLen(${vec2Dbg(start)}, 1, ${JSON.stringify(instr)}, ${vec2Dbg(end)})`);
        svgEnd(start, instr, end); // NOTE: we use the end fn b/c it's more numerically stable (overkill? probably.)
        lengths.push(l);
    });
    const totalLength = sum(lengths);
    const localParametric = (i, t, out) => {
        out = out ?? V2.tmp();
        svgPosAndLen(verts[i], t, svg[i], out);
        return out;
    };
    const parametric = (t, out) => {
        t = wrapT(t);
        let toTravel = t * totalLength;
        let i = 0;
        while (toTravel > lengths[i] && i < lengths.length - 1) {
            toTravel -= lengths[i];
            i++;
        }
        const localT = toTravel / lengths[i];
        return localParametric(i, localT, out);
    };
    return {
        svg,
        verts,
        lengths,
        totalLength,
        fn: parametric,
        instrFn: localParametric,
    };
}
// TODO(@darzu): MOVE
// wraps t into [0,1]
function wrapT(t) {
    return t >= 0 ? t % 1.0 : (t % 1.0) + 1.0;
}
// TODO(@darzu): support parsing strings & .svg like:
/*
  const path = `
  M ${aabb.min[0] - radius},${aabb.min[1]}
  v ${height}
  a ${radius} ${radius} 0 0 ${+radius} ${+radius}
  h ${width}
  a ${radius} ${radius} 0 0 ${+radius} ${-radius}
  v ${-height}
  a ${radius} ${radius} 0 0 ${-radius} ${-radius}
  h ${-width}
  a ${radius} ${radius} 0 0 ${-radius} ${+radius}
`;
*/
function debugSVG(to3d) {
    const aabb = createAABB2(V(-20, -20), V(30, 30));
    const radius = 15;
    // go clockwise starting from min
    const width = aabb.max[0] - aabb.min[0];
    const height = aabb.max[1] - aabb.min[1];
    const svg = [
        { i: "M", x: aabb.min[0] - radius, y: aabb.min[1] },
        { i: "v", dy: height },
        { i: "a", rx: radius, dx: +radius, dy: +radius },
        { i: "h", dx: width },
        { i: "a", rx: radius, dx: +radius, dy: -radius },
        { i: "v", dy: -height },
        { i: "a", rx: radius, dx: -radius, dy: -radius },
        { i: "h", dx: -width },
        { i: "a", rx: radius, dx: -radius, dy: +radius },
    ];
    const compSvg = compileSVG(svg);
    for (let i = 0; i < svg.length; i++) {
        if (compSvg.lengths[i] <= 0)
            continue;
        const start = compSvg.verts[i];
        const end = compSvg.verts[i + 1];
        const instr = compSvg.svg[i];
        if (instr.i !== "a")
            continue;
        sketchLine(to3d(start), to3d(end), {
            key: "seg_" + i,
        });
        const c = getCircleCenter(start[0], start[1], end[0], end[1], instr.rx, +1);
        sketchDot(to3d(c), 1, { color: ENDESGA16.lightGreen, key: "c0_" + i });
        const c1 = getCircleCenter(start[0], start[1], end[0], end[1], instr.rx, -1);
        sketchDot(to3d(c1), 1, { color: ENDESGA16.red, key: "c1_" + i });
        const sTheta = Math.atan2(start[1] - c[1], start[0] - c[0]);
        const eTheta = Math.atan2(end[1] - c[1], end[0] - c[0]);
        const angleToPos = (theta) => tV(c[0] + Math.cos(theta) * instr.rx, c[1] + Math.sin(theta) * instr.rx);
        sketchLine(to3d(c), to3d(angleToPos(sTheta)), {
            key: "uTheta" + i,
            color: ENDESGA16.lightBrown,
        });
        sketchLine(to3d(c), to3d(angleToPos(eTheta)), {
            key: "vTheta" + i,
            color: ENDESGA16.darkBrown,
        });
        // const smallTheta = Math.abs(uTheta - vTheta);
        // const largeTheta = 2 * PI - smallTheta;
        // const arcTheta = smallTheta;
        // const theta = uTheta + arcTheta * t;
        // const l = 2 * PI * arcTheta * t;
        // out[0] = c[0] + Math.cos(theta) * instr.rx;
        // out[1] = c[1] + Math.sin(theta) * instr.rx;
        // const N = 20;
        // const points = range(N)
        //   .map((n) => n / N)
        //   .map((t) => {
        //     const v2d = compSvg.instrFn(i, t);
        //     const v = tV(v2d[0], 0, v2d[1]);
        //     V3.tMat4(v, localToWorldM, v);
        //     return v;
        //   });
        // sketchLines(points, {
        //   key: "svgPoints_" + i,
        //   color: RainbowEndesga16[i],
        // });
    }
    {
        // full shape
        const points = range(100)
            .map((n) => n / 100)
            .map((t) => {
            const v2d = compSvg.fn(t);
            return to3d(v2d);
        });
        sketchPoints(points, {
            key: "svgAllPoints",
            color: ENDESGA16.lightGray,
        });
    }
}
export function svgToLineSeg(svgC, opt = {}) {
    const _stk = tmpStack();
    const numPerInstr = opt.numPerInstr ?? 2;
    assert(numPerInstr >= 2);
    const segs = [];
    for (let i = 0; i < svgC.svg.length; i++) {
        if (svgC.lengths[i] <= 0)
            continue;
        const vs = [];
        const instr = svgC.svg[i];
        let num = numPerInstr;
        if (svgInstrIsStraight(instr))
            num = 2;
        for (let j = 0; j < num; j++) {
            const t = j / (num - 1);
            const v2 = svgC.instrFn(i, t);
            const v3 = V(v2[0], v2[1], 0);
            if (opt.origin)
                V3.add(v3, opt.origin, v3);
            vs.push(v3);
        }
        for (let k = 0; k < vs.length - 1; k++) {
            segs.push([vs[k], vs[k + 1]]);
        }
    }
    _stk.pop();
    return segs;
}
//# sourceMappingURL=svg.js.map