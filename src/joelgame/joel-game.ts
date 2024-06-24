import { CameraDef, CameraFollowDef, setCameraFollowPosition } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { ECS, EM } from "../ecs/ecs.js";
import { V, V3, quat } from "../matrix/sprig-matrix.js";
import { CubeMesh, HexMesh, PlaneMesh, TetraMesh } from "../meshes/mesh-list.js";
import { HEX_AABB, makeDome, makeSphere, mkCubeMesh, mkPointCloud, mkRectMesh } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { GRID_MASK, SKY_MASK } from "../render/pipeline-masks.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { stdGridRender } from "../render/pipelines/std-grid.js";
import {
  lineMeshPoolPtr,
  linePipe,
  pointPipe,
} from "../render/pipelines/std-line.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RendererDef, RenderableConstructDef, RenderableDef, Renderable } from "../render/renderer-ecs.js";
import { sketch, sketchLine } from "../utils/sketch.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { createObj, defineObj } from "../ecs/em-objects.js";
import { createSun, initGhost } from "../graybox/graybox-helpers.js";
import { Mesh, scaleMesh } from "../meshes/mesh.js";
import { Phase } from "../ecs/sys-phase.js";
import { Entity, EntityW } from "../ecs/em-entities.js";
import { tmpStack } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { ld53ShipAABBs } from "../wood/shipyard.js";
import { ControllableDef } from "../input/controllable.js";
import { LinearVelocityDef } from "../motion/velocity.js";
import { NonupdatableComponentDef } from "../ecs/em-components.js";
import { AudioGraph, buildFreqDataArray, configureAnalyser, createAudioGraph } from "./audio-code.js";
import { skyPipeline } from "../render/pipelines/std-sky.js";
import { TreeBuilder } from "./palm-tree.js";
import { HoldMod } from "./hold-modify.js";
import { DeadDef } from "../ecs/delete.js";

const DBG_GHOST = false;
const DEBUG = false;

// tmpStack()

function assert(condition: any, msg?: string): asserts condition {
  if (!condition)
    throw new Error(msg ?? "Assertion failed (consider adding a helpful msg).");
}

export module J3{
  export function add(vA: V3, vB: V3, newVector: boolean = true): V3{
    const vOut = newVector ? V3.mk() : vA;
    vOut[0] = vA[0] + vB[0];
    vOut[1] = vA[1] + vB[1];
    vOut[2] = vA[2] + vB[2];
    return vOut;
  }
  export function sub(vA: V3, vB: V3, newVector: boolean = true): V3{
    const vOut = newVector ? V3.mk() : vA;
    vOut[0] = vA[0] - vB[0];
    vOut[1] = vA[1] - vB[1];
    vOut[2] = vA[2] - vB[2];
    return vOut;
  }
  export function scale(vA: V3, scale: number, newVector: boolean = true): V3{
    const vOut = newVector ? V3.mk() : vA;
    vOut[0] = vA[0] * scale;
    vOut[1] = vA[1] * scale;
    vOut[2] = vA[2] * scale;
    return vOut;
  }
  export function norm(v: V3, newVector: boolean = true):V3 {
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
  export function clone(v: V3):V3{
    return V(v[0],v[1],v[2]);
  }
  export function dist(vA: V3, vB: V3): number{
    const x = vA[0] - vB[0];
    const y = vA[1] - vB[1];
    const z = vA[2] - vB[2];
    return Math.sqrt(x*x + y*y + z*z);
  }
  export function copy(to: V3, from: V3){
    to[0] = from[0];
    to[1] = from[1];
    to[2] = from[2];
  }
  export function len(v: V3): number{
    return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  }
}

export interface Hold {
  entity: EntityW<[typeof PositionDef, typeof ColorDef]>;
  catchPoint: V3;
  explode?: boolean;
  finish?: boolean;
}

export interface GuyData{
  jumpHand: Point;
  holdHand: Point;
  points: Point[];
  sticks: Stick[];
  jump: JumpData;
  hold: Hold;
}
export interface JumpData{
  scale: number;
  outScale: number;
  catchAcuracy: number;
  armStretchScale: number;
  escapeAmt: number;
  escapeCount: number;
  jump: boolean;
}
export type Point = {position: V3, prevPosition: V3, fixed: boolean, object?: EntityW<[typeof PositionDef]>};

export type Stick = {pointA: Point, pointB: Point, length: number};

export async function initJoelGame() {
  stdGridRender.fragOverrides!.lineSpacing1 = 8.0;
  stdGridRender.fragOverrides!.lineWidth1 = 0.05;
  stdGridRender.fragOverrides!.lineSpacing2 = 256;
  stdGridRender.fragOverrides!.lineWidth2 = 0.2;
  stdGridRender.fragOverrides!.ringStart = 512;
  stdGridRender.fragOverrides!.ringWidth = 0;

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
  const gridDef = [RenderableConstructDef, PositionDef, ScaleDef, ColorDef] as const;


  const grid = createObj(
    gridDef,
    {
      renderableConstruct: [PlaneMesh, true, undefined, GRID_MASK],
      position: [0, 0, 0],
      scale: [2 * camera.viewDist, 2 * camera.viewDist, 1],
      // color: [0, 0.5, 0.5],
      color: [0.5, 0.5, 0.5],
      // color: [1, 1, 1],
    }
  );

  const SKY_HALFSIZE = 1000;
  const domeMesh = makeDome(16, 8, SKY_HALFSIZE);
  const sky = EM.mk();
  EM.set(sky, PositionDef, V(0, 0, -100));
  const skyMesh = domeMesh;
  EM.set(sky, RenderableConstructDef, skyMesh, undefined, undefined, SKY_MASK);

  
  interface worldParams {
    wallHeight: number;
    wallWidth: number;
    CLUSTER_VERT_OFFSET: number;
    CLUSTER_VERT_VAR: number;
    CLUSTER_SIZE: number;
    hasTrees: boolean;
    wallColor: V3;
    oceanColor: V3;
  }

  const world: worldParams = {
    wallHeight: 45,
    wallWidth:20,
    CLUSTER_VERT_OFFSET: 3,
    CLUSTER_VERT_VAR: 5,
    CLUSTER_SIZE: 4,
    hasTrees: true,
    wallColor: V(1,.1,0),
    oceanColor: V(0,0,.6),
  }


  //build wall
  const wall = EM.mk();
  EM.set(wall, RenderableConstructDef, mkRectMesh(world.wallWidth,3,world.wallHeight));
  EM.set(wall, ColorDef, world.wallColor);
  EM.set(wall, PositionDef, V(0, 1.5, world.wallHeight / 2));
  EM.set(wall,RotationDef, quat.fromYawPitchRoll(0,Math.PI*.1,0));


  //generate cluster locations:
  const clusters = generateClusters();
  function generateClusters(): V3[]{
    let clusters: V3[] = [];
    let hor = Math.random()* (world.wallWidth-3) - (world.wallWidth-3)/2;
    let vert = 6.1;
    let dep = (vert-(world.wallHeight/2));
    clusters.push(V(hor, dep, vert));
    while(clusters[clusters.length-1][2] < world.wallHeight - 10){
      hor = Math.random()* (world.wallWidth-5) - (world.wallWidth-5)/2;
      vert = Math.random()* world.CLUSTER_VERT_VAR + clusters[clusters.length-1][2] + world.CLUSTER_VERT_OFFSET;
      dep = (vert-(world.wallHeight/2))*-.33;
      clusters.push(V(hor, dep, vert));
    }
    return clusters;
  }

  // _stk.pop();
    
  //generate holds
  
  // interface Hold {
  //   entity: EntityW<[typeof PositionDef, typeof ColorDef]>;
  //   explode?: boolean;
  //   finish?: boolean;
  // }
  
  // type Hold = EntityW<[typeof PositionDef, typeof ColorDef]>;
  const holds = generateHolds();
  function generateHolds():Hold[]{
    const holds: Hold[] = [];
    for(let i=0; i<clusters.length; i++){
      const cluster = clusters[i];
      do{
        const hold = EM.mk();
        EM.set(hold, RenderableConstructDef, TetraMesh);
        EM.set(hold, ColorDef, V(.75,0,.01));
        const hor = Math.random()* world.CLUSTER_SIZE + cluster[0] - world.CLUSTER_SIZE / 2;
        const vert = Math.random()* world.CLUSTER_SIZE + cluster[2] - world.CLUSTER_SIZE / 2;
        const dep = (vert-(world.wallHeight/2)) * -.33;
        EM.set(hold, PositionDef, V(hor, dep ,vert));
        EM.set(hold, RotationDef, quat.fromYawPitchRoll(0, Math.PI*.6, 0));
        quat.yaw(hold.rotation, Math.random() * 3, hold.rotation);
        EM.set(hold, ScaleDef, V(Math.random()+.5,Math.random()+.5,Math.random()+.5))
        const holdI: Hold = {
          entity: hold,
          catchPoint: V(hold.position[0], hold.position[1] - 2, hold.position[2]),
        }
        holds.push(holdI)
        if(i===clusters.length-1){
          EM.set(hold, ColorDef, ENDESGA16.lightGreen);
          break;
        } 
        else if(i>0 && Math.random() < .2) {
          holdI.explode = true;
          J3.copy(hold.color,V(.05,.05,.05));
        }
      }while(Math.random() <.6);
    }
    return holds;
  }
  //get hold catch points
  // to do add to data:
  // const holdCatchPoints = getHoldCatchPoints();
  // function getHoldCatchPoints(): V3[]{
  //   let catchPoints: V3[] = [];
  //   for(const hold of holds){
  //     catchPoints.push(V(hold.entity.position[0], hold.entity.position[1] - 2, hold.entity.position[2]));
  //   }
  //   return catchPoints;
  // }


  //make island:
  const islandPos = V(world.wallWidth*-.5 - 10,-5,0);
  TreeBuilder.mkIsland2(world.wallWidth+20,25,1.5,islandPos);


  if(world.hasTrees){
    TreeBuilder.mkRandPalmTree(V(Math.random() * 3 + world.wallWidth * -.5 - 4,0,0));
  }
  // if(world.hasTrees && Math.random()>.8){
  //   TreeBuilder.mkRandPalmTree(V(Math.random() * 3 + world.wallWidth * -.5 - 4,0,0));
  // }
  if(world.hasTrees){
    TreeBuilder.mkRandPalmTree(V(Math.random() * 3 + world.wallWidth * .5 + 1,0,0));
  }
  // if(Math.random()>.8){
  //   TreeBuilder.mkRandPalmTree(V(Math.random() * 3 + world.wallWidth * .5 + 1,0,0));
  // }



  //generate guy
  const GUY_SCALE = .75;
  const GUY_LH_ZERO = V(4.2,0,-5);
  let GUY_LH_START = V(holds[0].entity.position[0], holds[0].entity.position[1] - 2, holds[0].entity.position[2])
  // GUY_LH_START[1] -= 3;
  const GUY_OFFSET = J3.add(GUY_LH_START,GUY_LH_ZERO);
  
  function mkEntity(mesh: Mesh, position: V3, scale: number, color: V3 ):EntityW<[typeof PositionDef, typeof RenderableConstructDef]>{
    let ent = EM.mk();
    EM.set(ent, RenderableConstructDef, mesh);
    EM.set(ent, ColorDef, color);
    EM.set(ent, PositionDef, position);
    EM.set(ent, ScaleDef, V(scale,scale,scale));
    return ent;
  }

  function mkGrayCube(position:V3, scale: number): EntityW<[typeof PositionDef]>{
    return mkEntity(mkCubeMesh(), J3.scale(position, GUY_SCALE, false), scale * GUY_SCALE, ENDESGA16.darkGray);
  }

  // type Point = {position: V3, prevPosition: V3, fixed: boolean, object?: EntityW<[typeof PositionDef]>};

  function mkPoint(e: EntityW<[typeof PositionDef]>, fixed: boolean): Point {
    return {
      // position: J3.clone(e.position), 
      position: e.position,
      prevPosition: J3.clone(e.position),
      object: e, 
      fixed: fixed
    };
  }

  function mkGCPoint(position:V3, scale: number = .2, fixed: boolean = false): Point{
    return mkPoint(mkGrayCube(J3.add(position,GUY_OFFSET,false),scale),fixed);
  }

  function mkPointNoObject(position:V3, fixed: boolean = false): Point {
    return {
      position: J3.clone(position), 
      prevPosition: position,
      fixed: fixed
    }
  }

  function mkWaterGrid(xWid: number, yDep: number, increment: number, yStart: number, xStart: number, zPos: number = 0): Point[][]{
    const xNum = Math.floor(xWid/increment);
    const yNum = Math.floor(yDep/increment);
    const waterArr: Point[][] = [];
    for(let y=0;y<=yNum;y++){
      waterArr.push([]);
      for(let x = 0; x <= xNum; x++){
        waterArr[y].push(mkPointNoObject(V(xStart + increment * x, yStart + increment * y, zPos)));
        
      }
      
    }
    waterArr[0][0].fixed = true;
    waterArr[0][xNum].fixed = true;
    waterArr[yNum][0].fixed = true;
    waterArr[yNum][xNum].fixed = true;
    return waterArr;
  }
  // _stk.pop();
  function mkWaterSticks(waterArr: Point[][]): Stick[]{
    const sticks: Stick[] = [];
    for(let y=0; y<waterArr.length; y++){
      for(let x=0; x<waterArr[0].length; x++){
        if(y!==0) sticks.push(mkStick(waterArr[y][x],waterArr[y-1][x]));
        if(x!==0) sticks.push(mkStick(waterArr[y][x],waterArr[y][x-1]));
      }
    }
    return sticks;
  }
  // _stk.pop();
  function addSlack(points: Point[][], slackAmt: number){
    slackAmt /= points[0].length
    for(let y = 0; y < points.length; y++){
      for(let x = 0; x < points[0].length; x++){
        const point = points[y][x];
        point.position[0] -= slackAmt * x;
        point.prevPosition[0] -= slackAmt * x;
        // point.object.position[0] -= slackAmt * x;
      }
    }
  }

  


  let bodyPoints: Point[] = [];

  //left hand
  let lh = mkGCPoint(V(-4.2,0,5.2), .2, true);
  bodyPoints.push(lh)
  //left elbow
  let le = mkGCPoint(V(-4.2,0,4.6), .05);
  bodyPoints.push(le);
  //left shoulder
  let ls = mkGCPoint(V(-4.2,0,4));
  bodyPoints.push(ls);
  //right hand
  let rh = mkGCPoint(V(-3.2,0,2.8));
  bodyPoints.push(rh);
  //right elbow
  let re = mkGCPoint(V(-3.2,0,3.4),.05);
  bodyPoints.push(re);
  //right shoulder
  let rs = mkGCPoint(V(-3.2,0,4), .2, false);
  bodyPoints.push(rs);
  //sternum
  let sternum = mkGCPoint(V(-3.7,0,3.9), .002, false);
  bodyPoints.push(sternum);
  //head
  let head = mkGCPoint(V(-3.7,0,4.5), .4, false);
  bodyPoints.push(head);
  //pelvis
  let pelvis = mkGCPoint(V(-3.7,0,2.8), .2, false);
  bodyPoints.push(pelvis);
  //left hip
  let lHip = mkGCPoint(V(-4,0,2.7), .2, false);
  bodyPoints.push(lHip);
  //right hip
  let rHip = mkGCPoint(V(-3.4,0,2.7), .2, false);
  bodyPoints.push(rHip);
  //left foot
  let lf = mkGCPoint(V(-4,0,1.3), .2, false);
  bodyPoints.push(lf);
  //right foot
  let rf = mkGCPoint(V(-3.4,0,1.3), .2, false);
  bodyPoints.push(rf);
  //right knee
  let rk = mkGCPoint(V(-3.4,0,2), .05, false);
  bodyPoints.push(rk);
  // left knee
  let lk = mkGCPoint(V(-4,0,2), .05, false);
  bodyPoints.push(lk);

  

  //sticks connecting points: pointA, pointB, length
  // type Stick = {pointA: Point, pointB: Point, length: number}
  
  function mkStick(pointA: Point, pointB: Point): Stick{
    return {pointA, pointB, length:J3.dist(pointA.position,pointB.position)};
  }

  let sticks: Stick[] = [
    mkStick(lh,le),
    mkStick(le,ls),
    mkStick(re,rs),
    mkStick(rh,re),
    mkStick(ls,rs),
    mkStick(ls,sternum),
    mkStick(rs,sternum),
    mkStick(head,sternum),
    mkStick(head,rs),
    mkStick(head,ls),
    mkStick(pelvis,sternum),
    mkStick(pelvis,rs),
    mkStick(pelvis,ls),
    mkStick(pelvis,rHip),
    mkStick(pelvis,lHip),
    mkStick(rHip,lHip),
    // mkStick(rHip,rf),
    // mkStick(lHip,lf),
    mkStick(rHip,rk),
    mkStick(rk,rf),
    mkStick(lHip,lk),
    mkStick(lk,lf),
    mkStick(head,pelvis)
  ];

  interface Wave{
    sinePos: number;
    sineMax: number;
    sineMin: number;
    sineRatio: number;
    sineUp: boolean;
    point: Point;
  }

  interface Water {
    points: Point[][];
    sticks: Stick[];
    mesh: Mesh;
    object: EntityW<[NonupdatableComponentDef<"renderable", Renderable, [r: Renderable], false>], number>;
    wave: Wave;
  }
  
  const WATER_WIDTH = 1000;
  const WATER_DEPTH = 1000;
  const WATER_HEIGHT = .7
  const WATER_INCREMENT = 50; 

  const waterArr = mkWaterGrid(WATER_WIDTH,WATER_DEPTH,WATER_INCREMENT,-1*(WATER_DEPTH/6),-1*(WATER_WIDTH/2),WATER_HEIGHT);
  const WATER_X_POINTS = waterArr[0].length;

  const SINE_HEIGHT = 6;
  const waterMesh = mkWaterMesh(waterArr);
  const waterTemp = mkEntity(waterMesh,V(0,0,0),1,ENDESGA16.lightBlue);
  const waterObject = await EM.whenEntityHas(waterTemp,RenderableDef);
  const water: Water = {
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
      point: waterArr[Math.floor(waterArr.length/2)+6][Math.floor(waterArr[0].length/2)]
    }
  } 


  function mkWaterMesh(waterPoints: Point[][]): Mesh{
    const verts: V3[] = [];
    const ids: number[] = [];
    let id = 0;
    let tri: V3[] = [];
    const colors: V3[] = []
    let curPoint = 0;
    for(let i=0; i<waterPoints.length; i++){
      for(let j=0;j< waterPoints[0].length; j++){
        verts.push(J3.clone(waterPoints[i][j].position));
        if(i>0 && j>0){
          tri.push(V(curPoint, curPoint - WATER_X_POINTS - 1, curPoint - WATER_X_POINTS));
          ids.push(id);
          id++;
          colors.push(V(0,0,0));
          tri.push(V(curPoint, curPoint - 1, curPoint - WATER_X_POINTS - 1))
          ids.push(id);
          id++;
          colors.push(V(0,0,0));
        }
        curPoint++;
      }
    }
    const mesh: Mesh = {
      dbgName: "water",
      pos: verts,
      tri,
      quad: [],
      colors,
      surfaceIds: ids,
      usesProvoking: true
    }
    return mesh;
  }

  function generateWave(water: Water){
    if(water.wave.sineUp){
      water.wave.sinePos += (water.wave.sineMax - water.wave.sinePos) * water.wave.sineRatio;
      if(water.wave.sinePos > water.wave.sineMax - .08){
        water.wave.sineUp = false;
      }
    }
    else{
      water.wave.sinePos -= (water.wave.sinePos - water.wave.sineMin) * water.wave.sineRatio;
      if(water.wave.sinePos < water.wave.sineMin + .1){
        water.wave.sineUp = true;
      }
    }
    water.wave.point.position[2] = water.wave.sinePos;
  }

  // const waterMesh = mkWaterMesh(waterArr);

  addSlack(water.points, .1);

  // fix waive point
  water.wave.point.fixed = true;

  let audioElement: HTMLAudioElement;
  let audioGraph: AudioGraph;
  let freqDataArr: Uint8Array;
  let audioVisualiserArr: Point[];
  

  // function buildFreqAmpVisualiser(bands: number, xStart: number = 0, yStart: number = 0, zStart: number = 0, color: V3 = ENDESGA16.darkRed): Point[] {
  //   const arr: Point[] = []
  //   const scale = 2
  //   for (let i = 0; i < bands; i++){
  //     arr.push(mkPoint(mkEntity(mkCubeMesh(),V(xStart+i*scale,yStart,zStart), 1, color),true));
  //   }
  //   return arr;
  // }

  // function updateFreqAmpVisualiser(visArr: Point[], dataArr: Uint8Array, analyser: AnalyserNode, scale: number = .1){
  //   // audioGraph.analyser?.getByteFrequencyData(dataArr);
  //   for(let i=0;i<visArr.length;i++){
  //     const point = visArr[i];
  //     assert(point.object);
  //     point.object.position[2] = point.prevPosition[2] + dataArr[i] * scale;
  //   }
  //   // updateHoldColors(dataArr,1);
  // }

  let greenUp = true;
  let blueUp = false;
  function updateHoldColors(changeRate: number = .15, maxSaturation: number = .75){
    const negChange = changeRate * -1;
    if(greenUp){
      colorChange(1,changeRate);
      if(holds[0].entity.color[1] > maxSaturation){
        greenUp = false;
      }
    } 
    else if(holds[0].entity.color[1] > 0){
      colorChange(1,negChange);
      if(holds[0].entity.color[1] === 0){
        blueUp = true;
      }
    }
    else if(blueUp){
      colorChange(2,changeRate);
      if(holds[0].entity.color[2] > maxSaturation){
        blueUp = false;
      }
    } 
    else{
      colorChange(2,negChange);
      if(holds[0].entity.color[2] === 0){
        greenUp = true;
      }
    }

    function colorChange(colorIndex: 0 | 1 | 2, change: number){
      let newColor = holds[0].entity.color[colorIndex] + change
      if(newColor < 0){
        newColor = 0;
      }
      for(let i=0;i<holds.length-1; i++){
        holds[i].entity.color[colorIndex] = newColor;
      }
    }
  }

  // function updateHoldColorsRand(){
  //   let randColor = [Math.random(), Math.random(), Math.random()];
  //   for(let i=0;i<holds.length-1;i++){
  //     holds[i].entity.color[0] = randColor[0];
  //     holds[i].entity.color[1] = randColor[1];
  //     holds[i].entity.color[2] = randColor[2];
  //   }
  // }

  function updateHoldColorsAllRand(){
    for(let i=0;i<holds.length-1;i++){
      holds[i].entity.color[0] = Math.random();
      holds[i].entity.color[1] = Math.random();
      holds[i].entity.color[2] = Math.random();
    }
  }
  
  //color stuff
  let colorChangeCount = 0;
  const COLOR_CHANGE_OPEN = 14;

  const GRAVITY = .008
  const STICK_ITTERATIONS = 20;
  const WATER_STICK_ITTERATIONS = 10;
  const WATER_MOTION = true;
  let waitCount = 60;
  let moveAmt = V(.006,-.1,.4);
  let mouseIsPressed = false;
  let mouseStart = V(0,0);
  let mousePosition = V(0,0);
  let gameStarted: boolean = false;
  const CAMERA_OFFSET = V(0,-20,3);
  let cameraPosition = J3.add(CAMERA_OFFSET,GUY_LH_START);
  const CAMERA_SPEED = .01;
  const amplitudeArr: number[] = [100,100,100,100,100,100,100,100,100];
  let maxAmp = 100;
  let explodeCountdown = 60;
  let holdShakePos = V(0,0,0);
  let explodeArr: Point[] = [];
  let deadHold: EntityW<[typeof DeadDef]>;

  // interface GuyData{
  //   jumpHand: Point;
  //   holdHand: Point;
  //   points: Point[];
  //   sticks: Stick[];
  //   jump: JumpData;
  //   hold: Hold;
  // }
  // interface JumpData{
  //   scale: number;
  //   outScale: number;
  //   catchAcuracy: number;
  //   armStretchScale: number;
  //   escapeAmt: number;
  //   escapeCount: number;
  //   jump: boolean;
  // }

  const guy: GuyData = {
    jumpHand: rh,
    holdHand: lh,
    points: bodyPoints,
    sticks: sticks,
    hold: holds[0],
    jump: {
      scale: .004,
      outScale: -.15,
      catchAcuracy: 1.75,
      armStretchScale: .016,
      escapeAmt: 10,
      escapeCount: 10,
      jump: false
    }
  }

  function getMax(arr: number[]): number{
    let max = arr[0];
    for(let i=0;i<arr.length;i++){
      max = Math.max(max,arr[i]);
    }
    return max;
  }
  function updateAmpMax(arr: number[], newAmp: number): number{
    let pop = arr.pop();
    arr.unshift(newAmp);
    if(newAmp>=maxAmp) maxAmp = newAmp;
    else if (pop===maxAmp) maxAmp = getMax(arr);
    return maxAmp;
  }
  function getAmp(arr: Uint8Array, highestBand: number, lowestBand: number): number{
    let solution = 0;
    for(let i=highestBand; i<=lowestBand;i++){
      solution += arr[i];
    }
    return solution;
  }
  function holdChangeControl(ampArr: number[], freqAmpArr: Uint8Array, highestBand: number, lowestBand: number = 15): boolean{
    const newAmp = getAmp(freqAmpArr, highestBand, lowestBand);
    const solution = newAmp > maxAmp;
    updateAmpMax(ampArr, newAmp);
    return solution;
  }

  function getRandomInt(min:number, max:number):number {
    const minCeiled = Math.ceil(min);
    const maxFloored = Math.floor(max);
    return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
  }
  
  function randomOrderArray(length:number): number[]{
    let set: Set<number> = new Set();
    let arr: number[] = []
    while(set.size<length){
      let randInt = getRandomInt(0,length);
      if(!set.has(randInt)){
        set.add(randInt);
        arr.push(randInt);
      }
    }
    return arr;
  }
  // create camera
  const cam = EM.mk();
  EM.set(cam, PositionDef, cameraPosition);
  EM.set(cam, CameraFollowDef, 1);
  EM.set(cam, RenderableConstructDef, CubeMesh, true);

  function startGame(){
    guy.jumpHand.fixed = false;
    guy.holdHand.fixed = true;
    guy.jump.jump = false;
    guy.hold = holds[0]
    J3.copy(guy.holdHand.position, guy.hold.catchPoint);
    J3.copy(guy.holdHand.prevPosition, guy.holdHand.position);
    guy.jump.escapeCount = guy.jump.escapeAmt;
  }
  //update points and sticks each frame:
  EM.addSystem("stickAndPoint",Phase.GAME_WORLD,[],[InputsDef],(_, {inputs})=>{
    
    //init game
    if(!gameStarted){
      gameStarted = true;
      startGame();
    } 

    if(!audioElement && inputs.anyClick){
      audioElement = new Audio("./audio-files/techno2.mp3");
      audioGraph = createAudioGraph(audioElement,false,true);
      assert(audioGraph.analyser);
      configureAnalyser(audioGraph.analyser,32,-90,0,0);
      freqDataArr = buildFreqDataArray(audioGraph.analyser);
      audioElement.play();
    } 
    //to do: loop track 
    // if(audioElement && audioElement.)

    //calculate change to camera position
    const camTargetPos = J3.add(guy.holdHand.position,CAMERA_OFFSET);
    let camMovement = J3.sub(camTargetPos, cameraPosition);
    if(Math.abs(J3.len(camMovement)) > 1){
      J3.copy(cam.position,J3.add(cameraPosition,J3.scale(camMovement,CAMERA_SPEED,false),false));
    }


    //Reset:
    //to do: add game over check
    if(inputs.keyClicks['m']){
      startGame();
      if(explodeCountdown < 0){
        explodeCountdown = 60;
        
        if(deadHold){
          EM.removeComponent(deadHold.id,DeadDef);
          // deadHold.dead.processed = false;
        }
        
      }
    }

    if(guy.hold.explode){
      
      if(explodeCountdown>0){
        explodeCountdown--;
        HoldMod.shake(guy, holdShakePos);
      }
      else if(explodeCountdown===0){
        explodeArr = HoldMod.mkExplodeArr(guy);
        
        EM.set(guy.hold.entity,DeadDef)
        guy.hold.entity.dead.processed = true;
        // guy.hold.entity.dead.processed = false;

        explodeCountdown--;
        guy.holdHand.fixed = false;
        deadHold = guy.hold.entity;
      }
      else{
        HoldMod.updateExplodeArr(explodeArr, GRAVITY);
      }
    }

    if(!guy.jump.jump && !mouseIsPressed && inputs.ldown){
      mouseIsPressed = true;
      InitJump();
    }
    else if(!guy.jump.jump && mouseIsPressed){
      if(inputs.ldown){
        DragJump();
      }
      else {
        ReleaseJump();
        mouseIsPressed = false;
      }
    }

    if(WATER_MOTION){
      generateWave(water);
      
      for(let i=0; i<water.points.length; i++){
        for(let j=0; j<water.points[0].length; j++){
          const point = water.points[i][j];
          if(point.fixed){
            continue
          }
          else{
            const nextPrevPosition = J3.clone(point.position);
            V3.add(V3.sub(point.position,point.prevPosition,point.prevPosition),point.position, point.position);
            point.prevPosition = nextPrevPosition;
          }
        }
      }
    }
    //update points and add gravity:
    for(let point of guy.points){

      if(DEBUG) console.log(inputs.mouseMov);

      if(point.fixed){
        if(guy.jump.jump){
          fixedMoveUpdate(point);
          guy.jump.escapeCount--;
          if(guy.jump.escapeCount<0){
            checkForHoldColision();
            
          }
        }
        continue;
      }
      else{
        const nextPrevPosition = J3.clone(point.position);
        V3.add(J3.sub(point.position,point.prevPosition),point.position, point.position);
        point.position[2] -= GRAVITY;
        point.prevPosition = nextPrevPosition;
      }
    }

    //function for updating "fixed" points: what happens to the fixed point each frame?
    //test:
    function fixedMoveUpdate(point: Point){
      J3.copy(point.prevPosition,point.position);
      J3.add(point.position,moveAmt,false);
      moveAmt[2]-=GRAVITY;
    }
    
    function InitJump(){
      // inputs.ldown
      mouseIsPressed = true;

      mouseStart[0] = 0;
      mouseStart[1] = 0;
      mousePosition[0] = 0;
      mousePosition[1] = 0;
  
      guy.jumpHand.position[0] = guy.holdHand.position[0];
      guy.jumpHand.position[1] = guy.holdHand.position[1];
      guy.jumpHand.position[2] = guy.holdHand.position[2];
    }

    function DragJump(){
      //
      // mousePosition = inputs.mousePos;
      mousePosition[0] += inputs.mouseMov[0];
      mousePosition[1] += inputs.mouseMov[1];
      guy.jumpHand.position[0]+= (mousePosition[0]-mouseStart[0]) * guy.jump.armStretchScale;
      guy.jumpHand.position[2]+= (mouseStart[1] - mousePosition[1]) * guy.jump.armStretchScale;
    }
    function ReleaseJump(){
      // mousePosition = inputs.mousePos;
      moveAmt[0] = (mouseStart[0] - mousePosition[0]) * guy.jump.scale;
      moveAmt[2] = (mousePosition[1] - mouseStart[1]) * guy.jump.scale;
      moveAmt[1] = moveAmt[2] * guy.jump.outScale;
      guy.jump.jump = true;
      guy.jumpHand.fixed = true;
      guy.holdHand.fixed = false;
    }
    
    function checkForHoldColision(): boolean{
      for(const hold of holds){
        if(J3.dist(guy.jumpHand.position, hold.catchPoint) < guy.jump.catchAcuracy){
          J3.copy(guy.jumpHand.position, hold.catchPoint);
          guy.hold = hold;
          if(hold.explode) J3.copy(holdShakePos, hold.entity.position);
          // jumpHand.position = V3.clone(catchPoint);
          // guy.jumpHand.prevPosition = guy.jumpHand.position;
          J3.copy(guy.jumpHand.prevPosition,guy.jumpHand.position);
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
    
    // const _stk = tmpStack();
    updateSticks(sticks,STICK_ITTERATIONS);
    if(WATER_MOTION){
      updateSticks(water.sticks, WATER_STICK_ITTERATIONS);
    }
    function updateSticks(sticks: Stick[], itterations: number){
      for(let i = 0; i<itterations;i++){
        const randArr = randomOrderArray(sticks.length);
        for(let j=0;j<sticks.length;j++){
          let stick = sticks[randArr[j]];
          // V3.mid()
          let stickCenter = J3.scale(J3.add(stick.pointA.position, stick.pointB.position,true),.5,false);
          const stickDir = J3.norm(J3.sub(stick.pointA.position, stick.pointB.position,true));
          J3.scale(stickDir, stick.length/2, false);
          if(!stick.pointA.fixed){
            stick.pointA.position = J3.add(stickCenter,stickDir,true);
            // V3.copy(stick.pointA.position, V3.add(stickCenter,V3.scale(stickDir,stick.length/2)));
          }
          // else V3.copy(stickCenter, V3.add(stick.pointA.position,V3.scale(stickDir,stick.length/2)));
          if(!stick.pointB.fixed){
            stick.pointB.position = J3.sub(stickCenter,stickDir,false);
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
    for(let point of bodyPoints){
      if(point.object) {
        J3.copy(point.object.position,point.position);
        // EM.set(point.object,PositionDef,point.position);
      }
    }
    for(let i=0;i<water.points.length;i++){
      for(let j=0; j<water.points[0].length; j++){
        let point = water.points[i][j];
        if(point.object){
          J3.copy(point.object.position,point.position);
        }
        else{
          J3.copy(water.mesh.pos[i*WATER_X_POINTS+j], point.position);
        }
      }
    }

    if(WATER_MOTION){
      water.object.renderable.meshHandle.pool.updateMeshVertices(water.object.renderable.meshHandle,water.mesh);
    }

    // draw sticks
    for (let i = 0; i < sticks.length; i++){
      sketchLine(sticks[i].pointA.position, sticks[i].pointB.position, {
        color: ENDESGA16.blue,
        key: `stick_${i}`
      })
    }

    if(audioGraph){
      colorChangeCount++;
      assert(audioGraph.analyser);
      audioGraph.analyser?.getByteFrequencyData(freqDataArr);
      let controll = holdChangeControl(amplitudeArr,freqDataArr, 9);
      // console.log(controll);
      if(colorChangeCount> COLOR_CHANGE_OPEN && controll){
        colorChangeCount = 0;
        HoldMod.updateColorsRand(holds); 
      }
      
    }
  });



  // gizmo
  // addWorldGizmo(V(-20, 0, 0), 5);


  // dbg ghost
  if (DBG_GHOST) {
    initGhost();
  }

  //calculate change to camera position
  const camTargetPos = J3.add(guy.holdHand.position,CAMERA_OFFSET);
  let camMovement = J3.sub(camTargetPos, cameraPosition);
  if(Math.abs(J3.len(camMovement)) > 1){
    J3.add(cameraPosition,J3.scale(camMovement,CAMERA_SPEED,false),false);
  }
  
  


}
