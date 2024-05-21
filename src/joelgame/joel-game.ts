import { CameraDef, CameraFollowDef, setCameraFollowPosition } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { ECS, EM } from "../ecs/ecs.js";
import { V, V3, quat } from "../matrix/sprig-matrix.js";
import { CubeMesh, HexMesh, PlaneMesh, TetraMesh } from "../meshes/mesh-list.js";
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
import { InputsDef } from "../input/inputs.js";
import { ld53ShipAABBs } from "../wood/shipyard.js";
import { ControllableDef } from "../input/controllable.js";
import { LinearVelocityDef } from "../motion/velocity.js";

const DBG_GHOST = false;
const DEBUG = false;

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
  
  const wallHeight = 40;
  const wallWidth = 20;
  const CLUSTER_VERT_OFFSET = 3;
  const CLUSTER_VERT_VAR = 5;
  const CLUSTER_SIZE = 4;
  

  //build wall
  const wall = EM.mk();
  EM.set(wall, RenderableConstructDef, mkRectMesh(wallWidth,3,wallHeight));
  EM.set(wall, ColorDef, ENDESGA16.darkBrown);
  EM.set(wall, PositionDef, V(0, 1.5, wallHeight / 2));
  EM.set(wall,RotationDef, quat.fromYawPitchRoll(0,Math.PI*.1,0));

  //generate cluster locations:
  const clusters = generateClusters();
  function generateClusters(): V3[]{
    let clusters: V3[] = [];
    let hor = Math.random()* (wallWidth-3) - (wallWidth-3)/2;
    let vert = 5;
    let dep = (vert-(wallHeight/2));
    clusters.push(V(hor, dep, vert));
    while(clusters[clusters.length-1][2] < wallHeight - 10){
      hor = Math.random()* (wallWidth-5) - (wallWidth-5)/2;
      vert = Math.random()* CLUSTER_VERT_VAR + clusters[clusters.length-1][2] + CLUSTER_VERT_OFFSET;
      dep = (vert-(wallHeight/2))*-.33;
      clusters.push(V(hor, dep, vert));
    }
    return clusters;
  }

  
    
  //generate holds
  type Hold = EntityW<[typeof PositionDef]>;
  const holds = generateHolds();
  function generateHolds():Hold[]{
    const holds: Hold[] = [];
    for(const cluster of clusters){
      do{
        const hold = EM.mk();
        EM.set(hold, RenderableConstructDef, TetraMesh);
        EM.set(hold, ColorDef, ENDESGA16.red);
        const hor = Math.random()* CLUSTER_SIZE + cluster[0] - CLUSTER_SIZE / 2;
        const vert = Math.random()* CLUSTER_SIZE + cluster[2] - CLUSTER_SIZE / 2;
        const dep = (vert-(wallHeight/2)) * -.33;
        EM.set(hold, PositionDef, V(hor, dep ,vert));
        EM.set(hold, RotationDef, quat.fromYawPitchRoll(0, Math.PI*.6, 0));
        quat.yaw(hold.rotation, Math.random() * 3, hold.rotation);
        EM.set(hold, ScaleDef, V(Math.random()+.5,Math.random()+.5,Math.random()+.5))
        holds.push(hold)
      }while(Math.random() <.6);
    }
    return holds;
  }

  //get hold catch points
  const holdCatchPoints = getHoldCatchPoints();
  function getHoldCatchPoints(): V3[]{
    let catchPoints: V3[] = [];
    for(const hold of holds){
      catchPoints.push(V(hold.position[0], hold.position[1] - 2, hold.position[2]));
    }
    return catchPoints;
  }
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
  const GUY_LH_ZERO = V(4.2,0,-5);
  let GUY_LH_START = V(holds[0].position[0], holds[0].position[1] - 2, holds[0].position[2])
  // GUY_LH_START[1] -= 3;
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

  function mkWaterGrid(xWid: number, yDep: number, increment: number, yStart: number, xStart: number, zPos: number = 0): Point[][]{
    const xNum = Math.floor(xWid/increment);
    const yNum = Math.floor(yDep/increment);
    const waterArr: Point[][] = [];
    for(let y=0;y<=yNum;y++){
      waterArr.push([]);
      for(let x = 0; x <= xNum; x++){
        waterArr[y].push(mkPoint(mkEntity(mkCubeMesh(),V(xStart + increment * x, yStart + increment * y, zPos),.1,ENDESGA16.lightBlue),false));
      }
      waterArr[y][0].fixed = true;
      waterArr[y][xNum].fixed = true;
    }
    return waterArr;
  }

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
  let lh = mkGCPoint(V(-4.2,0,5), .2, true);
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
  type Stick = {pointA: Point, pointB: Point, length: number}
  
  function mkStick(pointA: Point, pointB: Point): Stick{
    return {pointA, pointB, length:V3.dist(pointA.position,pointB.position)};
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
    // mkStick(rHip,rf),
    // mkStick(lHip,lf),
    mkStick(rHip,rk),
    mkStick(rk,rf),
    mkStick(lHip,lk),
    mkStick(lk,lf),
    mkStick(head,pelvis)
  ];


  const GRAVITY = .008
  const STICK_ITTERATIONS = 20;
  let waitCount = 60;
  let fixedMoveCount = 65;
  let moveAmt = V(.006,-.1,.4);
  let mouseIsPressed = false;
  let mouseStart = V(0,0);
  let mousePosition = V(0,0);
  let holdHand = lh;
  let jumpHand = rh;
  const JUMP_SCALE = .004;
  let jump = false;
  const ESCAPE_AMT = 10;
  let escapeCurrentHoldCount = ESCAPE_AMT;
  const JUMP_OUT_SCALE = -.15;
  const CATCH_ACURACY = 1.75;
  const ARM_STRETCH_SCALE = .02;
  // const GUY_START = holds[0].position;
  let started: boolean = false;
  const CAMERA_OFFSET = V(0,-20,3);
  let cameraPosition = J3.add(CAMERA_OFFSET,GUY_LH_START);
  const CAMERA_SPEED = .01;

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

  function startGame(){
    jumpHand.fixed = false;
      holdHand.fixed = true;
      jump = false;
      holdHand.position = V3.clone(GUY_LH_START);
      holdHand.prevPosition= lh.position;
  }
  //update points and sticks each frame:
  EM.addSystem("stickAndPoint",Phase.GAME_WORLD,[],[InputsDef],(_, {inputs})=>{

    //init game
    if(!started){
      started = true;
      startGame();
    } 

    //calculate change to camera position
    const camTargetPos = J3.add(holdHand.position,CAMERA_OFFSET);
    let camMovement = J3.sub(camTargetPos, cameraPosition);
    if(Math.abs(V3.len(camMovement)) > 1){
      V3.copy(cam.position,J3.add(cameraPosition,J3.scale(camMovement,CAMERA_SPEED,false),false));
    }


    //Reset:
    //to do: add game over check
    if(inputs.keyClicks['m']){
      startGame();
      jumpHand.fixed = false;
      holdHand.fixed = true;
      jump = false;
      holdHand.position = V3.clone(GUY_LH_START);
      holdHand.prevPosition= lh.position;
    }

    if(!mouseIsPressed && inputs.ldown){
      mouseIsPressed = true;
      InitJump();
    }
    else if(mouseIsPressed){
      if(inputs.ldown){
        DragJump();
      }
      else {
        ReleaseJump();
        mouseIsPressed = false;
      }
    }

    //update points and add gravity:
    for(let point of bodyPoints){

      if(DEBUG) console.log(inputs.mouseMov);
      // if (point.position===point.prevPosition){
      //   point.prevPosition = V3.copy(point.prevPosition, V3.add(point.prevPosition,V(-10,10,-10)));
      // }
      if(point.fixed){
        if(jump){
          fixedMoveUpdate(point);
          escapeCurrentHoldCount--;
          if(escapeCurrentHoldCount<0){
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
    
    function InitJump(){
      inputs.ldown
      mouseIsPressed = true;
      mouseStart[0] = 0;
      mouseStart[1] = 0;
      mousePosition[0] = 0;
      mousePosition[1] = 0;
      // mouseStart[0] = inputs.mousePos[0];
      // mouseStart[1] = inputs.mousePos[1];
      jumpHand.position = V3.clone(holdHand.position);
      // jumpHand.fixed = true;
    }
    function DragJump(){
      //
      // mousePosition = inputs.mousePos;
      mousePosition[0] += inputs.mouseMov[0];
      mousePosition[1] += inputs.mouseMov[1];
      jumpHand.position[0]+= (mousePosition[0]-mouseStart[0]) * ARM_STRETCH_SCALE;
      jumpHand.position[2]+= (mouseStart[1] - mousePosition[1]) * ARM_STRETCH_SCALE;
    }
    function ReleaseJump(){
      // mousePosition = inputs.mousePos;
      moveAmt[0] = (mouseStart[0] - mousePosition[0]) * JUMP_SCALE;
      moveAmt[2] = (mousePosition[1] - mouseStart[1]) * JUMP_SCALE;
      moveAmt[1] = moveAmt[2] * JUMP_OUT_SCALE;
      jump = true;
      jumpHand.fixed = true;
      holdHand.fixed = false;
    }
    // function catchHold(){
    //   jump = false;
    //   const temp = jumpHand;
    //   jumpHand = holdHand;
    //   holdHand = jumpHand;
    // }
    function checkForHoldColision(): boolean{
      for(const catchPoint of holdCatchPoints){
        if(V3.dist(jumpHand.position,catchPoint) < CATCH_ACURACY){
          jumpHand.position = V3.clone(catchPoint);
          jumpHand.prevPosition = jumpHand.position;
          const temp = jumpHand;
          jumpHand = holdHand;
          holdHand = temp;
          jump = false;
          escapeCurrentHoldCount = ESCAPE_AMT;
        }
      }
      return false;

    }

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
  const camTargetPos = J3.add(holdHand.position,CAMERA_OFFSET);
  let camMovement = J3.sub(camTargetPos, cameraPosition);
  if(Math.abs(V3.len(camMovement)) > 1){
    J3.add(cameraPosition,J3.scale(camMovement,CAMERA_SPEED,false),false);
  }
  
  


}
