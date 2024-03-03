import { ENDESGA16 } from "../color/palettes.js";
import { V, V2, V3, mat4, quat, tV } from "../matrix/sprig-matrix.js";
import {
  AABB2,
  createAABB,
  createAABB2,
  getAABBFromPositions,
  getCenterFromAABB,
  transformAABB,
} from "../physics/aabb.js";
import { OBB, getOBBCornersTemp } from "../physics/obb.js";
import { sketch, sketchLine } from "../utils/sketch.js";
import { aabbDbg, vec3Dbg, vec3Mid } from "../utils/utils-3d.js";
import {
  addWorldGizmo,
  drawBall,
  drawGizmosForMat4,
  drawLine,
  drawPlane,
} from "../utils/utils-game.js";

// TODO(@darzu): Move this. Merge this with others like parameteric?

/*
ToDo:
[x] change to y-forward
[ ] parameterize hit box / miss box using 3D projected to 2D OBB w/ projectile profile box too?
*/

const DBG_CANNONS = true;
const DBG_getAimAndMissPositions = true;

const GRAVITY = 6.0 * 0.00001;

const MAX_THETA = Math.PI / 2 - Math.PI / 16;
const MIN_THETA = -MAX_THETA;

const TARGET_WIDTH = 12;
const TARGET_LENGTH = 30;
const MISS_TARGET_LENGTH = 55;
const MISS_TARGET_WIDTH = 22;
const MISS_BY_MAX = 10;

const MAX_RANGE = 300;

export interface FireSolutionOpt {
  maxRadius: number;
  sourcePos: V3.InputT;
  sourceRot: quat.InputT;
  targetPos: V3.InputT;
  targetVel: V3.InputT;
  targetDir: V3.InputT;
  projectileSpeed: number;
  miss: boolean;
}

interface Plane {
  org: V3;
  norm: V3;
}

function projectOntoPlane(v: V3.InputT, p: Plane, out?: V3): V3 {
  throw "TODO";
}

// TODO(@darzu): MOVE into aabb.ts
export function getAABB2PerimeterAsParametric(
  aabb: AABB2
): (t: number, out?: V2) => V2 {
  // go clockwise starting from min
  const width = aabb.max[0] - aabb.min[0];
  const height = aabb.max[1] - aabb.min[1];
  const perimeter = width * 2 + height * 2;
  const horzSegT = width / perimeter;
  const vertSegT = height / perimeter;
  const tTL = vertSegT;
  const tTR = vertSegT + horzSegT;
  const tBR = vertSegT * 2 + horzSegT;
  return (t, out) => {
    out = out ?? V2.tmp();
    t = Math.abs(t % 1.0); // TODO(@darzu): bug, this doesn't wrap negative smoothly
    if (t < tTL) {
      // vert left +y
      const t2 = t / vertSegT;
      out[0] = aabb.min[0];
      out[1] = aabb.min[1] + height * t2;
    } else if (t < tTR) {
      // horiz top +x
      const t2 = (t - tTL) / horzSegT;
      out[0] = aabb.min[0] + width * t2;
      out[1] = aabb.max[1];
    } else if (t < tBR) {
      // vert right -y
      const t2 = (t - tTR) / vertSegT;
      out[0] = aabb.max[0];
      out[1] = aabb.max[1] - height * t2;
    } else {
      // horiz bottom -x
      const t2 = (t - tBR) / horzSegT;
      out[0] = aabb.max[0] - width * t2;
      out[1] = aabb.min[1];
    }
    return out;
  };
}

let _lastT = 0.0; // TODO(@darzu): HACK for debugging
export function getAimAndMissPositions(opt: {
  // TODO(@darzu):
  target: OBB;
  srcToTrg: V3.InputT;
}) {
  // TODO(@darzu): BROKEN.
  const rot = quat.fromForwardAndUpish(opt.srcToTrg, V3.UP);
  const incomingPos = V3.sub(opt.target.center, opt.srcToTrg);
  // const viewM = mat4.lookAt(incomingPos, opt.target.center, V3.UP);
  const worldCorners = getOBBCornersTemp(opt.target);
  // worldCorners.forEach((v) => drawBall(v, 0.5, ENDESGA16.white));
  const localToWorldM = mat4.fromRotationTranslation(rot, opt.target.center);
  const worldToLocalM = mat4.invert(localToWorldM);

  // TODO(@darzu): how to visualize a mat4 ?
  //    visualize a space transformation:
  //      point cloud of unit cube colored by x,y,z
  //      to output points x,y,z
  //    or just see what it does to the gizmo ? draw lines from tips

  // drawGizmosForMat4(localToWorldM, 20);

  // return;

  // worldCorners.forEach((v, i) => {
  //   sketchLine(incomingPos, v, {
  //     key: `corner${i}`,
  //     color: ENDESGA16.white,
  //   });
  // });

  const localCorners = worldCorners.map((v) => V3.tMat4(v, worldToLocalM, v));
  // const viewCorners = worldCorners
  //   .map((v) => V3.sub(v, opt.target.center, v))
  //   .map((v) => V3.tQuat(v, rot, v));
  // TODO(@darzu): To be more precise, we should walk the parameter of the 6 outer corners instead of fitting an AABB
  const localAABB = getAABBFromPositions(createAABB(), localCorners);

  // only care about the xz plane
  localAABB.min[1] = 0;
  localAABB.max[1] = 0;

  const worldMin = V3.tMat4(localAABB.min, localToWorldM);
  const worldMax = V3.tMat4(localAABB.max, localToWorldM);

  // console.log(aabbDbg(localAABB));
  sketchLine(incomingPos, worldMin, {
    key: "projMin",
    color: ENDESGA16.darkRed,
  });
  sketchLine(incomingPos, worldMax, {
    key: "projMax",
    color: ENDESGA16.red,
  });
  sketchLine(incomingPos, opt.target.center, {
    key: "projMid",
    color: ENDESGA16.lightBlue,
  });

  const localAABB2 = createAABB2(
    V(localAABB.min[0], localAABB.min[2]),
    V(localAABB.max[0], localAABB.max[2])
  );

  const tFn = getAABB2PerimeterAsParametric(localAABB2);

  _lastT += 0.01; // TODO(@darzu): DBG hack

  const pos2 = tFn(_lastT);
  const pos = tV(pos2[0], 0, pos2[1]);

  const worldPos = V3.tMat4(pos, localToWorldM);

  sketchLine(incomingPos, worldPos, {
    key: "projPerim",
    color: ENDESGA16.lightGreen,
  });
  // drawBall(worldMin, 1, ENDESGA16.darkRed);
  // drawLine(incomingPos, worldMin, ENDESGA16.darkRed);
  // drawBall(worldMax, 1, ENDESGA16.red);
  // drawLine(incomingPos, worldMax, ENDESGA16.red);

  // drawLine(incomingPos, opt.target.center, ENDESGA16.lightBlue);
  // drawPlane(
  //   vec3Mid(V3.tmp(), worldMin, worldMax),
  //   V3.neg(opt.srcToTrg),
  //   20,
  //   ENDESGA16.orange
  // );
  // TODO(@darzu): IMPL! Still bugged.
}

export function getFireSolution(opt: FireSolutionOpt): quat | undefined {
  const { sourcePos, targetPos, maxRadius } = opt;

  // are we within range?
  const dist = V3.dist(sourcePos, targetPos);
  if (MAX_RANGE < dist) {
    return undefined;
  }

  // determine where to aim
  const aimPos = getTargetMissOrHitPosition(opt);

  // console.log(`${opt.miss}: ${vec3Dbg(aimPos)}`);

  // debugging
  if (DBG_CANNONS)
    drawBall(
      V3.clone(aimPos),
      0.5,
      opt.miss ? ENDESGA16.darkRed : ENDESGA16.darkGreen
    );

  // determine how to aim
  const worldRot = getFireDirection(aimPos, opt);

  if (!worldRot)
    // no valid firing solution
    return undefined;

  // TODO(@darzu): re-enstate
  // check max arc
  const yaw = quat.getAngle(opt.sourceRot, worldRot);
  if (maxRadius < Math.abs(yaw))
    // out of angle
    return undefined;

  return worldRot;
}

export function getTargetMissOrHitPosition(
  { targetPos, targetDir, miss }: FireSolutionOpt,
  out?: V3
): V3 {
  // const targetDir = V3.norm(targetVel);

  // return vec3.copy(out ?? V3.tmp(), targetPos);

  let tFwd = V3.copy(V3.tmp(), targetDir);
  let tRight = V3.cross(targetDir, V3.UP);

  // console.log(
  //   `targetDir: ${vec3Dbg(targetDir)}, tFwd: ${vec3Dbg(
  //     tFwd
  //   )}, tRight: ${vec3Dbg(tRight)}`
  // );

  // pick an actual target to aim for on the ship
  if (miss) {
    let rightMul = 0;
    let fwdMul = 0;
    if (Math.random() < 0.5) {
      // miss width-wise
      rightMul = 1;
    } else {
      // miss length-wise
      fwdMul = 1;
    }
    if (Math.random() < 0.5) {
      rightMul *= -1;
      fwdMul *= -1;
    }

    V3.scale(
      tFwd,
      fwdMul * (Math.random() * MISS_BY_MAX + 0.5 * MISS_TARGET_LENGTH),
      tFwd
    );
    V3.scale(
      tRight,
      rightMul * (Math.random() * MISS_BY_MAX + 0.5 * MISS_TARGET_WIDTH),
      tRight
    );

    // TODO: why do we move missed shots up?
    tRight[2] += 5;
  } else {
    V3.scale(tFwd, (Math.random() - 0.5) * TARGET_LENGTH, tFwd);
    V3.scale(tRight, (Math.random() - 0.5) * TARGET_WIDTH, tRight);
  }

  const target = V3.add(
    targetPos,
    V3.add(tFwd, tRight, tRight),
    out ?? V3.tmp()
  );

  return target;
}

export function getFireDirection(
  aimPos: V3.InputT,
  { sourcePos, targetVel, projectileSpeed }: FireSolutionOpt
): quat | undefined {
  // NOTE: cannon forward is +X
  // TODO(@darzu): change cannon forward to be +Y?
  const v = projectileSpeed;
  const g = GRAVITY;

  // calculate initial distance
  const d0 = V3.dist(
    [sourcePos[0], sourcePos[1], 0],
    [aimPos[0], aimPos[1], 0]
  );

  // try to lead the target a bit using an approximation of flight
  // time. this will not be exact.
  // TODO(@darzu): sub with exact flight time?
  const flightTime = d0 / (v * Math.cos(Math.PI / 4));
  const leadPos = tV(
    aimPos[0] + targetVel[0] * flightTime * 0.5,
    aimPos[1] + targetVel[1] * flightTime * 0.5,
    aimPos[2] + targetVel[2] * flightTime * 0.5
  );

  // calculate delta between source and target
  const delta = V3.sub(leadPos, sourcePos);

  // calculate horizontal distance to target
  const d = V2.len([delta[0], delta[1]]);

  // vertical distance to target
  const h = delta[2];

  // now, find the pitch angle from our cannon.
  // https://en.wikipedia.org/wiki/Projectile_motion#Angle_%CE%B8_required_to_hit_coordinate_(x,_y)
  let pitch1 = Math.atan(
    (v * v + Math.sqrt(v * v * v * v - g * (g * d * d + 2 * h * v * v))) /
      (g * d)
  );
  let pitch2 = Math.atan(
    (v * v - Math.sqrt(v * v * v * v - g * (g * d * d + 2 * h * v * v))) /
      (g * d)
  );

  // console.log(`pitch1: ${pitch1}, pitch2: ${pitch2}`);

  // prefer smaller theta
  if (pitch2 > pitch1) {
    let temp = pitch1;
    pitch1 = pitch2;
    pitch2 = temp;
  }
  let pitch = pitch2;
  if (isNaN(pitch) || pitch > MAX_THETA || pitch < MIN_THETA) {
    pitch = pitch1;
  }
  if (isNaN(pitch) || pitch > MAX_THETA || pitch < MIN_THETA) {
    // no firing solution--target is too far or too close
    // console.log("no solution");
    return undefined;
  }

  // ok, we have a firing solution. rotate to the right angle

  // console.log(`yaw: ${yaw}, pitch: ${pitch}`);
  // pitch = 0;

  // TODO(@darzu): b/c we're using +X is fwd, we can't use quat.fromYawPitchRoll
  // const worldRot = quat.mk();
  // quat.rotZ(worldRot, -yaw, worldRot);
  // quat.rotY(worldRot, -pitch, worldRot);

  // calculate yaw
  const yaw = V3.getYaw(delta);

  // result
  const worldRot = quat.fromYawPitchRoll(yaw, pitch);

  return worldRot;
}
