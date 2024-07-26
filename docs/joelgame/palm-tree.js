import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { V } from "../matrix/sprig-matrix.js";
import { PositionDef } from "../physics/transform.js";
import { RenderableConstructDef, RenderableDef } from "../render/renderer-ecs.js";
import { assert } from "../utils/util-no-import.js";
import { createEmptyMesh } from "../wood/wood.js";
import { J3 } from "./joel-game.js";
export const gameName = "Crimps Sharma - Dyno Master";
export var TreeBuilder;
(function (TreeBuilder) {
    // let waterMesh: Mesh;
    // export function changeWaterColor(color: V3, water: Mesh, water2: EntityW<[typeof RenderableDef]>){
    //     for(let i=0;i<water.colors.length;i++){
    //         water.colors[i] = J3.clone(color);
    //         color[0] += Math.random() * .05 -.025;
    //         color[1] += Math.random() * .05 -.025;
    //         color[2] += Math.random() * .05 -.025;
    //         if(color[0]>1) color[0] = 1;
    //         if(color[0]<0) color[0] = 0;
    //         if(color[1]>1) color[1] = 1;
    //         if(color[1]<0) color[1] = 0;
    //         if(color[2]>1) color[2] = 1;
    //         if(color[2]<0) color[2] = 0;
    //     }
    //     //push water colors to gpu
    //     // water.object.renderable.meshHandle.pool.updateMeshVertices(water.object.renderable.meshHandle,water.mesh);
    //     water2.renderable.meshHandle.pool.updateMeshVertices(water2.renderable.meshHandle,water);
    // }
    function mkWater(color = V(.086, .969, .925), size = 10000, zHt = .1, pos = V(0, 0, 0)) {
        const waterRaw = createEmptyMesh("water");
        waterRaw.surfaceIds = [];
        const waterMesh = waterRaw;
        waterMesh.usesProvoking = true;
        waterMesh.pos.push(V(size, size, zHt));
        waterMesh.pos.push(V(-1 * size, size, zHt));
        waterMesh.pos.push(V(-1 * size, -1 * size, zHt));
        waterMesh.pos.push(V(size, -1 * size, zHt));
        waterMesh.colors.push(color);
        waterMesh.quad.push(V(0, 1, 2, 3));
        waterMesh.surfaceIds.push(1);
        let water = EM.mk();
        EM.set(water, RenderableConstructDef, waterMesh);
        EM.set(water, PositionDef, pos);
    }
    TreeBuilder.mkWater = mkWater;
    function mkWater2(color = V(.086, .969, .925), size = 2000, increment = 20, zHt = .1, pos = V(0, 0, 0)) {
        const waterRaw = createEmptyMesh("water");
        waterRaw.surfaceIds = [];
        const waterMesh = waterRaw;
        waterMesh.usesProvoking = true;
        for (let y = -1 * size; y <= size; y += increment) {
            waterMesh.pos.push(V(-size, y, zHt));
            waterMesh.pos.push(V(size, y, zHt));
            if (y > -1 * size) {
                const end = waterMesh.pos.length - 1;
                waterMesh.quad.push(V(end, end - 1, end - 3, end - 2));
                waterMesh.colors.push(J3.clone(color));
                waterMesh.surfaceIds.push(1);
                color[0] += Math.random() * .05 - .025;
                color[1] += Math.random() * .05 - .025;
                color[2] += Math.random() * .05 - .025;
                if (color[0] > 1)
                    color[0] = 1;
                if (color[0] < 0)
                    color[0] = 0;
                if (color[1] > 1)
                    color[1] = 1;
                if (color[1] < 0)
                    color[1] = 0;
                if (color[2] > 1)
                    color[2] = 1;
                if (color[2] < 0)
                    color[2] = 0;
            }
        }
        const water = EM.mk();
        EM.set(water, RenderableConstructDef, waterMesh);
        EM.set(water, PositionDef, pos);
        // assert(RenderableDef.isOn(water1));
        // const water: EntityW<[typeof RenderableDef]> = water1;
        function changeWC(color) {
            for (let i = 0; i < waterMesh.colors.length; i++) {
                waterMesh.colors[i] = J3.clone(color);
                color[0] += Math.random() * .05 - .025;
                color[1] += Math.random() * .05 - .025;
                color[2] += Math.random() * .05 - .025;
                if (color[0] > 1)
                    color[0] = 1;
                if (color[0] < 0)
                    color[0] = 0;
                if (color[1] > 1)
                    color[1] = 1;
                if (color[1] < 0)
                    color[1] = 0;
                if (color[2] > 1)
                    color[2] = 1;
                if (color[2] < 0)
                    color[2] = 0;
            }
            if (RenderableDef.isOn(water)) {
                water.renderable.meshHandle.pool.updateMeshVertices(water.renderable.meshHandle, waterMesh);
            }
        }
        console.log("here");
        console.log("changeWC type: " + typeof changeWC);
        return changeWC;
    }
    TreeBuilder.mkWater2 = mkWater2;
    function mkIsland2(xWid = 40, yDep = 25, zHt = 3, pos = V(0, 0, 0), color = V(.7, .2, 0)) {
        const verts = [];
        for (let y = 0; y < yDep; y++) {
            const nextVerts = [];
            for (let x = 0; x < xWid; x++) {
                if (x === 0 || y === 0 || x === xWid - 1 || y === yDep - 1) {
                    nextVerts.push(V(x, y, 0));
                }
                else
                    nextVerts.push(V(x, y, zHt));
            }
            verts.push(nextVerts);
        }
        console.log("mkIsland2");
        verts[0][0][2] = -8;
        verts[0][verts[0].length - 1][2] = -7;
        verts[verts.length - 1][0][2] = -6;
        verts[verts.length - 1][verts[0].length - 1][2] = -7;
        const curveRate = .8;
        for (let y = 1; y < verts.length / 2; y++) {
            const y2 = verts.length - 1 - y;
            verts[y][0][2] = (verts[y - 1][0][2]) * curveRate;
            verts[y][verts[0].length - 1][2] = (verts[y - 1][verts[0].length - 1][2]) * curveRate;
            verts[y2][0][2] = (verts[y2 + 1][0][2]) * curveRate;
            verts[y2][verts[0].length - 1][2] = (verts[y2 + 1][verts[0].length - 1][2]) * curveRate;
        }
        for (let x = 1; x < verts[0].length / 2; x++) {
            const x2 = verts[0].length - 1 - x;
            verts[0][x][2] = (verts[0][x - 1][2]) * curveRate;
            verts[verts.length - 1][x][2] = (verts[verts.length - 1][x - 1][2]) * curveRate;
            verts[0][x2][2] = (verts[0][x2 + 1][2]) * curveRate;
            verts[verts.length - 1][x2][2] = (verts[verts.length - 1][x2 + 1][2]) * curveRate;
        }
        for (let y = 1; y < verts.length / 2; y++) {
            const y2 = verts.length - 1 - y;
            for (let x = 1; x < verts[0].length / 2; x++) {
                const x2 = verts[0].length - 1 - x;
                htUpdate(y, x);
                htUpdate(y, x2);
                htUpdate(y2, x2);
                htUpdate(y2, x);
            }
        }
        const mesh = createEmptyMesh("island");
        mesh.surfaceIds = [];
        const islandMesh = mesh;
        islandMesh.usesProvoking = true;
        for (let y = 0; y < verts.length; y++) {
            for (let x = 0; x < verts[0].length; x++) {
                islandMesh.pos.push(verts[y][x]);
                if (y > 0 && x > 0) {
                    const vtl = (y - 1) * verts[0].length + x - 1;
                    const vtr = (y - 1) * verts[0].length + x;
                    const vbr = y * verts[0].length + x;
                    const vbl = y * verts[0].length + x - 1;
                    islandMesh.tri.push(V(vtl, vtr, vbr), V(vtl, vbr, vbl));
                }
            }
        }
        for (let i = 0; i < islandMesh.tri.length; i++) {
            color[0] += Math.random() * .01 - .005;
            color[1] += Math.random() * .01 - .005;
            color[2] += Math.random() * .01 - .005;
            const nextColor = J3.clone(color);
            islandMesh.colors.push(nextColor);
            islandMesh.surfaceIds.push(1);
        }
        const island = EM.mk();
        EM.set(island, RenderableConstructDef, islandMesh);
        EM.set(island, PositionDef, pos);
        console.log("island 2");
        function htUpdate(y, x) {
            let z = verts[y][x][2];
            if (y > 0)
                z = Math.min(z, verts[y - 1][x][2] + 1);
            if (y < verts.length - 1)
                z = Math.min(z, verts[y + 1][x][2] + 1);
            if (x > 0)
                z = Math.min(z, verts[y][x - 1][2] + 1);
            if (x < verts[0].length - 1)
                z = Math.min(z, verts[y][x + 1][2] + 1);
            z -= Math.random() * .1;
            verts[y][x][2] = z;
        }
        function updateIslandPos(pos) {
            assert(PositionDef.isOn(island));
            island.position = pos;
        }
        return updateIslandPos;
    }
    TreeBuilder.mkIsland2 = mkIsland2;
    function mkIsland(wallWidth = 20, islandXRunby = 5, islandDepth = 12, wallGroundY = 2, islandHeight = 1.5, islandColor = V(.7, .2, .01)) {
        const mesh = createEmptyMesh("island");
        mesh.surfaceIds = [];
        const islandMesh = mesh;
        islandMesh.usesProvoking = true;
        const zStart = -.3;
        const zMax = islandHeight;
        let z = zStart;
        const zRamp = 3;
        const zIncrement = (zMax - zStart) / zRamp;
        let xEnd = wallWidth / 2 + islandXRunby;
        let xStart = xEnd * -1;
        let endOffset = 0;
        let frontStart = -1;
        let frontEnd = -1;
        let backStart = -1;
        let backEnd = -1;
        const backTempArr = [];
        for (let y = 0; y < islandDepth / 2; y++) {
            if (y > islandDepth / 2 - 3) {
                xStart += 2;
                xEnd -= 2;
                endOffset += 2;
            }
            let vi = islandMesh.pos.length;
            for (let x = xStart; x <= xEnd; x++) {
                islandMesh.pos.push(V(x, y, z + (Math.random() * .3)));
                if (y !== 0)
                    backTempArr.push(V(x, y * -1, z + (Math.random() * .3)));
                if (x < xStart + zRamp)
                    z += zIncrement;
                if (x >= xEnd - zRamp)
                    z -= zIncrement;
            }
            if (y === 0) {
                frontStart = 0;
                backStart = 0;
                frontEnd = islandMesh.pos.length - 1;
                backEnd = frontEnd;
            }
            else {
                let frontIndex = frontStart;
                for (let v = vi; v < islandMesh.pos.length; v++) {
                    if (v === vi && endOffset > 0) {
                        while (frontIndex < frontStart + endOffset) {
                            islandMesh.tri.push(V(frontIndex + 1, frontIndex, v));
                            frontIndex++;
                        }
                    }
                    if (v < islandMesh.pos.length - 1) {
                        islandMesh.tri.push(V(frontIndex, v, v + 1), V(frontIndex + 1, frontIndex, v));
                        frontIndex++;
                    }
                    else {
                        while (frontIndex < frontEnd) {
                            islandMesh.tri.push(V(frontIndex + 1, frontIndex, v));
                            frontIndex++;
                        }
                    }
                }
            }
        }
        for (let i = 0; i < islandMesh.tri.length; i++) {
            const color = J3.clone(islandColor);
            color[0] += Math.random() * .1;
            color[1] += Math.random() * .1;
            color[2] += Math.random() * .1;
            islandMesh.colors.push(color);
            islandMesh.surfaceIds.push(1);
        }
        const island = EM.mk();
        EM.set(island, RenderableConstructDef, islandMesh);
        EM.set(island, PositionDef, V(0, 0, 0));
        console.log("island");
    }
    TreeBuilder.mkIsland = mkIsland;
    function mkRandPalmTree(base, height = 13, hasNuts = Math.random() > .1) {
        const treeMesh = createEmptyMesh("palmTree");
        treeMesh.surfaceIds = [];
        let top = V(0, 0, 0);
        top[0] = base[0] + Math.random() * 5 - 2.5;
        top[1] = base[1] + Math.random() * 5 - 2.5;
        top[2] = base[2] + Math.random() * 4 - 1.5 + height;
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
        function mkTrunk(base, top, barkSpacing = .024, curveRatio = .1) {
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