import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { V } from "../matrix/sprig-matrix.js";
import { PositionDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { assert } from "../utils/util-no-import.js";
import { createEmptyMesh } from "../wood/wood.js";
import { J3 } from "./joel-game.js";
export var TreeBuilder;
(function (TreeBuilder) {
    function mkRandPalmTree(base, hasNuts = Math.random() > .1) {
        const treeMesh = createEmptyMesh("palmTree");
        treeMesh.surfaceIds = [];
        let top = V(0, 0, 0);
        top[0] = base[0] + Math.random() * 6 - 3;
        top[1] = base[1] + Math.random() * 6 - 3;
        top[2] = base[2] + Math.random() * 4 + 8.5;
        let trunkTop = J3.clone(top);
        trunkTop[2] -= .7;
        if (hasNuts)
            mkNuts(top);
        mkTrunk(base, trunkTop);
        mkFrond(top, V(Math.random() * 1 + 4.5 + top[0], Math.random() * 1 - .5 + top[1], Math.random() * 4 - 2.2 + top[2]), Math.random() * .1 + .25);
        mkFrond(top, V(Math.random() * 1 + 3.5 + top[0], Math.random() * 1 + 1.5 + top[1], Math.random() * 4 - 2.2 + top[2]), Math.random() * .1 + .25);
        mkFrond(top, V(Math.random() * 1 - 4.5 + top[0], Math.random() * 1 - 3.5 + top[1], Math.random() * 4 - 2.2 + top[2]), Math.random() * .1 + .25);
        mkFrond(top, V(Math.random() * 1 - 5.3 + top[0], Math.random() * 1 - .5 + top[1], Math.random() * 4 - 2.2 + top[2]), Math.random() * .1 + .25);
        const treeMeshFinal = treeMesh;
        treeMeshFinal.usesProvoking = true;
        assert(treeMesh.surfaceIds.length === treeMesh.quad.length + treeMesh.tri.length);
        assert(treeMesh.colors.length === treeMesh.quad.length + treeMesh.tri.length);
        const tree = EM.mk();
        EM.set(tree, RenderableConstructDef, treeMeshFinal);
        EM.set(tree, PositionDef, V(0, 0, 0));
        function mkNuts(p) {
            const downDist = .5;
            let p1 = J3.clone(p);
            let p2 = J3.clone(p);
            let p3 = J3.clone(p);
            p1[0] -= .31;
            p1[1] -= .12;
            p1[2] -= downDist;
            p2[2] -= .1 + downDist;
            p2[0] += .3;
            p3[2] -= .6 + downDist;
            mkNut(p1);
            mkNut(p2);
            mkNut(p3);
        }
        function mkNut(p) {
            const scale = .28;
            const firstVI = treeMesh.pos.length;
            treeMesh.pos.push(V(+scale, +scale, +scale), V(-scale, +scale, +scale), V(-scale, -scale, +scale), V(+scale, -scale, +scale), V(+scale, +scale, -scale), V(-scale, +scale, -scale), V(-scale, -scale, -scale), V(+scale, -scale, -scale));
            for (let vi = firstVI; vi < firstVI + 8; vi++) {
                J3.add(treeMesh.pos[vi], p, false);
            }
            const firstQI = treeMesh.quad.length;
            treeMesh.quad.push(
            // +Z
            V(0, 1, 2, 3), 
            // +Y
            V(4, 5, 1, 0), 
            // +X
            V(3, 7, 4, 0), 
            // -X
            V(2, 1, 5, 6), 
            // -Y
            V(6, 7, 3, 2), 
            // -Z
            V(5, 4, 7, 6));
            assert(treeMesh.surfaceIds);
            let sid = treeMesh.surfaceIds.length;
            for (let qi = firstQI; qi < firstQI + 6; qi++) {
                treeMesh.quad[qi][0] += firstVI;
                treeMesh.quad[qi][1] += firstVI;
                treeMesh.quad[qi][2] += firstVI;
                treeMesh.quad[qi][3] += firstVI;
                treeMesh.surfaceIds.push(sid);
                sid++;
                treeMesh.colors.push(ENDESGA16.darkBrown);
            }
        }
        function mkTrunk(base, top, barkSpacing = .03, curveRatio = .1) {
            const xLean = base[0] - top[0];
            const yLean = base[1] - top[1];
            const treeLen = J3.dist(base, top);
            let p1 = J3.add(J3.scale(base, .9), J3.scale(top, .1));
            p1[0] += xLean * treeLen * curveRatio;
            p1[1] += yLean * treeLen * curveRatio;
            let p2 = J3.add(J3.scale(base, .1), J3.scale(top, .9));
            p2[0] += xLean * treeLen * curveRatio;
            p2[1] += yLean * treeLen * curveRatio;
            const bezCurve = getBezCurveFunc(base, p1, p2, top);
            for (let t = 0; t <= 1; t += barkSpacing) {
                const scale = (1 - t) * .4 + .2;
                const pt = bezCurve(t);
                const firstVI = treeMesh.pos.length;
                const A = Math.cos(Math.PI / 3);
                const B = Math.sin(Math.PI / 3);
                treeMesh.pos.push(V(-1, +0, 1), V(-A, +B, 1), V(+A, +B, 1), V(+1, +0, 1), V(+A, -B, 1), V(-A, -B, 1), V(-1, +0, 0), V(-A, +B, 0), V(+A, +B, 0), V(+1, +0, 0), V(+A, -B, 0), V(-A, -B, 0));
                for (let vi = firstVI; vi < treeMesh.pos.length; vi++) {
                    J3.add(J3.scale(treeMesh.pos[vi], scale, false), pt, false);
                }
                const firstQI = treeMesh.quad.length;
                treeMesh.quad.push(V(0, 1, 6, 7), V(1, 2, 7, 8), V(2, 3, 8, 9), V(3, 4, 9, 10), V(4, 5, 10, 11), V(5, 0, 11, 6));
                assert(treeMesh.surfaceIds);
                let sid = treeMesh.surfaceIds.length;
                for (let qi = firstQI; qi < treeMesh.quad.length; qi++) {
                    treeMesh.quad[qi][0] += firstVI;
                    treeMesh.quad[qi][1] += firstVI;
                    treeMesh.quad[qi][2] += firstVI;
                    treeMesh.quad[qi][3] += firstVI;
                    treeMesh.surfaceIds.push(sid);
                    sid++;
                    treeMesh.colors.push(V(0, 0, 0));
                }
            }
        }
        function mkFrond(startP, endP, curveRatio = .3, leafSpacing = .02) {
            let leafLen = 1;
            const upOffset = curveRatio * J3.dist(startP, endP);
            let p1 = J3.add(J3.scale(startP, .9), J3.scale(endP, .1));
            p1[2] += upOffset;
            let p2 = J3.add(J3.scale(startP, .1), J3.scale(endP, .9));
            p2[2] += upOffset;
            const bezCurve = getBezCurveFunc(startP, p1, p2, endP);
            for (let t = 0; t <= 1; t += leafSpacing) {
                mkLeaf(bezCurve(t), leafLen);
            }
        }
        function mkLeaf(p, leafLen) {
            const firstVI = treeMesh.pos.length;
            treeMesh.pos.push(V(p[0] - .08, p[1], p[2]), V(p[0] + .08, p[1], p[2]), V(p[0], p[1], p[2] - leafLen));
            treeMesh.tri.push(V(firstVI + 1, firstVI, firstVI + 2));
            treeMesh.colors.push(V(.05 + (Math.random() * .1), .8 + (Math.random() * .5), .0));
            assert(treeMesh.surfaceIds);
            treeMesh.surfaceIds.push(treeMesh.surfaceIds[treeMesh.surfaceIds.length - 1] + 1);
        }
    }
    TreeBuilder.mkRandPalmTree = mkRandPalmTree;
    function getBezCurveFunc(p0, p1, p2, p3) {
        return function (t) {
            const t2 = t * t;
            const t3 = t2 * t;
            const scale0 = (-1 * t3 + 3 * t2 - 3 * t + 1);
            const scale1 = (3 * t3 - 6 * t2 + 3 * t);
            const scale2 = (-3 * t3 + 3 * t2);
            return J3.add(J3.add(J3.add(J3.scale(p0, scale0), J3.scale(p1, scale1)), J3.scale(p2, scale2)), J3.scale(p3, t3));
        };
    }
    TreeBuilder.getBezCurveFunc = getBezCurveFunc;
})(TreeBuilder || (TreeBuilder = {}));
//# sourceMappingURL=palm-tree.js.map