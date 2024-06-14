import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { V, V3, mat4, quat } from "../matrix/sprig-matrix.js";
import { HexMesh } from "../meshes/mesh-list.js";
import { Mesh, RawMesh, transformMesh } from "../meshes/mesh.js";
import { mkCubeMesh, mkTriangle } from "../meshes/primatives.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { createEmptyMesh } from "../wood/wood.js";
import { J3 } from "./joel-game.js";

export module AssetBuilder{
    export function mkRandPalmTree(base: V3, hasNuts:boolean = Math.random() > .18){
        const treeMesh = createEmptyMesh("palmTree");
        let top = V(0,0,0);
        top[0] = base[0] + Math.random()*6 - 3;
        top[1] = base[1] + Math.random()*6 - 3;
        top[2] = base[2] + Math.random()*4 + 8.5;
        let trunkTop = J3.clone(top);
        trunkTop[2] -= .7;
        mkTrunk(treeMesh, base, trunkTop);
        mkFrond(treeMesh, top, V(Math.random()*1+4.5+top[0],Math.random()*1-.5+top[1],Math.random()*4-2.2+top[2]), Math.random()*.1+.25);
        mkFrond(treeMesh, top, V(Math.random()*1+3.5+top[0],Math.random()*1+1.5+top[1],Math.random()*4-2.2+top[2]), Math.random()*.1+.25);
        mkFrond(treeMesh, top, V(Math.random()*1-4.5+top[0],Math.random()*1-3.5+top[1],Math.random()*4-2.2+top[2]), Math.random()*.1+.25);
        mkFrond(treeMesh, top, V(Math.random()*1-5.3+top[0],Math.random()*1-.5+top[1],Math.random()*4-2.2+top[2]), Math.random()*.1+.25);
        if(hasNuts) mkNuts(treeMesh, top);
    }
    // export function mkPalmTree(treeMesh: RawMesh, top: V3 = V(0,-10,10),base: V3 = V(1,-8.5,0)){
    //     let trunkTop = J3.clone(top);
    //     trunkTop[2] -= .7;
    //     mkTrunk(treeMesh, base, trunkTop);
    //     mkFrond(treeMesh, top, V(5,-11,9));
    //     mkFrond(treeMesh, top, V(4,-8,8.8));
    //     mkFrond(treeMesh, top, V(-4,-13,9.7));
    //     mkFrond(treeMesh, top, V(-4.8,-10,10.1));
    //     mkNuts(treeMesh, top);
    // }
    export function mkNuts(treeMesh: RawMesh, p: V3){
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
        mkNut(treeMesh, p1);
        mkNut(treeMesh, p2);
        mkNut(treeMesh, p3);
    }
    export function mkNut(treeMesh: RawMesh, p: V3){
        const scale = .28;
        let nut = EM.mk();
        transformMesh(mkCubeMesh(), mat4.fromRotationTranslationScale(quat.IDENTITY, p, [scale, scale, scale]))
        EM.set(nut, RenderableConstructDef, mkCubeMesh());
        EM.set(nut,ScaleDef,V(scale,scale,scale));
        EM.set(nut, PositionDef, p)
        EM.set(nut, ColorDef, ENDESGA16.darkBrown);
    }
    export function mkTrunk(
        mesh: RawMesh, base: V3, top: V3, barkSpacing: number = .03, curveRatio: number = .1,
    ){
        const xLean = base[0] - top[0];
        const yLean = base[1] - top[1];
        const treeLen = J3.dist(base,top);


        let p1 = J3.add(J3.scale(base,.9),J3.scale(top,.1));
        p1[0] += xLean * treeLen * curveRatio;
        p1[1] += yLean * treeLen * curveRatio;
        let p2 = J3.add(J3.scale(base,.1),J3.scale(top,.9));
        p2[0] += xLean * treeLen * curveRatio;
        p2[1] += yLean * treeLen * curveRatio;

        const bezCurve = getBezCurveFunc(base,p1,p2,top);

        for(let t = 0; t <= 1; t += barkSpacing){
            const scale = (1-t) * .4 + .2;
            const pt = bezCurve(t);
            const bark = EM.mk();
            EM.set(bark, RenderableConstructDef, HexMesh);
            EM.set(bark,ScaleDef,V(scale,scale,scale));
            EM.set(bark, PositionDef, pt)
            EM.set(bark, ColorDef, ENDESGA16.lightBrown);
            // EM.set(bark, RotationDef, quat.fromYawPitchRoll(0, 0, Math.PI));
        }
    }
    export function mkFrond(treeMesh: RawMesh, startP: V3, endP: V3, curveRatio:number = .3, leafSpacing:number = .02){
        let leafLen = 1;
        const upOffset = curveRatio * J3.dist(startP,endP)
        let p1 = J3.add(J3.scale(startP,.9),J3.scale(endP,.1));
        p1[2]+= upOffset;
        let p2 = J3.add(J3.scale(startP,.1),J3.scale(endP,.9));
        p2[2]+= upOffset;
        const bezCurve = getBezCurveFunc(startP,p1,p2,endP);
        
        for(let t = 0; t <= 1; t += leafSpacing){
            const pt = bezCurve(t);
            const leaf = EM.mk();
            EM.set(leaf, RenderableConstructDef, mkLeaf());
            EM.set(leaf,ScaleDef,V(leafLen,leafLen,leafLen));
            EM.set(leaf, PositionDef, pt)
            EM.set(leaf, ColorDef, ENDESGA16.lightGreen);
            EM.set(leaf, RotationDef, quat.fromYawPitchRoll(0, 0, Math.PI));
        }
        
    }
    export const mkLeaf: () => Mesh = () => ({
        dbgName: "leaf",
        pos: [V(0, 0, 0), V(.1, 0, 0), V(0, 0, 1)],
        tri: [V(0, 1, 2), V(2, 1, 0)],
        quad: [],
        lines: [],
        colors: [V(0, 0, 0), V(0, 0, 0)],
        surfaceIds: [1, 2],
        usesProvoking: true,
      });

    export function getBezCurveFunc(p0: V3, p1: V3, p2: V3, p3: V3): (t: number) => V3{
        return function (t: number): V3{
            const t2 = t*t;
            const t3 = t2*t;
            const scale0 = (-1 * t3 + 3 * t2 - 3 * t + 1);
            const scale1 = (3 * t3 - 6 * t2 + 3 * t);
            const scale2 = (-3 * t3 + 3 * t2);
            return J3.add(J3.add(J3.add(J3.scale(p0,scale0),J3.scale(p1,scale1)),J3.scale(p2,scale2)),J3.scale(p3,t3));
        }
    }
}