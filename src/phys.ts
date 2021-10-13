import { mat4, quat, vec3 } from "./gl-matrix.js";
import { _playerId } from "./main.js";
import {
  AABB,
  checkCollisions,
  collisionPairs,
  doesOverlap,
  resetCollidesWithSet,
} from "./phys_broadphase.js";
import {
  checkAtRest,
  copyMotionProps,
  createMotionProps,
  MotionProps,
  moveObjects,
} from "./phys_motion.js";
import { __isSMI } from "./util.js";

export interface PhysicsObjectUninit {
  id: number;
  motion: MotionProps;
  lastMotion?: MotionProps;
  localAABB: AABB;
  worldAABB: AABB;
  motionAABB: AABB;
}
export interface PhysicsObject {
  id: number;
  motion: MotionProps;
  lastMotion: MotionProps;
  localAABB: AABB;
  worldAABB: AABB;
  motionAABB: AABB;
}
export interface PhysicsResults {
  collidesWith: CollidesWith;
  collidesData: Map<IdPair, CollisionData>;
}

// TODO(@darzu):
// CollidesWith usage:
//  is a object colliding?
//    which objects is it colliding with?
//  list all colliding pairs
export type CollidesWith = Map<number, number[]>;

export interface CollisionData {
  aId: number;
  bId: number;
  aRebound: number;
  bRebound: number;
  aOverlap: vec3;
  bOverlap: vec3;
}

export let _motionPairsLen = 0;

export type IdPair = number;
export function idPair(aId: number, bId: number): IdPair {
  // TODO(@darzu): need a better hash?
  // TODO(@darzu): for perf, ensure this always produces a V8 SMI when given two <2^16 SMIs.
  //                Also maybe constrain ids to <2^16
  const h = aId < bId ? (aId << 16) ^ bId : (bId << 16) ^ aId;
  // TODO(@darzu): DEBUGGING for perf, see comments in __isSMI
  if (!__isSMI(h)) console.error(`id pair hash isn't SMI: ${h}`);
  return h;
}

const _collisionVec = vec3.create();
const _collisionOverlap = vec3.create();
const _collisionAdjOverlap = vec3.create();
const _collisionRefl = vec3.create();

const _motionAABBs: { aabb: AABB; id: number }[] = [];

const _collidesWith: CollidesWith = new Map();
const _collidesData: Map<IdPair, CollisionData> = new Map();

export function stepPhysics(
  objDictUninit: Record<number, PhysicsObjectUninit>,
  dt: number
): PhysicsResults {
  // ensure all phys objects are fully initialized
  // TODO(@darzu): this is a little strange
  for (let o of Object.values(objDictUninit))
    if (!o.lastMotion)
      o.lastMotion = copyMotionProps(createMotionProps({}), o.motion);
  const objDict = objDictUninit as Record<number, PhysicsObject>;

  const objs = Object.values(objDict);

  // move objects
  moveObjects(objDict, dt, _collidesWith, _collidesData);

  // over approximation during motion
  let motionCollidesWith: CollidesWith | null = null;

  // actuall collisions
  resetCollidesWithSet(_collidesWith, objs);
  _collidesData.clear();

  // update motion sweep AABBs
  for (let o of objs) {
    for (let i = 0; i < 3; i++) {
      o.motionAABB.min[i] = Math.min(
        o.localAABB.min[i] + o.motion.location[i],
        o.localAABB.min[i] + o.lastMotion.location[i]
      );
      o.motionAABB.max[i] = Math.max(
        o.localAABB.max[i] + o.motion.location[i],
        o.localAABB.max[i] + o.lastMotion.location[i]
      );
    }
  }

  // update "tight" AABBs
  for (let o of objs) {
    vec3.add(o.worldAABB.min, o.localAABB.min, o.motion.location);
    vec3.add(o.worldAABB.max, o.localAABB.max, o.motion.location);
  }

  // check for possible collisions using the motion swept AABBs
  if (_motionAABBs.length !== objs.length) _motionAABBs.length = objs.length;
  for (let i = 0; i < objs.length; i++) {
    if (!_motionAABBs[i]) {
      _motionAABBs[i] = {
        id: objs[i].id,
        aabb: objs[i].motionAABB,
      };
    } else {
      _motionAABBs[i].id = objs[i].id;
      _motionAABBs[i].aabb = objs[i].motionAABB;
    }
  }
  motionCollidesWith = checkCollisions(_motionAABBs);
  let motionPairs = [...collisionPairs(motionCollidesWith)];
  _motionPairsLen = motionPairs.length;

  // TODO(@darzu): DEBUG
  // console.log(`pairs: ${motionPairs.map((p) => p.join("v")).join(",")}`);

  const COLLISION_ITRS = 100;

  // we'll track which objects have moved each itr,
  // since we just ran dynamics assume everything has moved
  const lastObjMovs: { [id: number]: boolean } = {};
  for (let o of objs) lastObjMovs[o.id] = true;

  // we'll track how much each object should be adjusted each itr
  const nextObjMovFracs: { [id: number]: number } = {};

  // our loop condition
  let anyMovement = true;
  let itr = 0;

  while (anyMovement && itr < COLLISION_ITRS) {
    // TODO(@darzu): DEBUG
    // console.log(`itr: ${itr}`); // TODO(@darzu): DEBUG

    // enumerate the possible collisions, looking for objects that need to pushed apart
    for (let [aId, bId] of motionPairs) {
      if (bId < aId) throw `a,b id pair in wrong order ${bId} > ${aId}`;

      // did one of these objects move?
      if (!lastObjMovs[aId] && !lastObjMovs[bId]) continue;

      const a = objDict[aId];
      const b = objDict[bId];

      // TODO(@darzu): IMPLEMENT
      // // is one of these objects dynamic?
      // if (a.motion.atRest && b.motion.atRest) continue;

      if (!doesOverlap(a.worldAABB, b.worldAABB)) {
        // TODO(@darzu): DEBUG
        // console.log(`motion miss ${aId}vs${bId}`);
        // a miss
        continue;
      }

      // record the real collision
      const h = idPair(aId, bId);
      // TODO(@darzu): DEBUG
      // if (_playerId === aId || _playerId === bId) {
      //   console.log(`new hash w/ ${aId}-${bId}: ${h}`);
      // }
      if (!_collidesData.has(h)) {
        _collidesWith.get(aId)!.push(bId);
        _collidesWith.get(bId)!.push(aId);

        // TODO(@darzu): DEBUG
        // if (_playerId === aId || _playerId === bId) {
        //   console.log(`new col w/ ${aId}-${bId}`);
        // }
      }

      // compute collision info
      const colData = computeCollisionData(a, b, itr);
      _collidesData.set(h, colData);

      // update how much we need to rebound objects by
      const { aRebound, bRebound } = colData;
      if (aRebound < Infinity)
        nextObjMovFracs[aId] = Math.max(nextObjMovFracs[aId] || 0, aRebound);
      if (bRebound < Infinity)
        nextObjMovFracs[bId] = Math.max(nextObjMovFracs[bId] || 0, bRebound);
    }

    // adjust objects Rebound to compensate for collisions
    anyMovement = false;
    for (let o of objs) {
      let movFrac = nextObjMovFracs[o.id];
      if (movFrac) {
        // TODO(@darzu): use last location not linear velocity
        vec3.sub(_collisionRefl, o.lastMotion.location, o.motion.location);
        // vec3.scale(_collisionRefl, _collisionRefl, dt);
        vec3.scale(_collisionRefl, _collisionRefl, movFrac);
        vec3.add(o.motion.location, o.motion.location, _collisionRefl);
        // TODO(@darzu): DEBUG
        // console.log(`moving ${o.id}`);

        // track that movement occured
        anyMovement = true;
      }
    }

    // record which objects moved from this iteration,
    // reset movement fractions for next iteration
    for (let o of objs) {
      lastObjMovs[o.id] = !!nextObjMovFracs[o.id];
      nextObjMovFracs[o.id] = 0;
    }

    // update "tight" AABBs
    for (let o of objs) {
      if (lastObjMovs[o.id]) {
        // TODO(@darzu): DEBUG
        // console.log(`updating worldAABB for ${o.id}`);
        vec3.add(o.worldAABB.min, o.localAABB.min, o.motion.location);
        vec3.add(o.worldAABB.max, o.localAABB.max, o.motion.location);
      }
    }

    itr++;
  }

  // TODO(@darzu): IMPLEMENT "atRest"
  // // check for objects at rest
  // checkAtRest(objs, dt);

  // remember current state for next time
  for (let o of objs) {
    copyMotionProps(o.lastMotion, o.motion);
  }

  return {
    collidesWith: _collidesWith,
    collidesData: _collidesData,
  };
}

function computeCollisionData(
  a: PhysicsObject,
  b: PhysicsObject,
  itr: number
): CollisionData {
  const PAD = 0.001; // TODO(@darzu): not sure if this is wanted

  // determine how to readjust positions
  let aRebound = Infinity;
  let aDim = -1;
  let aOverlapNum = 0;
  let bRebound = Infinity;
  let bDim = -1;
  let bOverlapNum = 0;

  // for each of X,Y,Z dimensions
  for (let i of [0, 1, 2]) {
    // determine who is to the left in this dimension
    let left: PhysicsObject;
    let right: PhysicsObject;
    if (a.lastMotion.location[i] < b.lastMotion.location[i]) {
      left = a;
      right = b;
    } else {
      left = b;
      right = a;
    }

    const overlap = left.worldAABB.max[i] - right.worldAABB.min[i];
    if (overlap <= 0) continue; // no overlap to deal with

    const leftMaxContrib = Math.max(
      0,
      left.motion.location[i] - left.lastMotion.location[i]
    );
    const rightMaxContrib = Math.max(
      0,
      right.lastMotion.location[i] - right.motion.location[i]
    );
    if (leftMaxContrib + rightMaxContrib < overlap - PAD * itr) continue;
    if (leftMaxContrib === 0 && rightMaxContrib === 0)
      // no movement possible or necessary
      continue;

    // TODO(@darzu): wait, these fractions are slightly wrong, I need to account for leftFracRemaining
    const f = Math.min(
      1.0,
      (overlap + PAD) / (leftMaxContrib + rightMaxContrib)
    );

    // update the dimension-spanning "a" and "b" fractions
    const aMaxContrib = left === a ? leftMaxContrib : rightMaxContrib;
    const bMaxContrib = left === b ? leftMaxContrib : rightMaxContrib;
    if (0 < aMaxContrib) {
      if (f < aRebound) {
        aRebound = f;
        aDim = i;
        aOverlapNum = overlap;
      }
    }
    if (0 < bMaxContrib) {
      if (f < bRebound) {
        bRebound = f;
        bDim = i;
        bOverlapNum = overlap;
      }
    }
  }

  const aOverlap = vec3.fromValues(0, 0, 0); // TODO(@darzu): perf; unnecessary alloc
  aOverlap[aDim] =
    Math.sign(a.lastMotion.location[aDim] - a.motion.location[aDim]) *
    aOverlapNum;

  const bOverlap = vec3.fromValues(0, 0, 0);
  bOverlap[bDim] =
    Math.sign(b.lastMotion.location[bDim] - b.motion.location[bDim]) *
    bOverlapNum;

  return { aId: a.id, bId: b.id, aRebound, bRebound, aOverlap, bOverlap };
}