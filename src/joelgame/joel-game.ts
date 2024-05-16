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
import { sketch } from "../utils/sketch.js";
import { addWorldGizmo } from "../utils/utils-game.js";
import { createObj, defineObj } from "../ecs/em-objects.js";
import { createSun, initGhost } from "../graybox/graybox-helpers.js";
import { Mesh, scaleMesh } from "../meshes/mesh.js";
import { Phase } from "../ecs/sys-phase.js";
import { Entity, EntityW } from "../ecs/em-entities.js";

const DBG_GHOST = true;

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
  function mkEntity(mesh: Mesh, position: V3, scale: number, color: V3 ):EntityW<[typeof PositionDef]>{
    let ent = EM.mk();
    EM.set(ent, RenderableConstructDef, mesh);
    EM.set(ent, ColorDef, color);
    EM.set(ent, PositionDef, position);
    EM.set(ent, ScaleDef, V(scale,scale,scale));
    return ent;
  }

  function mkGrayCube(position:V3, scale: number): EntityW<[typeof PositionDef]>{
    return mkEntity(mkCubeMesh(), position, scale, ENDESGA16.darkGray);
  }

  
  type Point = {position: V3, prevPosition: V3, fixed: boolean, object: EntityW<[typeof PositionDef]>};

  function mkPoint(e: EntityW<[typeof PositionDef]>, fixed: boolean): Point {
    return {position: V3.clone(e.position), 
    prevPosition: V3.clone(e.position),
    object: e, fixed: fixed};
  }

  function mkGCPoint(position:V3, scale: number, fixed: boolean): Point{
    return mkPoint(mkGrayCube(position,scale),fixed);
  }


  let bodyPoints: Point[] = [];

  //bodyPoints array contains points with definitions for position, prevPosition, fixed, and object
  // let bodyPoints: {position:V3,prevPosition:V3,fixed:Boolean,object:Entity}[] = [];
  //left hand
  let lh = mkGCPoint(V(-4.2,0,5), .2, true);
  bodyPoints.push(lh)
  
  
  //
  // let lh = mkGrayCube();
  // // let lh = EM.mk();
  // EM.set(lh,RenderableConstructDef, mkCubeMesh());
  // EM.set(lh, ColorDef, ENDESGA16.darkGray);
  // EM.set(lh,PositionDef,V(-4.2,0,5));
  // EM.set(lh,ScaleDef,V(.2,.2,.2));
  // function mkPoint(e: EntityW<[typeof PositionDef]>): Point {
    
  // }
  // let lhPoint = {position:V3.clone(lh.position), prevPosition:V3.clone(lh.position), fixed:true, object:lh}
  // bodyPoints.push(lhPoint);
  //left shoulder
  let ls = mkGCPoint(V(-4.2,0,4), .2, false);
  bodyPoints.push(ls);
  // let ls = EM.mk();
  // EM.set(ls,RenderableConstructDef, mkCubeMesh());
  // EM.set(ls, ColorDef, ENDESGA16.darkGray);
  // EM.set(ls,PositionDef,V(-4.2,0,4));
  // EM.set(ls,ScaleDef,V(.2,.2,.2));
  // let ls = {position:ls.position, prevPosition:ls.position, fixed:false, object:ls}
  // bodyPoints.push(lsPoint);

  //right hand
  let rh = mkGCPoint(V(-3.2,0,3), .2, false);
  bodyPoints.push(rh);

  // let rh = EM.mk();
  // EM.set(rh,RenderableConstructDef, mkCubeMesh());
  // EM.set(rh, ColorDef, ENDESGA16.darkGray);
  // EM.set(rh,PositionDef,V(-3.2,0,3));
  // EM.set(rh,ScaleDef,V(.2,.2,.2));
  // let rhPoint = {position:rh.position, prevPosition:rh.position, fixed:false, object:rh}
  // bodyPoints.push(rhPoint);
  //right shoulder
  let rs = mkGCPoint(V(-3.2,0,4), .2, false);
  bodyPoints.push(rs);
  // let rs = EM.mk();
  // EM.set(rs,RenderableConstructDef, mkCubeMesh());
  // EM.set(rs, ColorDef, ENDESGA16.darkGray);
  // EM.set(rs,PositionDef,V(-3.2,0,4));
  // EM.set(rs,ScaleDef,V(.2,.2,.2));
  // let rsPoint = {position:rs.position, prevPosition:rs.position, fixed:false, object:rs}
  // bodyPoints.push(rsPoint);
  //sternum
  let sternum = mkGCPoint(V(-3.7,0,3.9), .002, false);
  bodyPoints.push(sternum);
  // let ster = EM.mk();
  // EM.set(ster,RenderableConstructDef, mkCubeMesh());
  // EM.set(ster, ColorDef, ENDESGA16.darkGray);
  // EM.set(ster,PositionDef,V(-3.7,0,3.9));
  // EM.set(ster,ScaleDef,V(.002,.002,.002));
  // let sterPoint = {position:ster.position, prevPosition:ster.position, fixed:false, object:ster}
  // bodyPoints.push(sterPoint);
  //head
  let head = mkGCPoint(V(-3.7,0,4.5), .4, false);
  bodyPoints.push(head);
  // let head = EM.mk();
  // EM.set(head,RenderableConstructDef, mkCubeMesh());
  // EM.set(head, ColorDef, ENDESGA16.darkGray);
  // EM.set(head,PositionDef,V(-3.7,0,4.5));
  // EM.set(head,ScaleDef,V(.4,.4,.4));
  // let headPoint = {position:head.position, prevPosition:head.position, fixed:false, object:head}
  // bodyPoints.push(headPoint);
  //pelvis
  let pelvis = mkGCPoint(V(-3.7,0,2.8), .2, false);
  bodyPoints.push(pelvis);
  // let pelvis = EM.mk();
  // EM.set(pelvis,RenderableConstructDef, mkCubeMesh());
  // EM.set(pelvis, ColorDef, ENDESGA16.darkGray);
  // EM.set(pelvis,PositionDef,V(-3.7,0,2.8));
  // EM.set(pelvis,ScaleDef,V(.1,.1,.1));
  // let pelvisPoint = {position:pelvis.position, prevPosition:pelvis.position, fixed:false, object:pelvis}
  // bodyPoints.push(pelvisPoint);
  //left hip
  let lHip = mkGCPoint(V(-4,0,2.8), .2, false);
  bodyPoints.push(lHip);
  // let lHip = EM.mk();
  // EM.set(lHip,RenderableConstructDef, mkCubeMesh());
  // EM.set(lHip, ColorDef, ENDESGA16.darkGray);
  // EM.set(lHip,PositionDef,V(-4,0,2.8));
  // EM.set(lHip,ScaleDef,V(.2,.2,.2));
  // let lHipPoint = {position:lHip.position, prevPosition:lHip.position, fixed:false, object:lHip}
  // bodyPoints.push(lHipPoint);
  //right hip
  let rHip = mkGCPoint(V(-3.4,0,2.8), .2, false);
  bodyPoints.push(rHip);
  // let rHip = EM.mk();
  // EM.set(rHip,RenderableConstructDef, mkCubeMesh());
  // EM.set(rHip, ColorDef, ENDESGA16.darkGray);
  // EM.set(rHip,PositionDef,V(-3.4,0,2.8));
  // EM.set(rHip,ScaleDef,V(.2,.2,.2));
  // let rHipPoint = {position:rHip.position, prevPosition:rHip.position, fixed:false, object:rHip}
  // bodyPoints.push(rHipPoint);
  //left foot
  let lf = mkGCPoint(V(-4,0,1.6), .2, false);
  bodyPoints.push(lf);
  // let lf = EM.mk();
  // EM.set(lf,RenderableConstructDef, mkCubeMesh());
  // EM.set(lf, ColorDef, ENDESGA16.darkGray);
  // EM.set(lf,PositionDef,V(-4,0,1.6));
  // EM.set(lf,ScaleDef,V(.2,.2,.2));
  // let lfPoint = {position:lf.position, prevPosition:lf.position, fixed:false, object:lf}
  // bodyPoints.push(lfPoint);
  //right foot
  let rf = mkGCPoint(V(-3.4,0,1.6), .2, false);
  bodyPoints.push(rf);
  // let rf = EM.mk();
  // EM.set(rf,RenderableConstructDef, mkCubeMesh());
  // EM.set(rf, ColorDef, ENDESGA16.darkGray);
  // EM.set(rf,PositionDef,V(-3.4,0,1.6));
  // EM.set(rf,ScaleDef,V(.2,.2,.2));
  // let rfPoint = {position:rf.position, prevPosition:rf.position, fixed:false, object:rf}
  // bodyPoints.push(rfPoint);

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


    // {pointA:lh,pointB:ls,length:V3.dist(lh.position,ls.position)},
    // {pointA:rh,pointB:rs,length:V3.dist(rh.position,rs.position)},
    // {pointA:ls,pointB:rs,length:V3.dist(ls.position,rs.position)},
    // {pointA:ls,pointB:sternum,length:V3.dist(ls.position,sternum.position)},
    // {pointA:rs,pointB:sternum,length:V3.dist(rs.position,sternum.position)},
    // {pointA:head,pointB:sternum,length:V3.dist(head.position,sternum.position)},
    // {pointA:head,pointB:ls,length:V3.dist(head.position,ls.position)},
    // {pointA:head,pointB:rs,length:V3.dist(head.position,rs.position)},
    // {pointA:pelvis,pointB:sternum,length:V3.dist(pelvis.position,sternum.position)},
    // {pointA:pelvis,pointB:ls,length:V3.dist(pelvis.position,ls.position)},
    // {pointA:pelvis,pointB:rs,length:V3.dist(pelvis.position,rs.position)},
    // {pointA:pelvis,pointB:rHip,length:V3.dist(pelvis.position,rHip.position)},
    // {pointA:pelvis,pointB:lHip,length:V3.dist(pelvis.position,lHip.position)},
  //   {pointA:rHip,pointB:lHip,length:V3.dist(rHip.position,lHip.position)},
  //   {pointA:lf,pointB:lHip,length:V3.dist(lf.position,lHip.position)},
  //   {pointA:rf,pointB:rHip,length:V3.dist(rf.position,rHip.position)}
  // ];
  
  const GRAVITY = -100
  const STICK_ITTERATIONS = 5;
  let fixedMoveCount = 180;

  
  //update points and sticks each frame:
  EM.addSystem("stickAndPoint",Phase.GAME_WORLD,[],[],()=>{
    //update points and add gravity:
    for(let point of bodyPoints){
      if(point.fixed){
        if(fixedMoveCount>0){
          fixedUpdate(point);
          fixedMoveCount--;
        }
        continue;
      }
      const nextPrevPosition = V3.clone(point.position);
      V3.add(V3.sub(point.position,point.prevPosition),point.position, point.position);
      // point.position[2] -= GRAVITY;
      console.log("1: " + point.position[2]);
      // V3.add(V(0,0,GRAVITY),point.position, point.position)
      console.log("2: " + point.position[2]);
      V3.copy(point.prevPosition, nextPrevPosition);
    }

    //function for updating "fixed" points: what happens to the fixed point each frame?
    //test:
    function fixedUpdate(point:{position:V3,prevPosition:V3,fixed:Boolean,object:Entity}){
      let pos = V3.clone(V3.add(point.position,V(.05,-.05,.05)))
      EM.set(point.object,PositionDef,pos);
      point.position = pos;
    }

    //adjust points to reconcile stick lengths:
    // if (false)
    for(let i = 0; i<STICK_ITTERATIONS;i++){
      for(let stick of sticks){
        // V3.mid()
        const stickCenter = V3.scale(V3.add(stick.pointA.position, stick.pointB.position),.5);
        const stickDir = V3.norm(V3.sub(stick.pointA.position, stick.pointB.position));
        if(!stick.pointA.fixed){
          V3.copy(stick.pointA.position, V3.add(stickCenter,V3.scale(stickDir,stick.length/2)));
        }
        if(!stick.pointB.fixed){
          V3.copy(stick.pointB.position, V3.sub(stickCenter,V3.scale(stickDir,stick.length/2)));
        }
      }
      // to do: shuffle sticks array
    }

    // set object locations to their calculated locatoins:
    for(let point of bodyPoints){
      EM.set(point.object,PositionDef,point.position);
    }

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
