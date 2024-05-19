import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { ECS, EM } from "../ecs/ecs.js";
import { V, V3, quat } from "../matrix/sprig-matrix.js";
import { HexMesh, PlaneMesh, TetraMesh } from "../meshes/mesh-list.js";
import { HEX_AABB, makeSphere, mkCubeMesh, mkPointCloud, mkRectMesh } from "../meshes/primatives.js";
import { MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { GRID_MASK } from "../render/pipeline-masks.js";
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
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import { sketch, sketchLine } from "../utils/sketch.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { createObj, defineObj } from "../ecs/em-objects.js";
import { createSun, initGhost } from "../graybox/graybox-helpers.js";
import { Mesh, scaleMesh } from "../meshes/mesh.js";
import { Phase } from "../ecs/sys-phase.js";
import { Entity, EntityW } from "../ecs/em-entities.js";
import { tmpStack } from "../matrix/sprig-matrix.js";

const DBG_GHOST = true;

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
  
}



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

      stdGridRender,

      postProcess,
    ];
  });

  const { camera, me } = await EM.whenResources(CameraDef, MeDef);

  // camera
  camera.fov = Math.PI * 0.5;
  camera.viewDist = 1000;
  V3.set(-200, -200, -200, camera.maxWorldAABB.min);
  V3.set(+200, +200, +200, camera.maxWorldAABB.max);

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

  // pedestal
  const pedestal = EM.mk();
  EM.set(pedestal, RenderableConstructDef, HexMesh);
  EM.set(pedestal, ColorDef, ENDESGA16.orange);
  EM.set(pedestal, PositionDef, V(0, 0, -10));
  EM.set(pedestal, ScaleDef, V(10, 10, 10));
  EM.set(pedestal, ColliderDef, {
    shape: "AABB",
    solid: true,
    aabb: HEX_AABB,
  });
  
  const wallHeight = 20;
  const wallWidth = 10;
  

  //build wall
  const wall = EM.mk();
  EM.set(wall, RenderableConstructDef, mkRectMesh(wallWidth,3,wallHeight));
  EM.set(wall, ColorDef, ENDESGA16.darkBrown);
  EM.set(wall, PositionDef, V(0, 1.5, 10));
  EM.set(wall,RotationDef, quat.fromYawPitchRoll(0,Math.PI*.1,0));
  
  //generate holds
  const holds = [];
  for(let i=0;i<11;i++){
    const hold = EM.mk();
    EM.set(hold, RenderableConstructDef, TetraMesh);
    EM.set(hold, ColorDef, ENDESGA16.red);
    const hor = Math.random()* (wallWidth-3) - (wallWidth-3)/2;
    const vert = Math.random()*(wallHeight-4)+2;
    const dep = (vert-(wallHeight/2))*-.33;
    EM.set(hold, PositionDef, V(hor, dep ,vert));
    EM.set(hold,RotationDef, quat.fromYawPitchRoll(Math.random()-.5,Math.PI*.6,Math.random()-.5));
    EM.set(hold, ScaleDef, V(Math.random()+.5,Math.random()+.5,Math.random()+.5))
    holds.push(hold)
  }

  //generate guy

  const GUY_SCALE = .5
  const GUY_LH_ZERO = V(4.2,0,-5);
  const GUY_LH_START = holds[0].position
  const GUY_OFFSET = J3.add(GUY_LH_START,GUY_LH_ZERO);
  
  function mkEntity(mesh: Mesh, position: V3, scale: number, color: V3 ):EntityW<[typeof PositionDef]>{
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

  
  type Point = {position: V3, prevPosition: V3, fixed: boolean, object: EntityW<[typeof PositionDef]>};

  function mkPoint(e: EntityW<[typeof PositionDef]>, fixed: boolean): Point {
    return {position: V3.clone(e.position), 
    prevPosition: V3.clone(e.position),
    object: e, fixed: fixed};
  }

  function mkGCPoint(position:V3, scale: number = .2, fixed: boolean = false): Point{
    return mkPoint(mkGrayCube(J3.add(position,GUY_OFFSET,false),scale),fixed);
  }

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


  


  let bodyPoints: Point[] = [];

  //left hand
  let lh = mkGCPoint(V(-4.2,0,5), .2, false);
  bodyPoints.push(lh)
  //left shoulder
  let ls = mkGCPoint(V(-4.2,0,4));
  bodyPoints.push(ls);
  //right hand
  let rh = mkGCPoint(V(-3.2,0,3));
  bodyPoints.push(rh);
  //right shoulder
  let rs = mkGCPoint(V(-3.2,0,4), .2, false);
  bodyPoints.push(rs);
  //sternum
  let sternum = mkGCPoint(V(-3.7,0,3.9), .002, false);
  bodyPoints.push(sternum);
  //head
  let head = mkGCPoint(V(-3.7,0,4.5), .4, true);
  bodyPoints.push(head);
  //pelvis
  let pelvis = mkGCPoint(V(-3.7,0,2.8), .2, false);
  bodyPoints.push(pelvis);
  //left hip
  let lHip = mkGCPoint(V(-4,0,2.8), .2, false);
  bodyPoints.push(lHip);
  //right hip
  let rHip = mkGCPoint(V(-3.4,0,2.8), .2, false);
  bodyPoints.push(rHip);
  //left foot
  let lf = mkGCPoint(V(-4,0,1.2), .2, false);
  bodyPoints.push(lf);
  //right foot
  let rf = mkGCPoint(V(-3.4,0,1.2), .2, false);
  bodyPoints.push(rf);
  

  //sticks connecting points: pointA, pointB, length
  type Stick = {pointA: Point, pointB: Point, length: number}
  
  function mkStick(pointA: Point, pointB: Point): Stick{
    return {pointA, pointB, length:V3.dist(lh.position,ls.position)};
  }

  let sticks: Stick[] = [
    mkStick(lh,ls),
    mkStick(rh,rs),
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
    mkStick(rHip,rf),
    mkStick(lHip,lf)
  ];


  const GRAVITY = .008
  const STICK_ITTERATIONS = 20;
  let waitCount = 60;
  let fixedMoveCount = 65;
  let moveAmt = V(.006,-.1,.4);
  let mouseIsPressed = false;
  let mouseStart = [0,0];
  let mousePosition = [0,0];
  // let rHandHold = false;
  let holdHand = lh;
  let jumpHand = rh;
  const JUMP_SCALE = .01;
  let jump = false;

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

  
  //update points and sticks each frame:
  EM.addSystem("stickAndPoint",Phase.GAME_WORLD,[],[],()=>{

    //update points and add gravity:
    


    for(let point of bodyPoints){
      // if (point.position===point.prevPosition){
      //   point.prevPosition = V3.copy(point.prevPosition, V3.add(point.prevPosition,V(-10,10,-10)));
      // }
      if(point.fixed){
        if(waitCount>0){
          waitCount--;
        }
        else if(fixedMoveCount>0){
          fixedMoveUpdate(point);
          fixedMoveCount--;
        }
        else if (fixedMoveCount<=0 && fixedMoveCount>-5) fixedMoveCount--;
        
        // else if(fixedMoveCount===0){
        //   fixedMoveCount--;
        //   point.fixed = false;
        //   rh.fixed = true;
        // }
      //   if(point.position===point.prevPosition){
      //     V3.add(point.position, V(10,-10,10),point.position);
      //     point.fixed = false;
      //     continue;
      //   }
      //   else point.fixed = false;
        continue;
      }
      else{
        const nextPrevPosition = V3.clone(point.position);
        V3.add(V3.sub(point.position,point.prevPosition),point.position, point.position);
        point.position[2] -= GRAVITY;
        // V3.add(V(0,0,GRAVITY),point.position, point.position)
        V3.copy(point.prevPosition, nextPrevPosition);
      }
    }

    //function for updating "fixed" points: what happens to the fixed point each frame?
    //test:
    function fixedMoveUpdate(point: Point){
      // let pos = V3.clone(V3.add(point.position,moveAmt,point.position))
      let pos = J3.add(point.position,moveAmt,false);
      EM.set(point.object,PositionDef,pos);
      point.prevPosition = pos;
      moveAmt[2]-=GRAVITY;
      // point.position = pos;
    }
    
    // function InitJump(){
    //   mouseIsPressed = true;
    //   mouseStart[0] = ;
    //   mouseStart[1] = ;
    //   jumpHand.position = V3.clone(holdHand.position);
    //   // jumpHand.fixed = true;
    // }
    // function DragJump(){
    //   //
    //   mousePosition[0] = ;
    //   mousePosition[1] = ;
    //   jumpHand.position[0]+= mousePosition[0]-mouseStart[0];
    //   jumpHand.position[2]+= mousePosition[1]-mouseStart[1];
      
    // }
    // function ReleaseJump(){
    //   mousePosition[0] = ;
    //   mousePosition[1] = ;
    //   moveAmt[0] = (mouseStart[0] - mousePosition[0]) * JUMP_SCALE;
    //   moveAmt[2] = (mouseStart[1] - mousePosition[1]) * JUMP_SCALE;
    //   jump = true;
    //   jumpHand.fixed = true;
    //   holdHand.fixed = false;
    // }
    // function catchHold(){

    // }

    //adjust points to reconcile stick lengths:
    // if (false)
    // const _stk = tmpStack();
    for(let i = 0; i<STICK_ITTERATIONS;i++){
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
    // _stk.pop();

    // set object locations to their calculated locatoins:
    for(let point of bodyPoints){
      EM.set(point.object,PositionDef,point.position);
    }

    if(fixedMoveCount === -5){
      fixedMoveCount--;
      head.fixed = false;
      rh.fixed = true;
    }


    // draw sticks
    for (let i = 0; i < sticks.length; i++)
      sketchLine(sticks[i].pointA.position, sticks[i].pointB.position, {
        color: ENDESGA16.blue,
        key: `stick_${i}`
      })

  });












  // V3.dist()
  // let hangPoint = holds[0].position;
  // let rightFixed = true;
  // const rhLoc = hangPoint;


  


  // gizmo
  addWorldGizmo(V(0, 0, 0), 5);


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
}
