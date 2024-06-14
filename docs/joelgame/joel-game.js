import { CameraDef, CameraFollowDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { V, V3, quat } from "../matrix/sprig-matrix.js";
import { CubeMesh, PlaneMesh, TetraMesh } from "../meshes/mesh-list.js";
import { makeDome, mkCubeMesh, mkRectMesh } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { GRID_MASK, SKY_MASK } from "../render/pipeline-masks.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import { linePipe, pointPipe, } from "../render/pipelines/std-line.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef, RenderableDef } from "../render/renderer-ecs.js";
import { sketchLine } from "../utils/sketch.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { createObj } from "../ecs/em-objects.js";
import { createSun, initGhost } from "../graybox/graybox-helpers.js";
import { Phase } from "../ecs/sys-phase.js";
import { InputsDef } from "../input/inputs.js";
import { buildFreqDataArray, configureAnalyser, createAudioGraph } from "./audio-code.js";
import { skyPipeline } from "../render/pipelines/std-sky.js";
import { AssetBuilder } from "./palm-tree.js";
const DBG_GHOST = false;
const DEBUG = false;
// tmpStack()
function assert(condition, msg) {
    if (!condition)
        throw new Error(msg ?? "Assertion failed (consider adding a helpful msg).");
}
export var J3;
(function (J3) {
    function add(vA, vB, newVector = true) {
        const vOut = newVector ? V3.mk() : vA;
        vOut[0] = vA[0] + vB[0];
        vOut[1] = vA[1] + vB[1];
        vOut[2] = vA[2] + vB[2];
        return vOut;
    }
    J3.add = add;
    function sub(vA, vB, newVector = true) {
        const vOut = newVector ? V3.mk() : vA;
        vOut[0] = vA[0] - vB[0];
        vOut[1] = vA[1] - vB[1];
        vOut[2] = vA[2] - vB[2];
        return vOut;
    }
    J3.sub = sub;
    function scale(vA, scale, newVector = true) {
        const vOut = newVector ? V3.mk() : vA;
        vOut[0] = vA[0] * scale;
        vOut[1] = vA[1] * scale;
        vOut[2] = vA[2] * scale;
        return vOut;
    }
    J3.scale = scale;
    function norm(v, newVector = true) {
        const vOut = newVector ? V3.mk() : v;
        let x = v[0];
        let y = v[1];
        let z = v[2];
        let len = x * x + y * y + z * z;
        if (len > 0) {
            len = 1 / Math.sqrt(len);
        }
        vOut[0] = v[0] * len;
        vOut[1] = v[1] * len;
        vOut[2] = v[2] * len;
        return vOut;
    }
    J3.norm = norm;
    function clone(v) {
        return V(v[0], v[1], v[2]);
    }
    J3.clone = clone;
    function dist(vA, vB) {
        const x = vA[0] - vB[0];
        const y = vA[1] - vB[1];
        const z = vA[2] - vB[2];
        return Math.sqrt(x * x + y * y + z * z);
    }
    J3.dist = dist;
    function copy(to, from) {
        to[0] = from[0];
        to[1] = from[1];
        to[2] = from[2];
    }
    J3.copy = copy;
    function len(v) {
        return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    }
    J3.len = len;
})(J3 || (J3 = {}));
export async function initJoelGame() {
    stdGridRender.fragOverrides.lineSpacing1 = 8.0;
    stdGridRender.fragOverrides.lineWidth1 = 0.05;
    stdGridRender.fragOverrides.lineSpacing2 = 256;
    stdGridRender.fragOverrides.lineWidth2 = 0.2;
    stdGridRender.fragOverrides.ringStart = 512;
    stdGridRender.fragOverrides.ringWidth = 0;
    EM.addEagerInit([], [RendererDef], [], (res) => {
        // renderer
        res.renderer.pipelines = [
            ...shadowPipelines,
            stdMeshPipe,
            outlineRender,
            deferredPipeline,
            pointPipe,
            linePipe,
            // stdGridRender,
            skyPipeline,
            postProcess,
        ];
    });
    const { camera, me } = await EM.whenResources(CameraDef, MeDef);
    // camera
    camera.fov = Math.PI * 0.5;
    camera.viewDist = 1000;
    V3.set(-200, -200, -200, camera.maxWorldAABB.min);
    V3.set(+200, +200, +200, camera.maxWorldAABB.max);
    //camera.
    // sun
    createSun();
    // grid
    const gridDef = [RenderableConstructDef, PositionDef, ScaleDef, ColorDef];
    const grid = createObj(gridDef, {
        renderableConstruct: [PlaneMesh, true, undefined, GRID_MASK],
        position: [0, 0, 0],
        scale: [2 * camera.viewDist, 2 * camera.viewDist, 1],
        // color: [0, 0.5, 0.5],
        color: [0.5, 0.5, 0.5],
        // color: [1, 1, 1],
    });
    const SKY_HALFSIZE = 1000;
    const domeMesh = makeDome(16, 8, SKY_HALFSIZE);
    const sky = EM.mk();
    EM.set(sky, PositionDef, V(0, 0, -100));
    const skyMesh = domeMesh;
    EM.set(sky, RenderableConstructDef, skyMesh, undefined, undefined, SKY_MASK);
    const world = {
        wallHeight: 40,
        wallWidth: 20,
        CLUSTER_VERT_OFFSET: 3,
        CLUSTER_VERT_VAR: 5,
        CLUSTER_SIZE: 4,
        hasTrees: true,
    };
    // const wallHeight = 40;
    // const wallWidth = 20;
    // const CLUSTER_VERT_OFFSET = 3;
    // const CLUSTER_VERT_VAR = 5;
    // const CLUSTER_SIZE = 4;
    // function mkTriMesh(va: V3, vb: V3, vc: V3): Mesh{
    //   let result: Mesh = {
    //     dbgName: "flatTri",
    //     pos: [va,vb,vc],
    //     tri:[
    //       V(0,1,2)
    //     ],
    //     quad: [],
    //     colors: [ENDESGA16.lightBlue],
    //     surfaceIds: [1],
    //     usesProvoking: true
    //   }
    //   return result;
    // }
    // function mkRectMesh(xLen: number, yLen: number, zLen: number): Mesh {
    //   let hx = xLen / 2;
    //   let hy = yLen / 2;
    //   let hz = zLen / 2;
    //   let result: Mesh = {
    //     dbgName: "rect",
    //     pos: [
    //       V(+hx, +hy, +hz),
    //       V(-hx, +hy, +hz),
    //       V(-hx, -hy, +hz),
    //       V(+hx, -hy, +hz),
    //       V(+hx, +hy, -hz),
    //       V(-hx, +hy, -hz),
    //       V(-hx, -hy, -hz),
    //       V(+hx, -hy, -hz),
    //     ],
    //     tri: [],
    //     quad: [
    //       // +Z
    //       V(0, 1, 2, 3),
    //       // +Y
    //       V(4, 5, 1, 0),
    //       // +X
    //       V(3, 7, 4, 0),
    //       // -X
    //       V(2, 1, 5, 6),
    //       // -Y
    //       V(6, 7, 3, 2),
    //       // -Z
    //       V(5, 4, 7, 6),
    //     ],
    //     colors: [
    //       V(0, 0, 0),
    //       V(0, 0, 0),
    //       V(0, 0, 0),
    //       V(0, 0, 0),
    //       V(0, 0, 0),
    //       V(0, 0, 0),
    //     ],
    //     surfaceIds: [1, 2, 3, 4, 5, 6],
    //     usesProvoking: true,
    //   };
    //   return result;
    // }
    //build wall
    const wall = EM.mk();
    EM.set(wall, RenderableConstructDef, mkRectMesh(world.wallWidth, 3, world.wallHeight));
    EM.set(wall, ColorDef, ENDESGA16.darkBrown);
    EM.set(wall, PositionDef, V(0, 1.5, world.wallHeight / 2));
    EM.set(wall, RotationDef, quat.fromYawPitchRoll(0, Math.PI * .1, 0));
    // const wall2 = await EM.whenEntityHas(wall, RenderableDef);
    // wall2.renderable.meshHandle.pool.updateMeshVertices();
    //generate cluster locations:
    const clusters = generateClusters();
    function generateClusters() {
        let clusters = [];
        let hor = Math.random() * (world.wallWidth - 3) - (world.wallWidth - 3) / 2;
        let vert = 5;
        let dep = (vert - (world.wallHeight / 2));
        clusters.push(V(hor, dep, vert));
        while (clusters[clusters.length - 1][2] < world.wallHeight - 10) {
            hor = Math.random() * (world.wallWidth - 5) - (world.wallWidth - 5) / 2;
            vert = Math.random() * world.CLUSTER_VERT_VAR + clusters[clusters.length - 1][2] + world.CLUSTER_VERT_OFFSET;
            dep = (vert - (world.wallHeight / 2)) * -.33;
            clusters.push(V(hor, dep, vert));
        }
        return clusters;
    }
    const holds = generateHolds();
    function generateHolds() {
        const holds = [];
        for (let i = 0; i < clusters.length; i++) {
            const cluster = clusters[i];
            do {
                const hold = EM.mk();
                EM.set(hold, RenderableConstructDef, TetraMesh);
                EM.set(hold, ColorDef, ENDESGA16.red);
                const hor = Math.random() * world.CLUSTER_SIZE + cluster[0] - world.CLUSTER_SIZE / 2;
                const vert = Math.random() * world.CLUSTER_SIZE + cluster[2] - world.CLUSTER_SIZE / 2;
                const dep = (vert - (world.wallHeight / 2)) * -.33;
                EM.set(hold, PositionDef, V(hor, dep, vert));
                EM.set(hold, RotationDef, quat.fromYawPitchRoll(0, Math.PI * .6, 0));
                quat.yaw(hold.rotation, Math.random() * 3, hold.rotation);
                EM.set(hold, ScaleDef, V(Math.random() + .5, Math.random() + .5, Math.random() + .5));
                holds.push(hold);
                if (i === clusters.length - 1) {
                    EM.set(hold, ColorDef, ENDESGA16.lightGreen);
                    break;
                }
            } while (Math.random() < .6);
        }
        return holds;
    }
    //get hold catch points
    // to do add to data:
    const holdCatchPoints = getHoldCatchPoints();
    function getHoldCatchPoints() {
        let catchPoints = [];
        for (const hold of holds) {
            catchPoints.push(V(hold.position[0], hold.position[1] - 2, hold.position[2]));
        }
        return catchPoints;
    }
    if (world.hasTrees) {
        AssetBuilder.mkRandPalmTree(V(Math.random() * 3 + world.wallWidth * -.5 - 4, 0, 0));
    }
    // if(world.hasTrees && Math.random()>.8){
    //   AssetBuilder.mkRandPalmTree(V(Math.random() * 3 + world.wallWidth * -.5 - 4,0,0));
    // }
    if (world.hasTrees) {
        AssetBuilder.mkRandPalmTree(V(Math.random() * 3 + world.wallWidth * .5 + 1, 0, 0));
    }
    // if(Math.random()>.8){
    //   AssetBuilder.mkRandPalmTree(V(Math.random() * 3 + world.wallWidth * .5 + 1,0,0));
    // }
    // AssetBuilder.mkRandPalmTree(V(world.wallWidth * -.5 - 3,0,0));
    // AssetBuilder.mkRandPalmTree(V(world.wallWidth * .5 + 3,0,0));
    // AssetBuilder.mkPalmTree();
    // AssetBuilder.mkFrond(V(0,-10,6), V(5,-11,5));
    // AssetBuilder.mkFrond(V(0,-10,6), V(4,-8,4.8));
    // AssetBuilder.mkFrond(V(0,-10,6), V(-4,-13,5.7));
    // AssetBuilder.mkFrond(V(0,-10,6), V(-4.8,-10,6.1));
    // for(let i=0;i<11;i++){
    //   const hold = EM.mk();
    //   EM.set(hold, RenderableConstructDef, TetraMesh);
    //   EM.set(hold, ColorDef, ENDESGA16.red);
    //   const hor = Math.random()* (wallWidth-3) - (wallWidth-3)/2;
    //   const vert = Math.random()*(wallHeight-4)+2;
    //   const dep = (vert-(wallHeight/2))*-.33;
    //   EM.set(hold, PositionDef, V(hor, dep ,vert));
    //   // EM.set(hold, RotationDef, quat.fromYawPitchRoll(0, 0, Math.random() * 3));
    //   EM.set(hold, RotationDef, quat.fromYawPitchRoll(0, Math.PI*.6, 0));
    //   quat.yaw(hold.rotation, Math.random() * 3, hold.rotation);
    //   // EM.set(hold,RotationDef, quat.fromYawPitchRoll(Math.random()-.5,Math.PI*.6,Math.random()-.5));
    //   EM.set(hold, ScaleDef, V(Math.random()+.5,Math.random()+.5,Math.random()+.5))
    //   holds.push(hold)
    // }
    //generate guy
    const GUY_SCALE = .75;
    const GUY_LH_ZERO = V(4.2, 0, -5);
    let GUY_LH_START = V(holds[0].position[0], holds[0].position[1] - 2, holds[0].position[2]);
    // GUY_LH_START[1] -= 3;
    const GUY_OFFSET = J3.add(GUY_LH_START, GUY_LH_ZERO);
    function mkEntity(mesh, position, scale, color) {
        let ent = EM.mk();
        EM.set(ent, RenderableConstructDef, mesh);
        EM.set(ent, ColorDef, color);
        EM.set(ent, PositionDef, position);
        EM.set(ent, ScaleDef, V(scale, scale, scale));
        return ent;
    }
    function mkGrayCube(position, scale) {
        return mkEntity(mkCubeMesh(), J3.scale(position, GUY_SCALE, false), scale * GUY_SCALE, ENDESGA16.darkGray);
    }
    function mkPoint(e, fixed) {
        return {
            // position: J3.clone(e.position), 
            position: e.position,
            prevPosition: J3.clone(e.position),
            object: e,
            fixed: fixed
        };
    }
    function mkGCPoint(position, scale = .2, fixed = false) {
        return mkPoint(mkGrayCube(J3.add(position, GUY_OFFSET, false), scale), fixed);
    }
    function mkPointNoObject(position, fixed = false) {
        return {
            position: J3.clone(position),
            prevPosition: position,
            fixed: fixed
        };
    }
    function mkWaterGrid(xWid, yDep, increment, yStart, xStart, zPos = 0) {
        const xNum = Math.floor(xWid / increment);
        const yNum = Math.floor(yDep / increment);
        const waterArr = [];
        for (let y = 0; y <= yNum; y++) {
            waterArr.push([]);
            for (let x = 0; x <= xNum; x++) {
                waterArr[y].push(mkPointNoObject(V(xStart + increment * x, yStart + increment * y, zPos)));
                // waterArr[y].push(mkPoint(mkEntity(mkCubeMesh(),V(xStart + increment * x, yStart + increment * y, zPos),2.5,ENDESGA16.lightBlue),false));
                // if (x%5 === 0) waterArr[y][x].fixed = true;
            }
            // waterArr[y][0].fixed = true;
            // waterArr[y][xNum].fixed = true;
        }
        waterArr[0][0].fixed = true;
        waterArr[0][xNum].fixed = true;
        waterArr[yNum][0].fixed = true;
        waterArr[yNum][xNum].fixed = true;
        return waterArr;
    }
    // _stk.pop();
    function mkWaterSticks(waterArr) {
        const sticks = [];
        for (let y = 0; y < waterArr.length; y++) {
            for (let x = 0; x < waterArr[0].length; x++) {
                if (y !== 0)
                    sticks.push(mkStick(waterArr[y][x], waterArr[y - 1][x]));
                if (x !== 0)
                    sticks.push(mkStick(waterArr[y][x], waterArr[y][x - 1]));
            }
        }
        return sticks;
    }
    // _stk.pop();
    function addSlack(points, slackAmt) {
        slackAmt /= points[0].length;
        for (let y = 0; y < points.length; y++) {
            for (let x = 0; x < points[0].length; x++) {
                const point = points[y][x];
                point.position[0] -= slackAmt * x;
                point.prevPosition[0] -= slackAmt * x;
                // point.object.position[0] -= slackAmt * x;
            }
        }
    }
    // to do: move lower to update variables
    // function generateWave(waterArr: Point[][], sineMax: number, sineMin: number, sinePos: number, sineUp: boolean, sineRatio: number): number{
    //   if(sineUp){
    //     sinePos += (sineMax - sinePos) * sineRatio;
    //     if(sinePos > sineMax - .01){
    //       // to do: update external sineUp boolean
    //       sineUp = true;
    //     }
    //   }
    //   else{
    //     sinePos -= (sinePos - sineMin) * sineRatio;
    //     if(sinePos < sineMin + .01){
    //       // to do: update external sineUp boolean
    //       sineUp = true;
    //     }
    //   }
    //   for(let y = 0; y < waterArr.length; y++){}
    //   return sinePos;
    // }
    //stuff for refac:
    // const myData = {
    //   points: [
    //     {offset: V(-4.2,0,5), scale: 3, fixed: true}, // lh
    //     {offset: V(-4.2,0,5), }, // ls
    //     {offset: V(-4.2,0,5), },
    //     {offset: V(-4.2,0,5), },
    //   ],
    //   sticks: [
    //     [0, 1], // lh to ls
    //     [1, 2],
    //     [0, 2]
    //   ]
    // }
    let bodyPoints = [];
    //left hand
    let lh = mkGCPoint(V(-4.2, 0, 5.2), .2, true);
    bodyPoints.push(lh);
    //left elbow
    let le = mkGCPoint(V(-4.2, 0, 4.6), .05);
    bodyPoints.push(le);
    //left shoulder
    let ls = mkGCPoint(V(-4.2, 0, 4));
    bodyPoints.push(ls);
    //right hand
    let rh = mkGCPoint(V(-3.2, 0, 2.8));
    bodyPoints.push(rh);
    //right elbow
    let re = mkGCPoint(V(-3.2, 0, 3.4), .05);
    bodyPoints.push(re);
    //right shoulder
    let rs = mkGCPoint(V(-3.2, 0, 4), .2, false);
    bodyPoints.push(rs);
    //sternum
    let sternum = mkGCPoint(V(-3.7, 0, 3.9), .002, false);
    bodyPoints.push(sternum);
    //head
    let head = mkGCPoint(V(-3.7, 0, 4.5), .4, false);
    bodyPoints.push(head);
    //pelvis
    let pelvis = mkGCPoint(V(-3.7, 0, 2.8), .2, false);
    bodyPoints.push(pelvis);
    //left hip
    let lHip = mkGCPoint(V(-4, 0, 2.7), .2, false);
    bodyPoints.push(lHip);
    //right hip
    let rHip = mkGCPoint(V(-3.4, 0, 2.7), .2, false);
    bodyPoints.push(rHip);
    //left foot
    let lf = mkGCPoint(V(-4, 0, 1.3), .2, false);
    bodyPoints.push(lf);
    //right foot
    let rf = mkGCPoint(V(-3.4, 0, 1.3), .2, false);
    bodyPoints.push(rf);
    //right knee
    let rk = mkGCPoint(V(-3.4, 0, 2), .05, false);
    bodyPoints.push(rk);
    // left knee
    let lk = mkGCPoint(V(-4, 0, 2), .05, false);
    bodyPoints.push(lk);
    function mkStick(pointA, pointB) {
        return { pointA, pointB, length: J3.dist(pointA.position, pointB.position) };
    }
    let sticks = [
        mkStick(lh, le),
        mkStick(le, ls),
        mkStick(re, rs),
        mkStick(rh, re),
        mkStick(ls, rs),
        mkStick(ls, sternum),
        mkStick(rs, sternum),
        mkStick(head, sternum),
        mkStick(head, rs),
        mkStick(head, ls),
        mkStick(pelvis, sternum),
        mkStick(pelvis, rs),
        mkStick(pelvis, ls),
        mkStick(pelvis, rHip),
        mkStick(pelvis, lHip),
        mkStick(rHip, lHip),
        // mkStick(rHip,rf),
        // mkStick(lHip,lf),
        mkStick(rHip, rk),
        mkStick(rk, rf),
        mkStick(lHip, lk),
        mkStick(lk, lf),
        mkStick(head, pelvis)
    ];
    const WATER_WIDTH = 1000;
    const WATER_DEPTH = 600;
    const WATER_HEIGHT = .7;
    const WATER_INCREMENT = 50;
    const waterArr = mkWaterGrid(WATER_WIDTH, WATER_DEPTH, WATER_INCREMENT, -1 * (WATER_DEPTH / 6), -1 * (WATER_WIDTH / 2), WATER_HEIGHT);
    const WATER_X_POINTS = waterArr[0].length;
    const SINE_HEIGHT = 6;
    // const wave = {
    //   sinePos: waterArr[0][0].position[2],
    //     sineMax: waterArr[0][0].position[2] + SINE_HEIGHT,
    //     sineMin: waterArr[0][0].position[2] - SINE_HEIGHT,
    //     sineRatio: .1,
    //     sineUp: true
    // }
    // const waterObject = EM.mk();
    // EM.set(waterObject,)
    const waterMesh = mkWaterMesh(waterArr);
    const waterTemp = mkEntity(waterMesh, V(0, 0, 0), 1, ENDESGA16.lightBlue);
    const waterObject = await EM.whenEntityHas(waterTemp, RenderableDef);
    const water = {
        points: waterArr,
        sticks: mkWaterSticks(waterArr),
        object: waterObject,
        mesh: waterMesh,
        wave: {
            sinePos: waterArr[0][0].position[2],
            sineMax: waterArr[0][0].position[2] + SINE_HEIGHT,
            sineMin: waterArr[0][0].position[2] - SINE_HEIGHT,
            sineRatio: .03,
            sineUp: true,
            point: waterArr[Math.floor(waterArr.length / 2) + 6][Math.floor(waterArr[0].length / 2)]
        }
    };
    function mkWaterMesh(waterPoints) {
        const verts = [];
        const ids = [];
        let id = 0;
        let tri = [];
        const colors = [];
        let curPoint = 0;
        for (let i = 0; i < waterPoints.length; i++) {
            for (let j = 0; j < waterPoints[0].length; j++) {
                verts.push(J3.clone(waterPoints[i][j].position));
                if (i > 0 && j > 0) {
                    tri.push(V(curPoint, curPoint - WATER_X_POINTS - 1, curPoint - WATER_X_POINTS));
                    ids.push(id);
                    id++;
                    colors.push(V(0, 0, 0));
                    tri.push(V(curPoint, curPoint - 1, curPoint - WATER_X_POINTS - 1));
                    ids.push(id);
                    id++;
                    colors.push(V(0, 0, 0));
                }
                curPoint++;
            }
        }
        const mesh = {
            dbgName: "water",
            pos: verts,
            tri,
            quad: [],
            colors,
            surfaceIds: ids,
            usesProvoking: true
        };
        return mesh;
    }
    function generateWave(water) {
        if (water.wave.sineUp) {
            water.wave.sinePos += (water.wave.sineMax - water.wave.sinePos) * water.wave.sineRatio;
            if (water.wave.sinePos > water.wave.sineMax - .08) {
                water.wave.sineUp = false;
            }
        }
        else {
            water.wave.sinePos -= (water.wave.sinePos - water.wave.sineMin) * water.wave.sineRatio;
            if (water.wave.sinePos < water.wave.sineMin + .1) {
                water.wave.sineUp = true;
            }
        }
        water.wave.point.position[2] = water.wave.sinePos;
    }
    // const waterMesh = mkWaterMesh(waterArr);
    // addSlack(water.points, .1);
    // fix waive point
    water.wave.point.fixed = true;
    let audioElement;
    //  = new Audio("/Users/joelsheppard/vscode/Web-Dev/sprig/sprig/src/joelgame/audio-files/techno2.mp3")
    let audioGraph;
    let freqDataArr;
    let audioVisualiserArr;
    //  = createAudioGraph(AUDIO_ELEMENT , false, true);
    // assert(audioGraph.analyser);
    // configureAnalyser(audioGraph.analyser,32,-40,0,0);
    // const freqDataArr = buildFreqDataArray(audioGraph.analyser);
    function buildFreqAmpVisualiser(bands, xStart = 0, yStart = 0, zStart = 0, color = ENDESGA16.darkRed) {
        const arr = [];
        const scale = 2;
        for (let i = 0; i < bands; i++) {
            arr.push(mkPoint(mkEntity(mkCubeMesh(), V(xStart + i * scale, yStart, zStart), 1, color), true));
        }
        return arr;
    }
    function updateFreqAmpVisualiser(visArr, dataArr, analyser, scale = .1) {
        // audioGraph.analyser?.getByteFrequencyData(dataArr);
        for (let i = 0; i < visArr.length; i++) {
            const point = visArr[i];
            assert(point.object);
            point.object.position[2] = point.prevPosition[2] + dataArr[i] * scale;
        }
        // updateHoldColors(dataArr,1);
    }
    // function updateHoldColors(dataArr:Uint8Array, band: number){
    //   if(dataArr[band]!==0){
    //     if(holds[0].color[1] > 0.29 && holds[0].color[1] < 0.3){
    //       for(let i = 0;i<holds.length-1;i++){
    //         // EM.set(holds[i],ColorDef,ENDESGA16.blue);
    //         holds[i].color[1] = 0.04;
    //       }
    //     }
    //     else{
    //       for(let i = 0;i<holds.length-1;i++){
    //         EM.set(holds[i],ColorDef,ENDESGA16.red);
    //         holds[i].color[1] = 0.295;
    //       }
    //     }
    //   }
    // }
    function updateHoldColors2() {
        if (holds[0].color[1] > 0.29 && holds[0].color[1] < 0.3) {
            for (let i = 0; i < holds.length - 1; i++) {
                // EM.set(holds[i],ColorDef,ENDESGA16.blue);
                holds[i].color[1] = 0.04;
            }
        }
        else {
            for (let i = 0; i < holds.length - 1; i++) {
                EM.set(holds[i], ColorDef, ENDESGA16.red);
                holds[i].color[1] = 0.295;
            }
        }
    }
    // const audioVisualiserArr = buildFreqAmpVisualiser(freqDataArr.length,-10,0,5,ENDESGA16.darkRed);
    // for(let i=0;i<audioVisualiserArr.length;i++) assert(audioVisualiserArr[i].object)
    // console.log("red: " + ENDESGA16.red);
    // console.log("orange: " + ENDESGA16.orange);
    //color stuff
    let colorChangeCount = 0;
    const COLOR_CHANGE_OPEN = 14;
    const GRAVITY = .008;
    const STICK_ITTERATIONS = 20;
    const WATER_STICK_ITTERATIONS = 10;
    const WATER_MOTION = false;
    let waitCount = 60;
    // let fixedMoveCount = 65;
    let moveAmt = V(.006, -.1, .4);
    let mouseIsPressed = false;
    let mouseStart = V(0, 0);
    let mousePosition = V(0, 0);
    // let holdHand = lh;
    // let jumpHand = rh;
    // const JUMP_SCALE = .004;
    // let jump = false;
    // const ESCAPE_AMT = 10;
    // let escapeCurrentHoldCount = ESCAPE_AMT;
    // const JUMP_OUT_SCALE = -.15;
    // const CATCH_ACURACY = 1.75;
    // const ARM_STRETCH_SCALE = .02;
    // const GUY_START = holds[0].position;
    let gameStarted = false;
    const CAMERA_OFFSET = V(0, -20, 3);
    let cameraPosition = J3.add(CAMERA_OFFSET, GUY_LH_START);
    const CAMERA_SPEED = .01;
    const amplitudeArr = [100, 100, 100, 100, 100, 100, 100, 100, 100];
    let maxAmp = 100;
    const guy = {
        jumpHand: rh,
        holdHand: lh,
        points: bodyPoints,
        sticks: sticks,
        jump: {
            scale: .004,
            outScale: -.15,
            catchAcuracy: 1.75,
            armStretchScale: .016,
            escapeAmt: 10,
            escapeCount: 10,
            jump: false
        }
    };
    function getMax(arr) {
        let max = arr[0];
        for (let i = 0; i < arr.length; i++) {
            max = Math.max(max, arr[i]);
        }
        return max;
    }
    function updateAmpMax(arr, newAmp) {
        let pop = arr.pop();
        arr.unshift(newAmp);
        if (newAmp >= maxAmp)
            maxAmp = newAmp;
        else if (pop === maxAmp)
            maxAmp = getMax(arr);
        return maxAmp;
    }
    function getAmp(arr, highestBand, lowestBand) {
        let solution = 0;
        for (let i = highestBand; i <= lowestBand; i++) {
            solution += arr[i];
        }
        return solution;
    }
    function holdChangeControl(ampArr, freqAmpArr, highestBand, lowestBand = 15) {
        const newAmp = getAmp(freqAmpArr, highestBand, lowestBand);
        const solution = newAmp > maxAmp;
        updateAmpMax(ampArr, newAmp);
        return solution;
    }
    // let audioPlaying = false;
    // AUDIO_ELEMENT.play();
    function getRandomInt(min, max) {
        const minCeiled = Math.ceil(min);
        const maxFloored = Math.floor(max);
        return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
    }
    function randomOrderArray(length) {
        let set = new Set();
        let arr = [];
        while (set.size < length) {
            let randInt = getRandomInt(0, length);
            if (!set.has(randInt)) {
                set.add(randInt);
                arr.push(randInt);
            }
        }
        return arr;
    }
    // create camera
    const cam = EM.mk();
    EM.set(cam, PositionDef, cameraPosition);
    // EM.set(cam, ControllableDef);
    // cam.controllable.modes.canFall = false;
    // cam.controllable.modes.canJump = false;
    // g.controllable.modes.canYaw = true;
    // g.controllable.modes.canPitch = true;
    EM.set(cam, CameraFollowDef, 1);
    // setCameraFollowPosition(cam, "firstPerson");
    // EM.set(cam, PositionDef);
    // EM.set(cam, RotationDef);
    // quat.rotateY(cam.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
    // quat.rotateX(cam.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
    // EM.set(cam, LinearVelocityDef);
    EM.set(cam, RenderableConstructDef, CubeMesh, true);
    function startGame() {
        guy.jumpHand.fixed = false;
        guy.holdHand.fixed = true;
        guy.jump.jump = false;
        J3.copy(guy.holdHand.position, GUY_LH_START);
        J3.copy(guy.holdHand.prevPosition, guy.holdHand.position);
        // holdHand.position = J3.clone(GUY_LH_START);
        // holdHand.prevPosition= holdHand.position;
        guy.jump.escapeCount = guy.jump.escapeAmt;
    }
    //update points and sticks each frame:
    EM.addSystem("stickAndPoint", Phase.GAME_WORLD, [], [InputsDef], (_, { inputs }) => {
        // const _stk = tmpStack();
        //init game
        if (!gameStarted) {
            gameStarted = true;
            startGame();
        }
        if (!audioElement && inputs.anyClick) {
            audioElement = new Audio("./audio-files/techno2.mp3");
            audioGraph = createAudioGraph(audioElement, false, true);
            assert(audioGraph.analyser);
            configureAnalyser(audioGraph.analyser, 32, -90, 0, 0);
            freqDataArr = buildFreqDataArray(audioGraph.analyser);
            // audioVisualiserArr = buildFreqAmpVisualiser(freqDataArr.length,-10,0,5,ENDESGA16.darkRed);
            audioElement.play();
        }
        //loop track 
        // if(audioElement && audioElement.)
        //calculate change to camera position
        const camTargetPos = J3.add(guy.holdHand.position, CAMERA_OFFSET);
        let camMovement = J3.sub(camTargetPos, cameraPosition);
        if (Math.abs(J3.len(camMovement)) > 1) {
            J3.copy(cam.position, J3.add(cameraPosition, J3.scale(camMovement, CAMERA_SPEED, false), false));
        }
        //Reset:
        //to do: add game over check
        if (inputs.keyClicks['m']) {
            startGame();
            // jumpHand.fixed = false;
            // holdHand.fixed = true;
            // jump = false;
            // J3.copy(holdHand.position, GUY_LH_START)
            // J3.copy(holdHand.prevPosition, holdHand.position);
            // escapeCurrentHoldCount = ESCAPE_AMT;
        }
        if (!guy.jump.jump && !mouseIsPressed && inputs.ldown) {
            mouseIsPressed = true;
            InitJump();
        }
        else if (!guy.jump.jump && mouseIsPressed) {
            if (inputs.ldown) {
                DragJump();
            }
            else {
                ReleaseJump();
                mouseIsPressed = false;
            }
        }
        if (WATER_MOTION) {
            generateWave(water);
            for (let i = 0; i < water.points.length; i++) {
                for (let j = 0; j < water.points[0].length; j++) {
                    const point = water.points[i][j];
                    if (point.fixed) {
                        continue;
                    }
                    else {
                        const nextPrevPosition = J3.clone(point.position);
                        V3.add(V3.sub(point.position, point.prevPosition, point.prevPosition), point.position, point.position);
                        // point.position[2] -= GRAVITY;
                        // V3.add(V(0,0,GRAVITY),point.position, point.position)
                        // J3.copy(point.prevPosition, nextPrevPosition);
                        point.prevPosition = nextPrevPosition;
                    }
                }
            }
        }
        //update points and add gravity:
        for (let point of guy.points) {
            if (DEBUG)
                console.log(inputs.mouseMov);
            // if (point.position===point.prevPosition){
            //   point.prevPosition = V3.copy(point.prevPosition, V3.add(point.prevPosition,V(-10,10,-10)));
            // }
            if (point.fixed) {
                if (guy.jump.jump) {
                    fixedMoveUpdate(point);
                    guy.jump.escapeCount--;
                    if (guy.jump.escapeCount < 0) {
                        checkForHoldColision();
                    }
                }
                continue;
            }
            // if(point.fixed){
            //   if(waitCount>0){
            //     waitCount--;
            //   }
            //   else if(fixedMoveCount>0){
            //     fixedMoveUpdate(point);
            //     fixedMoveCount--;
            //   }
            //   else if (fixedMoveCount<=0 && fixedMoveCount>-5) fixedMoveCount--;
            //   // else if(fixedMoveCount===0){
            //   //   fixedMoveCount--;
            //   //   point.fixed = false;
            //   //   rh.fixed = true;
            //   // }
            // //   if(point.position===point.prevPosition){
            // //     V3.add(point.position, V(10,-10,10),point.position);
            // //     point.fixed = false;
            // //     continue;
            // //   }
            // //   else point.fixed = false;
            //   continue;
            // }
            else {
                const nextPrevPosition = J3.clone(point.position);
                V3.add(J3.sub(point.position, point.prevPosition), point.position, point.position);
                point.position[2] -= GRAVITY;
                // V3.add(V(0,0,GRAVITY),point.position, point.position)
                // V3.copy(point.prevPosition, nextPrevPosition);
                point.prevPosition = nextPrevPosition;
            }
        }
        //function for updating "fixed" points: what happens to the fixed point each frame?
        //test:
        function fixedMoveUpdate(point) {
            J3.copy(point.prevPosition, point.position);
            J3.add(point.position, moveAmt, false);
            moveAmt[2] -= GRAVITY;
        }
        function InitJump() {
            // inputs.ldown
            mouseIsPressed = true;
            mouseStart[0] = 0;
            mouseStart[1] = 0;
            mousePosition[0] = 0;
            mousePosition[1] = 0;
            guy.jumpHand.position[0] = guy.holdHand.position[0];
            guy.jumpHand.position[1] = guy.holdHand.position[1];
            guy.jumpHand.position[2] = guy.holdHand.position[2];
            // jumpHand.position = V3.clone(holdHand.position);
            // jumpHand.fixed = true;
        }
        function DragJump() {
            //
            // mousePosition = inputs.mousePos;
            mousePosition[0] += inputs.mouseMov[0];
            mousePosition[1] += inputs.mouseMov[1];
            guy.jumpHand.position[0] += (mousePosition[0] - mouseStart[0]) * guy.jump.armStretchScale;
            guy.jumpHand.position[2] += (mouseStart[1] - mousePosition[1]) * guy.jump.armStretchScale;
        }
        function ReleaseJump() {
            // mousePosition = inputs.mousePos;
            moveAmt[0] = (mouseStart[0] - mousePosition[0]) * guy.jump.scale;
            moveAmt[2] = (mousePosition[1] - mouseStart[1]) * guy.jump.scale;
            moveAmt[1] = moveAmt[2] * guy.jump.outScale;
            guy.jump.jump = true;
            guy.jumpHand.fixed = true;
            guy.holdHand.fixed = false;
        }
        function checkForHoldColision() {
            for (const catchPoint of holdCatchPoints) {
                if (J3.dist(guy.jumpHand.position, catchPoint) < guy.jump.catchAcuracy) {
                    J3.copy(guy.jumpHand.position, catchPoint);
                    // jumpHand.position = V3.clone(catchPoint);
                    // guy.jumpHand.prevPosition = guy.jumpHand.position;
                    J3.copy(guy.jumpHand.prevPosition, guy.jumpHand.position);
                    const temp = guy.jumpHand;
                    guy.jumpHand = guy.holdHand;
                    guy.holdHand = temp;
                    guy.jump.jump = false;
                    guy.jump.escapeCount = guy.jump.escapeAmt;
                    return true;
                }
            }
            return false;
        }
        //adjust points to reconcile stick lengths:
        // if (false)
        // const _stk = tmpStack();
        updateSticks(sticks, STICK_ITTERATIONS);
        if (WATER_MOTION) {
            updateSticks(water.sticks, WATER_STICK_ITTERATIONS);
        }
        function updateSticks(sticks, itterations) {
            for (let i = 0; i < itterations; i++) {
                const randArr = randomOrderArray(sticks.length);
                for (let j = 0; j < sticks.length; j++) {
                    let stick = sticks[randArr[j]];
                    // V3.mid()
                    let stickCenter = J3.scale(J3.add(stick.pointA.position, stick.pointB.position, true), .5, false);
                    const stickDir = J3.norm(J3.sub(stick.pointA.position, stick.pointB.position, true));
                    J3.scale(stickDir, stick.length / 2, false);
                    if (!stick.pointA.fixed) {
                        stick.pointA.position = J3.add(stickCenter, stickDir, true);
                        // V3.copy(stick.pointA.position, V3.add(stickCenter,V3.scale(stickDir,stick.length/2)));
                    }
                    // else V3.copy(stickCenter, V3.add(stick.pointA.position,V3.scale(stickDir,stick.length/2)));
                    if (!stick.pointB.fixed) {
                        stick.pointB.position = J3.sub(stickCenter, stickDir, false);
                        // V3.copy(stick.pointB.position, V3.sub(stickCenter,V3.scale(stickDir,stick.length/2)));
                    }
                    // else V3.copy(stick.pointA.position, V3.add(stick.pointA.position,V3.scale(stickDir,stick.length/2)));
                }
                // to do: shuffle sticks array
                // _stk.popAndRemark();
            }
        }
        // _stk.pop();
        // set object locations to their calculated locatoins:
        for (let point of bodyPoints) {
            if (point.object) {
                J3.copy(point.object.position, point.position);
                // EM.set(point.object,PositionDef,point.position);
            }
        }
        for (let i = 0; i < water.points.length; i++) {
            for (let j = 0; j < water.points[0].length; j++) {
                let point = water.points[i][j];
                if (point.object) {
                    J3.copy(point.object.position, point.position);
                }
                else {
                    J3.copy(water.mesh.pos[i * WATER_X_POINTS + j], point.position);
                    // let foo: Mesh;
                    // const wall2 = await EM.whenEntityHas(wall, RenderableDef);
                    // wall2.renderable.meshHandle.pool.updateMeshVertices();
                    // const waterObject = await EM.whenEntityHas(water.object,RenderableDef);
                    // water.object.renderableConstruct.meshOrProto.
                }
                // water.points[i][j].object.position[0] = water.points[i][j].position[0];
                // water.points[i][j].object.position[1] = water.points[i][j].position[1];
                // water.points[i][j].object.position[2] = water.points[i][j].position[2];
            }
        }
        if (WATER_MOTION) {
            water.object.renderable.meshHandle.pool.updateMeshVertices(water.object.renderable.meshHandle, water.mesh);
        }
        // if(fixedMoveCount === -5){
        //   fixedMoveCount--;
        //   head.fixed = false;
        //   rh.fixed = true;
        // }
        // draw sticks
        for (let i = 0; i < sticks.length; i++) {
            sketchLine(sticks[i].pointA.position, sticks[i].pointB.position, {
                color: ENDESGA16.blue,
                key: `stick_${i}`
            });
        }
        if (audioGraph) {
            colorChangeCount++;
            assert(audioGraph.analyser);
            audioGraph.analyser?.getByteFrequencyData(freqDataArr);
            let controll = holdChangeControl(amplitudeArr, freqDataArr, 9);
            // console.log(controll);
            if (colorChangeCount > COLOR_CHANGE_OPEN && controll) {
                colorChangeCount = 0;
                updateHoldColors2();
            }
            // console.log(amplitudeArr[0]);
            // updateFreqAmpVisualiser(audioVisualiserArr,freqDataArr,audioGraph.analyser);
            // updateHoldColors(freqDataArr,1);
            // if(freqDataArr[10]!==0){
            //   if(holds[0].color ===ENDESGA16.red){
            //     for(let i = 0;i<holds.length-1;i++){
            //       EM.set(holds[i],ColorDef,ENDESGA16.blue);
            //     }
            //   }
            //   else{
            //     for(let i = 0;i<holds.length-1;i++){
            //       EM.set(holds[i],ColorDef,ENDESGA16.red);
            //     }
            //   }
            // }
        }
    });
    // V3.dist()
    // let hangPoint = holds[0].position;
    // let rightFixed = true;
    // const rhLoc = hangPoint;
    // gizmo
    addWorldGizmo(V(-20, 0, 0), 5);
    // line test
    // sketch({
    //   shape: "line",
    //   color: ENDESGA16.orange,
    //   start: [-10, -10, -10],
    //   end: [10, 10, 10],
    // });
    // dbg ghost
    if (DBG_GHOST) {
        initGhost();
    }
    //calculate change to camera position
    const camTargetPos = J3.add(guy.holdHand.position, CAMERA_OFFSET);
    let camMovement = J3.sub(camTargetPos, cameraPosition);
    if (Math.abs(J3.len(camMovement)) > 1) {
        J3.add(cameraPosition, J3.scale(camMovement, CAMERA_SPEED, false), false);
    }
}
//# sourceMappingURL=joel-game.js.map