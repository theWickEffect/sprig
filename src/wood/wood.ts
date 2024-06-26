import { ColorDef } from "../color/color-ecs.js";
import { Entity } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import { AllMeshSymbols, BLACK } from "../meshes/mesh-list.js";
import { BulletDef } from "../cannons/bullet.js";
import { GravityDef } from "../motion/gravity.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { createIdxPool } from "../utils/idx-pool.js";
import { jitter } from "../utils/math.js";
import { AudioDef } from "../audio/audio.js";
import {
  copyLine,
  createLine,
  emptyLine,
  getLineEnd,
  getLineMid,
  Line,
  lineSphereIntersections,
  Sphere,
  transformLine,
} from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef, LinearVelocityDef } from "../motion/velocity.js";
import {
  PhysicsResultsDef,
  WorldFrameDef,
} from "../physics/nonintersection.js";
import {
  PhysicsParentDef,
  PositionDef,
  RotationDef,
} from "../physics/transform.js";
import {
  getQuadMeshEdges,
  Mesh,
  meshStats,
  normalizeMesh,
  RawMesh,
} from "../meshes/mesh.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import {
  assert,
  assertDbg,
  createIntervalTracker,
  dbgOnce,
} from "../utils/util.js";
import { range } from "../utils/util.js";
import {
  centroid,
  quatFromUpForward_OLD,
  randNormalVec3,
  vec3Dbg,
} from "../utils/utils-3d.js";
import { SplinterPool, SplinterPoolsDef } from "./wood-splinters.js";
import { DBG_ASSERT, VERBOSE_LOG } from "../flags.js";
import { meshPoolPtr } from "../render/pipelines/std-scene.js";
import {
  createAABB,
  copyAABB,
  transformAABB,
  doesOverlapAABB,
  AABB,
  mergeAABBs,
  getAABBFromPositions,
} from "../physics/aabb.js";
import { SoundSetDef } from "../audio/sound-loader.js";
import { Phase } from "../ecs/sys-phase.js";
import { eventWizard } from "../net/events.js";

// TODO(@darzu): remove all references to pirates

/* TODO(@darzu):
[ ] standardize naming: wood or timber or ??
[ ] remove gameplay specific stuff like
  [ ] pirate ship
  [ ] health values
  [ ] BulletDef
*/

// TODO(@darzu): consider other mesh representations like:
//    DCEL or half-edge data structure

// export const WoodenDef = EM.defineComponent("wooden", () => {
//   return {
//     // TODO(@darzu): options?
//   };
// });

/*
So how could wood + splinters work on the GPU?
Compute shader computes the triangles and vertices,
  based on control points: location, orientation, width, depthi
What does compute shader gain us?
  Less CPU->GPU bandwidth used
  Less CPU work

could do geometry shader to turn line strips into triangles
*/

// TODO(@darzu): implement board heirarchy so that joints between boards are tracked, for
//  damage and construction purposes

// Flag for serialization dbg. determine the max number of boards and segments; useful for sizing (u8 vs u16) for serializing
const TRACK_MAX_BOARD_SEG_IDX = false;

export const DBG_WOOD_DMG = false;

const __temp1 = V3.mk();
const __temp2 = V3.mk();

export const WoodStateDef = EM.defineNonupdatableComponent(
  "woodState",
  (s: WoodState) => {
    return s;
  }
);

export type WoodAssets = Partial<{
  [P in AllMeshSymbols]: WoodState;
}>;

export const WoodAssetsDef = EM.defineResource(
  "woodAssets",
  (registry: WoodAssets = {}) => registry
);

export const WoodHealthDef = EM.defineNonupdatableComponent(
  "woodHealth",
  (s: WoodHealth) => {
    return s;
  }
);

// TODO(@darzu): SUPER HACK
type DestroyPirateShipFn = (id: number, timber: Entity) => void;
const _destroyPirateShipFns: DestroyPirateShipFn[] = [];
export function registerDestroyPirateHandler(fn: DestroyPirateShipFn) {
  _destroyPirateShipFns.push(fn);
}

export let _dbgNumSplinterEnds = 0;

interface BoardSegHit {
  boardIdx: number;
  segIdx: number;
  dmg: number;
}

const raiseDmgWood = eventWizard(
  "dmg-wood",
  [[WoodHealthDef]] as const,
  ([wood], hits: BoardSegHit[]) => {
    if (DBG_WOOD_DMG)
      console.log(`dmg-wood against ${wood.id} w/ ${hits.length} hits`);
    for (let { boardIdx, segIdx, dmg } of hits) {
      wood.woodHealth.boards[boardIdx][segIdx].health -= dmg;

      EM.whenResources(AudioDef, SoundSetDef).then((res) => {
        res.music.playSound("woodbreak", res.soundSet["woodbreak.mp3"], 0.02);
      });

      // // TODO(@darzu): HUGE HACK to detect hitting a pirate ship
      // if (dmg > 0 && mesh.dbgName === "pirateShip" && ball.bullet.team === 1) {
      //   assert(PhysicsParentDef.isOn(w));
      //   for (let fn of _destroyPirateShipFns) fn(w.physicsParent.id, w);
      // } else if (ball.bullet.team === 2) {
      //   //const music = EM.getResource(AudioDef);
      //   // if (music)
      //   //   music.playChords([2, 3], "minor", 0.2, 1.0, -2);
      // }
    }
  },
  {
    legalEvent: ([wood], hits: BoardSegHit[]) => {
      assert(hits.length < 0xff /*uint 8*/);
      assert(wood.woodHealth.boards.length < 0xff /*uint 8*/);
      // NOTE: doesn't thoroughly enforce anything but segments need to fit in uint8 too
      assert(wood.woodHealth.boards[0].length < 0xff /*uint 8*/);
      return true;
    },
    serializeExtra: (buf, hits: BoardSegHit[]) => {
      buf.writeUint8(hits.length);
      for (let { boardIdx, segIdx, dmg } of hits) {
        buf.writeUint8(boardIdx);
        buf.writeUint8(segIdx);
        const dmgAsU8 = dmg * 0xff;
        buf.writeUint8(dmgAsU8); // TODO(@darzu): have a unorm serialze type?
      }
    },
    deserializeExtra: (buf) => {
      const len = buf.readUint8();
      const hits: BoardSegHit[] = [];
      for (let i = 0; i < len; i++) {
        const boardIdx = buf.readUint8();
        const segIdx = buf.readUint8();
        const dmgAsU8 = buf.readUint8();
        const dmg = dmgAsU8 / 0xff;
        hits.push({ boardIdx, segIdx, dmg });
      }
      return hits;
    },
  }
);

EM.addEagerInit([WoodStateDef], [], [], () => {
  EM.addSystem(
    "runWooden",
    Phase.GAME_WORLD,
    [WoodStateDef, WoodHealthDef, WorldFrameDef, RenderableDef],
    [PhysicsResultsDef, RendererDef],
    (es, res) => {
      const { collidesWith } = res.physicsResults;

      const ballAABBWorld = createAABB();
      const segAABBWorld = createAABB();
      const boardAABBWorld = createAABB();
      const worldLine = emptyLine();

      const before = performance.now();

      let segAABBHits = 0;
      let segMidHits = 0;
      let overlapChecks = 0;

      const DBG_COLOR = false;

      for (let w of es) {
        // console.log(`checking wood!`);
        const meshHandle = w.renderable.meshHandle;
        const mesh = meshHandle.mesh!; // TODO(@darzu): again, shouldn't be modifying "readonlyXXXX"
        const hits = collidesWith.get(w.id);
        if (hits) {
          let boardSegHits: BoardSegHit[] = []; // TODO(@darzu): PERF. reuse for better memory?
          const balls = hits
            .map((h) =>
              EM.findEntity(h, [BulletDef, WorldFrameDef, ColliderDef])
            )
            .filter((b) => {
              // TODO(@darzu): check authority and team
              return b && b.bullet.health > 0;
            });
          for (let _ball of balls) {
            const ball = _ball!;
            // console.log(`hit: ${ball.id}`);
            // TODO(@darzu): move a bunch of the below into physic system features!
            assert(ball.collider.shape === "AABB");
            copyAABB(ballAABBWorld, ball.collider.aabb);
            transformAABB(ballAABBWorld, ball.world.transform);
            // TODO(@darzu): PERF! We should probably translate ball into wood space not both into world space!
            // TODO(@darzu): this sphere should live elsewhere..
            const worldSphere: Sphere = {
              org: ball.world.position,
              rad: (ballAABBWorld.max[0] - ballAABBWorld.min[0]) * 0.5,
            };

            // TODO(@darzu): PERF. have groups of boards. Maybe "walls". Or just an oct-tree.
            w.woodState.boards.forEach((board, boardIdx) => {
              if (ball.bullet.health <= 0) return;

              // does the ball hit the board?
              copyAABB(boardAABBWorld, board.localAABB);
              transformAABB(boardAABBWorld, w.world.transform);
              overlapChecks++;
              if (!doesOverlapAABB(ballAABBWorld, boardAABBWorld)) return;

              board.segments.forEach((seg, segIdx) => {
                if (ball.bullet.health <= 0) return;

                // does the ball hit the segment?
                copyAABB(segAABBWorld, seg.localAABB);
                transformAABB(segAABBWorld, w.world.transform);
                overlapChecks++;
                if (doesOverlapAABB(ballAABBWorld, segAABBWorld)) {
                  segAABBHits += 1;
                  // for (let qi of seg.quadSideIdxs) {
                  //   if (DBG_COLOR && mesh.colors[qi][1] < 1) {
                  //     // dont change green to red
                  //     mesh.colors[qi] = [1, 0, 0];
                  //   }
                  // }

                  // does the ball hit the middle of the segment?
                  copyLine(worldLine, seg.midLine);
                  transformLine(worldLine, w.world.transform);
                  const midHits = lineSphereIntersections(
                    worldLine,
                    worldSphere
                  );
                  if (midHits) {
                    // console.log(`mid hit: ${midHits}`);
                    segMidHits += 1;
                    // if (DBG_COLOR)
                    //   for (let qi of seg.quadSideIdxs) {
                    //     mesh.colors[qi] = [0, 1, 0];
                    //   }
                    // TODO(@darzu): cannon ball health stuff!

                    // determine dmg
                    const woodHealth = w.woodHealth.boards[boardIdx][segIdx];
                    const dmg =
                      Math.min(woodHealth.health, ball.bullet.health) + 0.001;

                    // dmg the ball
                    ball.bullet.health -= dmg;

                    // dmg the wood
                    boardSegHits.push({ boardIdx, segIdx, dmg });
                  }
                }
              });
            });
          }

          if (boardSegHits.length) {
            raiseDmgWood(w, boardSegHits);
          }
        }
        if (DBG_COLOR && (segAABBHits > 0 || segMidHits > 0)) {
          // TODO(@darzu): really need sub-mesh updateMesh
          // res.renderer.renderer.stdPool.updateMeshVertices(meshHandle, mesh);
          // res.renderer.renderer.updateMeshIndices(meshHandle, mesh);
        }
      }

      // TODO(@darzu):
      // console.log("wooden!: " + es.length);
      //
      // TODO(@darzu): auto AABB system?
      /*
      Broadphase Collision / non-intersection:
        each level of floor planks, etc
      */

      const after = performance.now();

      if (segAABBHits > 1) {
        // console.log(
        //   `runWooden: ${(after - before).toFixed(
        //     2
        //   )}ms, aabb hits: ${segAABBHits}, line hits: ${segMidHits}, aabbChecks: ${overlapChecks}`
        // );
      }
    }
  );

  EM.addSystem(
    "woodHealth",
    Phase.GAME_WORLD,
    [WoodStateDef, WorldFrameDef, WoodHealthDef, RenderableDef],
    [RendererDef, SplinterPoolsDef],
    (es, res) => {
      const stdPool = res.renderer.renderer.getCyResource(meshPoolPtr)!;

      // TODO(@darzu):
      for (let w of es) {
        // TODO(@darzu): track start and end offsets for each
        let splinterIndUpdated: number[] = [];
        let segQuadIndUpdated: { min: number; max: number }[] = [];

        const meshHandle = w.renderable.meshHandle;
        const mesh = meshHandle.mesh!;

        if (
          VERBOSE_LOG &&
          dbgOnce("homeWoodMesh") &&
          mesh.dbgName?.includes("home")
        ) {
          // console.log(`mesh: ${meshStats(mesh)}`);
          // console.log(`woodMesh: ${meshStats(w.woodState.mesh)}`);
          // if (meshHandle.triNum !== mesh.tri.length) {
          //   console.log("mesh.pos.length");
          //   console.log(meshHandle.triNum);
          //   console.log(mesh.tri.length);
          // }
          console.dir(meshHandle);
          console.dir(mesh);
          console.log(meshStats(mesh));
        }

        w.woodState.boards.forEach((board, bIdx) => {
          let pool: SplinterPool | undefined = undefined;
          board.segments.forEach((seg, sIdx) => {
            const h = w.woodHealth.boards[bIdx][sIdx];
            if (!h.broken && h.health <= 0) {
              if (DBG_WOOD_DMG)
                console.log(
                  `breaking ${w.id}.woodHealth.boards[${bIdx}][${sIdx}]`
                );

              h.broken = true;
              // TODO(@darzu): how to unhide?
              // TODO(@darzu): probably a more efficient way to do this..
              let qMin = Infinity;
              let qMax = -Infinity;
              for (let qi of [
                ...seg.quadSideIdxs,
                // TODO(@darzu): PERF. how performant is the below?
                ...(seg.quadBackIdx ? [seg.quadBackIdx] : []),
                ...(seg.quadFrontIdx ? [seg.quadFrontIdx] : []),
              ]) {
                const q = mesh.quad[qi];
                V4.set(0, 0, 0, 0, q);
                qMin = Math.min(qMin, qi);
                qMax = Math.max(qMax, qi);
              }
              // todo something is wrong with seg quads here!!
              // console.log(`seg quad: ${qMin} ${qMax}`);
              segQuadIndUpdated.push({ min: qMin, max: qMax });

              // get the board's pool
              if (!pool) {
                pool = res.splinterPools.getOrCreatePool(seg);
              }

              // create flying splinter (from pool)
              // TODO(@darzu): MOVE into wood-splinters.ts ?
              {
                const qi = seg.quadSideIdxs[0];
                const quadColor = mesh.colors[qi];
                const splinter = pool.getNext();
                if (RenderableDef.isOn(splinter))
                  splinter.renderable.hidden = false;
                if (ColorDef.isOn(w)) V3.copy(splinter.color, w.color);
                V3.add(splinter.color, quadColor, splinter.color);
                const pos = getLineMid(V3.mk(), seg.midLine);
                V3.tMat4(pos, w.world.transform, pos);
                EM.set(splinter, PositionDef, pos);
                const rot = getSegmentRotation(seg, false);
                quat.mul(rot, w.world.rotation, rot); // TODO(@darzu): !VERIFY! this works
                EM.set(splinter, RotationDef, rot);
                const spin = randNormalVec3(V3.mk());
                const vel = V3.clone(spin);
                V3.scale(spin, 0.01, spin);
                EM.set(splinter, AngularVelocityDef, spin);
                V3.scale(vel, 0.01, vel);
                EM.set(splinter, LinearVelocityDef, spin);
                EM.set(splinter, GravityDef, [0, 0, -3 * 0.00001]);
              }

              if (h.prev && !h.prev.broken) {
                // create end caps
                assert(w.woodState.splinterState);
                // const splinterGen = w.woodState.splinterState.generation;
                const splinterIdx = addSplinterEnd(seg, w.woodState, false);
                if (splinterIdx !== undefined) {
                  h.splinterBotIdx = splinterIdx;
                  // h.splinterBotGeneration = splinterGen;
                  _dbgNumSplinterEnds++;
                  splinterIndUpdated.push(splinterIdx);
                }
              }

              if (h.next && !h.next.broken) {
                assert(w.woodState.splinterState);
                // const splinterGen = w.woodState.splinterState.generation;
                const splinterIdx = addSplinterEnd(seg, w.woodState, true);
                if (splinterIdx !== undefined) {
                  h.splinterTopIdx = splinterIdx;
                  // h.splinterTopGeneration = splinterGen;
                  _dbgNumSplinterEnds++;
                  splinterIndUpdated.push(splinterIdx);
                }
              }

              if (
                h.next?.splinterBotIdx !== undefined &&
                w.woodState.splinterState
              ) {
                // TODO(@darzu): ugly
                // TODO(@darzu): this generation stuff seems somewhat broken
                // if (
                //   h.splinterBotGeneration ===
                //     w.woodState.splinterState.generation ||
                //   (h.splinterBotGeneration ===
                //     w.woodState.splinterState.generation - 1 &&
                //     w.woodState.splinterState.nextSplinterIdx <=
                //       h.next.splinterBotIdx)
                // ) {
                removeSplinterEnd(h.next.splinterBotIdx, w.woodState);
                // } else {
                //   // console.log(`skipping removal b/c generation mismatch!`);
                // }
                splinterIndUpdated.push(h.next.splinterBotIdx);
                w.woodState.splinterState.splinterIdxPool.free(
                  h.next.splinterBotIdx
                );
                h.next.splinterBotIdx = undefined;
                // h.next.splinterBotGeneration = undefined;
                _dbgNumSplinterEnds--;
              }

              if (
                h.prev?.splinterTopIdx !== undefined &&
                w.woodState.splinterState
              ) {
                // if (
                //   h.splinterTopGeneration ===
                //     w.woodState.splinterState.generation ||
                //   (h.splinterTopGeneration ===
                //     w.woodState.splinterState.generation - 1 &&
                //     w.woodState.splinterState.nextSplinterIdx <=
                //       h.prev.splinterTopIdx)
                // ) {
                removeSplinterEnd(h.prev.splinterTopIdx, w.woodState);
                // } else {
                //   // console.log(`skipping removal b/c generation mismatch!`);
                // }
                splinterIndUpdated.push(h.prev.splinterTopIdx);
                w.woodState.splinterState.splinterIdxPool.free(
                  h.prev.splinterTopIdx
                );
                h.prev.splinterTopIdx = undefined;
                // h.prev.splinterTopGeneration = undefined;
                _dbgNumSplinterEnds--;
              }
            }
          });
        });

        const ws = w.woodState;
        if (
          ws.splinterState &&
          (splinterIndUpdated.length || segQuadIndUpdated.length)
        ) {
          // TODO(@darzu): probably just create these trackers above? Persist them
          //    frame to frame.
          const triIntervals = createIntervalTracker(100);
          const quadIntervals = createIntervalTracker(100);
          const vertIntervals = createIntervalTracker(100);

          for (let spI of splinterIndUpdated) {
            const tMin = ws.splinterState.triOffset + spI * _trisPerSplinter;
            const tMax = tMin + _trisPerSplinter - 1;
            triIntervals.addRange(tMin, tMax);

            const qMin = ws.splinterState.quadOffset + spI * _quadsPerSplinter;
            const qMax = qMin + _quadsPerSplinter - 1;
            quadIntervals.addRange(qMin, qMax);

            const vMin = ws.splinterState.vertOffset + spI * _vertsPerSplinter;
            const vMax = vMin + _vertsPerSplinter - 1;
            vertIntervals.addRange(vMin, vMax);
          }

          for (let { min, max } of segQuadIndUpdated)
            quadIntervals.addRange(min, max);

          triIntervals.finishInterval();
          quadIntervals.finishInterval();
          vertIntervals.finishInterval();

          for (let { min, max } of triIntervals.intervals)
            stdPool.updateMeshTriInds(meshHandle, mesh, min, max - min + 1);

          for (let { min, max } of quadIntervals.intervals)
            stdPool.updateMeshQuadInds(meshHandle, mesh, min, max - min + 1);

          for (let { min, max } of vertIntervals.intervals)
            stdPool.updateMeshVertices(meshHandle, mesh, min, max - min + 1);
        }
      }
    }
  );
});

function getSegmentRotation(seg: BoardSeg, top: boolean) {
  let segNorm = V3.mk();
  let biggestArea2 = 0;
  for (let v of seg.areaNorms) {
    const a = V3.sqrLen(v);
    if (a > biggestArea2) {
      biggestArea2 = a;
      V3.copy(segNorm, v);
    }
  }

  const endNorm = V3.copy(V3.tmp(), seg.midLine.ray.dir);
  if (top) {
    V3.neg(endNorm, endNorm);
  }

  const rot = quat.mk();
  quatFromUpForward_OLD(rot, endNorm, segNorm);
  return rot;
}

// TODO(@darzu): POOL THESE SPLINTER ENDS!

let _tempSplinterMesh: RawMesh = createEmptyMesh("splinterEnd");

function removeSplinterEnd(splinterIdx: number, wood: WoodState) {
  // TODO(@darzu): only do this if the splinter is free!!!!
  assert(wood.splinterState);
  const sIdx = splinterIdx;
  const vertIdx = wood.splinterState.vertOffset + sIdx * _vertsPerSplinter;
  const triIdx = wood.splinterState.triOffset + sIdx * _trisPerSplinter;
  const quadIdx = wood.splinterState.quadOffset + sIdx * _quadsPerSplinter;

  for (let i = 0; i < _trisPerSplinter; i++) {
    V3.zero(wood.mesh.tri[triIdx + i]);
  }
  for (let i = 0; i < _quadsPerSplinter; i++) {
    V4.zero(wood.mesh.quad[quadIdx + i]);
  }
}

function addSplinterEnd(
  seg: BoardSeg,
  wood: WoodState,
  top: boolean
): number | undefined {
  assert(wood.splinterState, "!wood.splinterState");

  const sIdx = wood.splinterState.splinterIdxPool.next();
  if (sIdx === undefined) {
    // console.warn(`splinterIdxPool failed?`);
    return undefined;
  }

  const W = seg.width;
  const D = seg.depth;
  const pos = V3.copy(V3.tmp(), seg.midLine.ray.org);
  if (top) {
    getLineEnd(pos, seg.midLine);
  }

  _tempSplinterMesh.pos.length = 0;
  _tempSplinterMesh.quad.length = 0;
  _tempSplinterMesh.tri.length = 0;

  const rot = getSegmentRotation(seg, top);
  // TODO(@darzu): put these into a pool
  // TODO(@darzu): perf? probably don't need to normalize, just use same surface ID and provoking vert for all
  const cursor = mat4.fromRotationTranslation(rot, pos, mat4.create());
  {
    const b = createTimberBuilder(_tempSplinterMesh);
    b.width = W;
    b.depth = D;

    b.setCursor(cursor);
    b.addLoopVerts();
    // TODO(@darzu): HACK. We're "snapping" the splinter loop and segment loops
    //    together via distance; we should be able to do this in a more analytic way
    const snapDistSqr = Math.pow(0.2 * 0.5, 2);
    const loop = top ? seg.vertNextLoopIdxs : seg.vertLastLoopIdxs;
    for (let vi = b.mesh.pos.length - 4; vi < b.mesh.pos.length; vi++) {
      const p = b.mesh.pos[vi];
      for (let vi2 of loop) {
        const lp = wood.mesh.pos[vi2];
        if (V3.sqrDist(p, lp) < snapDistSqr) {
          // console.log("snap!");
          V3.copy(p, lp);
          break;
        }
      }
    }
    b.addEndQuad(true);

    b.setCursor(cursor);
    mat4.translate(b.cursor, [0, 0.1, 0], b.cursor);
    b.addSplinteredEnd(b.mesh.pos.length, 5);

    // TODO(@darzu): triangle vs quad coloring doesn't work
    // b.mesh.quad.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
    // b.mesh.tri.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
  }

  const qi = seg.quadSideIdxs[0];
  const color = wood.mesh.colors[qi];
  const triColorStartIdx = wood.mesh.quad.length;

  // TODO(@darzu): don't alloc all this mesh stuff!!
  const splinterMesh = normalizeMesh(_tempSplinterMesh);

  // copy mesh into main mesh
  const vertIdx = wood.splinterState.vertOffset + sIdx * _vertsPerSplinter;
  const triIdx = wood.splinterState.triOffset + sIdx * _trisPerSplinter;
  const quadIdx = wood.splinterState.quadOffset + sIdx * _quadsPerSplinter;
  // console.log(`copying to: ${vertIdx} ${triIdx} ${quadIdx}`);

  for (let i = 0; i < _vertsPerSplinter; i++) {
    V3.copy(wood.mesh.pos[vertIdx + i], splinterMesh.pos[i]);
  }
  for (let i = 0; i < _trisPerSplinter; i++) {
    splinterMesh.tri[i][0] += vertIdx;
    splinterMesh.tri[i][1] += vertIdx;
    splinterMesh.tri[i][2] += vertIdx;
    V3.copy(wood.mesh.tri[triIdx + i], splinterMesh.tri[i]);
    V3.copy(wood.mesh.colors[triColorStartIdx + triIdx + i], color);
  }
  for (let i = 0; i < _quadsPerSplinter; i++) {
    splinterMesh.quad[i][0] += vertIdx;
    splinterMesh.quad[i][1] += vertIdx;
    splinterMesh.quad[i][2] += vertIdx;
    splinterMesh.quad[i][3] += vertIdx;
    V4.copy(wood.mesh.quad[quadIdx + i], splinterMesh.quad[i]);
    V3.copy(wood.mesh.colors[quadIdx + i], color);
  }

  return sIdx;
}

function createSplinterEnd(
  seg: BoardSeg,
  boardMesh: Mesh,
  top: boolean,
  W: number,
  D: number
) {
  const pos = V3.copy(V3.tmp(), seg.midLine.ray.org);
  if (top) {
    getLineEnd(pos, seg.midLine);
  }

  const rot = getSegmentRotation(seg, top);
  // TODO(@darzu): put these into a pool
  const splinter = EM.mk();
  // TODO(@darzu): perf? probably don't need to normalize, just use same surface ID and provoking vert for all
  const cursor = mat4.fromRotationTranslation(rot, pos, mat4.create());
  let _splinterMesh: RawMesh = createEmptyMesh("splinterEnd");
  {
    const b = createTimberBuilder(_splinterMesh);
    b.width = W;
    b.depth = D;

    b.setCursor(cursor);
    b.addLoopVerts();
    // TODO(@darzu): HACK. We're "snapping" the splinter loop and segment loops
    //    together via distance; we should be able to do this in a more analytic way
    const snapDistSqr = Math.pow(0.2 * 0.5, 2);
    const loop = top ? seg.vertNextLoopIdxs : seg.vertLastLoopIdxs;
    for (let vi = b.mesh.pos.length - 4; vi < b.mesh.pos.length; vi++) {
      const p = b.mesh.pos[vi];
      for (let vi2 of loop) {
        const lp = boardMesh.pos[vi2];
        if (V3.sqrDist(p, lp) < snapDistSqr) {
          V3.copy(p, lp);
          break;
        }
      }
    }
    b.addEndQuad(true);

    b.setCursor(cursor);
    mat4.translate(b.cursor, [0, 0.1, 0], b.cursor);
    b.addSplinteredEnd(b.mesh.pos.length, 5);

    // TODO(@darzu): triangle vs quad coloring doesn't work
    b.mesh.quad.forEach((_) => b.mesh.colors.push(V3.clone(BLACK)));
    b.mesh.tri.forEach((_) => b.mesh.colors.push(V3.clone(BLACK)));
  }
  const splinterMesh = normalizeMesh(_splinterMesh);
  EM.set(splinter, RenderableConstructDef, splinterMesh);
  EM.set(splinter, ColorDef, V(Math.random(), Math.random(), Math.random()));
  EM.set(splinter, PositionDef);
  EM.set(splinter, RotationDef);
  EM.set(splinter, WorldFrameDef);
  return splinter;
}

export function createEmptyMesh(dbgName: string) {
  let mesh: RawMesh = {
    dbgName,
    pos: [],
    tri: [],
    quad: [],
    colors: [],
  };
  return mesh;
}

export function setSideQuadIdxs(
  loop1Vi: number,
  loop2Vi: number,
  q0: V4,
  q1: V4,
  q2: V4,
  q3: V4
) {
  // for provoking, we use loop1:2,3 and loop2:0,1
  // for provoking, we use loop1:2,3 and loop2:0,1
  V4.set(loop2Vi + 3, loop2Vi + 2, loop1Vi + 2, loop1Vi + 3, q0);
  V4.set(loop2Vi + 2, loop2Vi + 1, loop1Vi + 1, loop1Vi + 2, q1);
  V4.set(loop1Vi + 1, loop2Vi + 1, loop2Vi + 0, loop1Vi + 0, q2);
  V4.set(loop1Vi + 0, loop2Vi + 0, loop2Vi + 3, loop1Vi + 3, q3);
}

export function setEndQuadIdxs(loopVi: number, q: V4, facingDown: boolean) {
  // for provoking, we use loop 0 or 3
  // prettier-ignore
  if (facingDown)
    V4.set(loopVi + 3, loopVi + 2, loopVi + 1, loopVi + 0, q);
  else
    V4.set(loopVi + 0, loopVi + 1, loopVi + 2, loopVi + 3, q);
}

export type TimberBuilder = ReturnType<typeof createTimberBuilder>;
export function createTimberBuilder(mesh: RawMesh) {
  // TODO(@darzu): Z_UP!! check this over
  // TODO(@darzu): have a system for building wood?

  // const W = 0.5; // width
  // const D = 0.2; // depth

  const cursor: mat4 = mat4.create();

  // NOTE: Assumes +y is forward by default
  const b = {
    width: 0.2, // x-axis
    depth: 0.2, // z-axis
    mesh,
    cursor,
    addSplinteredEnd,
    addLoopVerts,
    addSideQuads,
    addEndQuad,
    setCursor,
  };

  return b;

  function setCursor(newCursor: mat4) {
    mat4.copy(cursor, newCursor);
  }

  function addSplinteredEnd(lastLoopEndVi: number, numJags: number) {
    const vi = mesh.pos.length;

    const v0 = V(0, 0, b.depth);
    const v1 = V(0, 0, -b.depth);
    V3.tMat4(v0, cursor, v0);
    V3.tMat4(v1, cursor, v1);
    mesh.pos.push(v0, v1);

    const v_tm = vi + 0;
    const v_tbr = lastLoopEndVi + -4;
    const v_tbl = lastLoopEndVi + -1;
    const v_bbr = lastLoopEndVi + -3;
    const v_bbl = lastLoopEndVi + -2;
    // +D side
    mesh.tri.push(V(v_tm, v_tbl, v_tbr));
    // -D side
    mesh.tri.push(V(v_tm + 1, v_bbr, v_bbl));

    let v_tlast = v_tbl;
    let v_blast = v_bbl;

    // const numJags = 5;
    const xStep = (b.width * 2) / numJags;
    let lastY = 0;
    let lastX = -b.width;
    for (let i = 0; i <= numJags; i++) {
      const x = i * xStep - b.width + jitter(0.05);
      let y = lastY;
      while (Math.abs(y - lastY) < 0.1)
        // TODO(@darzu): HACK to make sure it's not too even
        y = i % 2 === 0 ? 0.7 + jitter(0.6) : 0.2 + jitter(0.1);
      let d = b.depth; // + jitter(0.1);

      // TODO(@darzu): HACK! This ensures that adjacent "teeth" in the splinter
      //    are properly manifold/convex/something-something
      let cross_last_this = V2.cross([lastX, lastY], [x, y], __temp1);
      let maxLoop = 10;
      while (cross_last_this[2] > 0 && maxLoop > 0) {
        if (x < 0) y += 0.1;
        else y -= 0.1;
        V2.cross([lastX, lastY], [x, y], cross_last_this);
        maxLoop--;
      }
      if (VERBOSE_LOG && cross_last_this[2] > 0)
        console.warn(`splinter non-manifold!`);

      // +D side
      const vtj = V(x, y, d);
      V3.tMat4(vtj, cursor, vtj);
      const vtji = mesh.pos.length;
      mesh.pos.push(vtj);
      mesh.tri.push(V(v_tm, vtji, v_tlast));

      // -D side
      const vbj = V(x, y, -d);
      V3.tMat4(vbj, cursor, vbj);
      mesh.pos.push(vbj);
      mesh.tri.push(V(v_tm + 1, v_blast, vtji + 1));

      // D to -D quad
      mesh.quad.push(V(v_blast, v_tlast, vtji, vtji + 1));

      v_tlast = vtji;
      v_blast = vtji + 1;

      lastX = x;
      lastY = y;
    }
    // +D side
    mesh.tri.push(V(v_tm, v_tbr, v_tlast));
    // -D side
    mesh.tri.push(V(v_tm + 1, v_blast, v_bbr));

    // D to -D quad
    mesh.quad.push(V(v_blast, v_tlast, v_tbr, v_bbr));
  }

  // NOTE: for provoking vertices,
  //  indexes 0, 1 of a loop are for stuff behind (end cap, previous sides)
  //  indexes 2, 3 of a loop are for stuff ahead (next sides, end cap)
  function addSideQuads() {
    const loop2Idx = mesh.pos.length - 4;
    const loop1Idx = mesh.pos.length - 4 - 4;

    const q0 = V4.mk();
    const q1 = V4.mk();
    const q2 = V4.mk();
    const q3 = V4.mk();

    setSideQuadIdxs(loop1Idx, loop2Idx, q0, q1, q2, q3);

    mesh.quad.push(q0, q1, q2, q3);
  }

  function addEndQuad(facingDown: boolean) {
    const lastLoopIdx = mesh.pos.length - 4;
    const q = V4.mk();
    setEndQuadIdxs(lastLoopIdx, q, facingDown);
    mesh.quad.push(q);
  }

  function addLoopVerts() {
    // TODO(@darzu): ensure this agrees with the width/depth calculation in addBoard
    const v0 = V(b.width, 0, b.depth);
    const v1 = V(b.width, 0, -b.depth);
    const v2 = V(-b.width, 0, -b.depth);
    const v3 = V(-b.width, 0, b.depth);
    V3.tMat4(v0, cursor, v0);
    V3.tMat4(v1, cursor, v1);
    V3.tMat4(v2, cursor, v2);
    V3.tMat4(v3, cursor, v3);
    mesh.pos.push(v0, v1, v2, v3);
  }
}

type VI = number; // vertex index
type QI = number; // quad index
// each board has an AABB, OBB,
export interface BoardSeg {
  localAABB: AABB;
  midLine: Line;
  areaNorms: V3[]; // TODO(@darzu): fixed size
  width: number;
  depth: number;
  // TODO(@darzu): establish convention e.g. top-left, top-right, etc.
  vertLastLoopIdxs: V4; // [VI, VI, VI, VI];
  vertNextLoopIdxs: V4; // [VI, VI, VI, VI];
  // TODO(@darzu): establish convention e.g. top, left, right, bottom
  quadSideIdxs: V4; // [QI, QI, QI, QI];
  quadBackIdx?: QI;
  quadFrontIdx?: QI;
}
interface Board {
  segments: BoardSeg[];
  localAABB: AABB;
}

// v24, t16, q8
// TODO(@darzu): reduce to v18, t16, q8
const _vertsPerSplinter = 24;
const _trisPerSplinter = 16;
const _quadsPerSplinter = 8;
interface WoodSplinterState {
  maxNumSplinters: number;
  splinterIdxPool: ReturnType<typeof createIdxPool>;
  // splinterIdxPool: ReturnType<typeof createIdxRing>;
  vertOffset: number;
  quadOffset: number;
  triOffset: number;
  // generation: number;
}

export interface WoodState {
  mesh: RawMesh; // TODO(@darzu): make non-raw
  usedVertIdxs: Set<number>;
  usedQuadIdxs: Set<number>;
  boards: Board[];

  splinterState?: WoodSplinterState;
}

export function reserveSplinterSpace(wood: WoodState, maxSplinters: number) {
  // console.log("reserveSplinterSpace");
  // console.log(meshStats(wood.mesh));
  const vertOffset = wood.mesh.pos.length;
  const quadOffset = wood.mesh.quad.length;
  const triOffset = wood.mesh.tri.length;
  range(maxSplinters * _vertsPerSplinter).forEach((_) =>
    wood.mesh.pos.push(V3.mk())
  );
  range(maxSplinters * _trisPerSplinter).forEach((_) =>
    wood.mesh.tri.push(V3.mk())
  );
  range(maxSplinters * _quadsPerSplinter).forEach((_) =>
    wood.mesh.quad.push(V4.mk())
  );
  const newFaces = maxSplinters * (_quadsPerSplinter + _trisPerSplinter);
  range(newFaces).forEach((_) => {
    wood.mesh.surfaceIds!.push(wood.mesh.surfaceIds!.length);
    wood.mesh.colors.push(V3.clone(BLACK));
  });

  wood.splinterState = {
    maxNumSplinters: maxSplinters,
    splinterIdxPool: createIdxPool(maxSplinters),
    vertOffset,
    quadOffset,
    triOffset,
    // generation: 1,
  };
  // console.log(meshStats(wood.mesh));
}

export function debugBoardSystem(m: RawMesh): RawMesh {
  const before = performance.now();
  const boards = getBoardsFromMesh(m);
  console.dir(boards);
  const after = performance.now();
  console.log(`debugBoardSystem: ${(after - before).toFixed(2)}ms`);
  return m;
}

const TRACK_INVALID_BOARDS = false;

export function getBoardsFromMesh(m: RawMesh): WoodState {
  // What's in a board?
  // end verts connect to 3 others
  // mid verts connect to 4 others
  // ASSUME: quad mesh for the boards. Might as well
  // TODO(@darzu):
  // console.log("getBoardsFromMesh");

  const edges = getQuadMeshEdges(m);
  // possible ends
  // from the end, dist 1 from each vert that isn't in the end is the next stop
  // next stop must be inter connected
  const vHas3Edges = new Set(
    edges.reduce((p, n, i) => (n.length === 3 ? [...p, i] : p), [])
  );
  // console.log("vHas3Edges:");
  // console.dir(vHas3Edges);

  const vIsMaybeEnd = new Set<number>();

  // const newQuads: vec4[] = [];
  // const newTris: V3[] = [];

  // TODO(@darzu): use m.quad as end canidates! b/c we need their cw/ccw order

  const qIsMaybeEnd = new Set<number>();
  for (let qi = 0; qi < m.quad.length; qi++) {
    const q = m.quad[qi];
    if (q.every((vi) => vHas3Edges.has(vi) && !vIsMaybeEnd.has(vi))) {
      q.forEach((vi) => vIsMaybeEnd.add(vi));
      qIsMaybeEnd.add(qi);
    }
  }

  // console.log("qIsMaybeEnd");
  // console.dir(qIsMaybeEnd);

  // tracks verts and quads used in all boards
  const structureVis = new Set<number>();
  const structureQis = new Set<number>();

  // TODO: vi to board idx ?
  function createBoard(startQi: number): Board | undefined {
    const boardVis = new Set<number>();
    const boardQis = new Set<number>();

    const startLoop = V4.clone(m.quad[startQi]); // as [VI, VI, VI, VI];
    startLoop.sort((a, b) => a - b); // TODO(@darzu): HACK?

    // build the board
    const allSegments = addBoardSegment(startLoop, true);

    if (allSegments) {
      // the board is valid; track it, return it
      boardVis.forEach((vi) => structureVis.add(vi));
      boardQis.forEach((qi) => structureQis.add(qi));

      // TODO(@darzu): DEBUG: render the board
      // console.log("boardQis:");
      // console.dir(boardQis);
      // boardQis.forEach((qi) =>
      //   assert(0 <= qi && qi < m.quad.length, "invalid qi")
      // );
      // boardQis.forEach((qi) => newQuads.push(m.quad[qi]));

      // TODO(@darzu): IML
      const localAABB = createAABB();
      for (let s of allSegments) mergeAABBs(localAABB, localAABB, s.localAABB);
      return {
        segments: allSegments,
        localAABB,
      };
    }

    return undefined;

    function addBoardSegment(
      lastLoop: V4, // [VI, VI, VI, VI],
      isFirstLoop: boolean = false
    ): BoardSeg[] | undefined {
      // TODO(@darzu): using too many temps!
      // start tracking this segment
      const segVis = new Set([...lastLoop]);

      // find the next loop
      const nextLoop_: number[] = [];
      lastLoop.forEach((vi) => {
        edges[vi].forEach((vi2) => {
          if (
            !segVis.has(vi2) &&
            !boardVis.has(vi2) &&
            !structureVis.has(vi2)
          ) {
            nextLoop_.push(vi2);
          }
        });
      });

      // is our loop valid?
      if (nextLoop_.length !== 4) {
        // invalid board
        if (TRACK_INVALID_BOARDS)
          console.log(`invalid board: next loop has ${nextLoop_.length} verts`);
        return undefined;
      }
      const nextLoop = V4.clone(nextLoop_ as [VI, VI, VI, VI]);
      nextLoop.sort((a, b) => a - b); // TODO(@darzu): HACK?

      // add next loop verts to segment
      nextLoop.forEach((vi) => segVis.add(vi));

      // find all quads for segment
      // TODO(@darzu): PERF. inefficient to repeat this linear scan for each loop..
      //    probably partition the mesh into islands first
      const segQis = m.quad.reduce(
        (p, n, ni) =>
          !boardQis.has(ni) &&
          !structureQis.has(ni) &&
          n.every((vi) => segVis.has(vi))
            ? [...p, ni]
            : p,
        [] as number[]
      );
      segQis.sort((a, b) => a - b); // TODO(@darzu): HACK?

      // TODO(@darzu): in the case of 6, we might have a single-segment
      //    board and we need to allow for that
      // do we still have a valid board?
      if (segQis.length !== 4 && segQis.length !== 5) {
        // invalid board; missing quads
        if (TRACK_INVALID_BOARDS)
          console.log(`invalid board: seg has ${segQis.length} quads`);
        return undefined;
      }

      // track segment quads as board quads, from here the segment has either
      // the right verts and quads or the whole board is invalid.
      segQis.forEach((qi) => boardQis.add(qi));
      segVis.forEach((vi) => boardVis.add(vi));

      // create common segment data
      const vertIdxs = [...segVis.values()];
      const aabb = getAABBFromPositions(
        createAABB(),
        vertIdxs.map((vi) => m.pos[vi])
      );
      const lastMid = centroid(...[...lastLoop].map((vi) => m.pos[vi]));
      const nextMid = centroid(...[...nextLoop].map((vi) => m.pos[vi]));
      const mid = createLine(lastMid, nextMid);
      const areaNorms = segQis.map(getQiAreaNorm);
      const len1 = V3.dist(m.pos[lastLoop[1]], m.pos[lastLoop[0]]);
      const len2 = V3.dist(m.pos[lastLoop[3]], m.pos[lastLoop[0]]);
      const width = Math.max(len1, len2) * 0.5;
      const depth = Math.min(len1, len2) * 0.5;
      let seg: BoardSeg;

      function getQiAreaNorm(qi: number) {
        // TODO(@darzu): PERF. Using too many temps!
        // TODO(@darzu): i hate doing this vec4->number[] conversion just to get map.. wth
        const ps = [...m.quad[qi]].map((vi) => m.pos[vi]);
        // NOTE: assumes segments are parallelograms
        const ab = V3.sub(ps[1], ps[0], __temp1);
        const ac = V3.sub(ps[3], ps[0], __temp2);
        const areaNorm = V3.cross(ab, ac, V3.mk());
        return areaNorm;
      }

      // are we at an end of the board?
      if (segQis.length === 5) {
        // get the end-cap
        const endQuads = segQis.filter((qi) =>
          m.quad[qi].every((vi) =>
            (isFirstLoop ? lastLoop : nextLoop).includes(vi)
          )
        );
        if (endQuads.length === 1) {
          const endQuad = endQuads[0];
          const sideQuads = V4.clone(
            segQis.filter((qi) => qi !== endQuad) as [QI, QI, QI, QI]
          );
          seg = {
            localAABB: aabb,
            midLine: mid,
            areaNorms,
            width,
            depth,
            vertLastLoopIdxs: lastLoop,
            vertNextLoopIdxs: nextLoop,
            quadSideIdxs: sideQuads,
            quadBackIdx: isFirstLoop ? endQuad : undefined,
            quadFrontIdx: !isFirstLoop ? endQuad : undefined,
          };
          if (isFirstLoop) {
            // no-op, we'll continue below
          } else {
            // we're done with the board
            return [seg];
          }
        } else {
          // invalid board
          if (TRACK_INVALID_BOARDS)
            console.log(
              `invalid board: 5-quad but ${endQuads.length} end quads and is first: ${isFirstLoop}`
            );
          return undefined;
        }
      } else {
        // no end quads, just side
        seg = {
          localAABB: aabb,
          midLine: mid,
          areaNorms,
          width,
          depth,
          vertLastLoopIdxs: lastLoop,
          vertNextLoopIdxs: nextLoop,
          quadSideIdxs: V4.clone(segQis as [QI, QI, QI, QI]),
        };
      }

      // continue
      // TODO(@darzu): perf. tail call optimization?
      const nextSegs = addBoardSegment(nextLoop);
      if (!nextSegs) return undefined;
      else return [seg, ...nextSegs];
    }
  }

  const qEndCanidates = [...qIsMaybeEnd.values()];
  qEndCanidates.sort((a, b) => a - b);
  const boards: Board[] = [];
  for (let qi of qEndCanidates) {
    if (!structureQis.has(qi)) {
      const b = createBoard(qi);
      if (b) boards.push(b);
    }
  }

  // const newQuads: vec4[] = [];
  // const newTri: V3[] = [];
  // const newColors: V3[] = [];
  // const newSurfaceIds: number[] = [];

  // // TODO(@darzu): transfer quad data
  // takenQis.forEach((qi) => {
  //   const newQi = newQuads.length;
  //   newQuads.push(m.quad[qi]);
  //   newColors[newQi] = m.colors[qi]; // TODO(@darzu): face indexing isn't quite right here b/c of triangles
  //   newSurfaceIds[newQi] = newQi;
  // });

  // console.log(`quad count: ${m.quad.length} -> ${m.quad.length}`);

  // m.quad = newQuads;
  // m.tri = newTri;
  // m.colors = newColors;
  // m.surfaceIds = newSurfaceIds;

  const woodenState: WoodState = {
    mesh: m,
    boards,
    usedVertIdxs: structureVis,
    usedQuadIdxs: structureQis,
  };

  return woodenState;
}

// TODO(@darzu): share code with wood repair?
export function resetWoodState(w: WoodState) {
  w.boards.forEach((b) => {
    b.segments.forEach((s) => {
      // TODO(@darzu): extract for repair
      // TODO(@darzu): need enough info to reconstruct the mesh!
      if (s.quadBackIdx) {
        setEndQuadIdxs(s.vertLastLoopIdxs[0], w.mesh.quad[s.quadBackIdx], true);
      }
      if (s.quadFrontIdx) {
        setEndQuadIdxs(
          s.vertNextLoopIdxs[0],
          w.mesh.quad[s.quadFrontIdx],
          false
        );
      }
      assertDbg(
        s.vertLastLoopIdxs[0] < s.vertNextLoopIdxs[0],
        `Loops out of order`
      );
      setSideQuadIdxs(
        s.vertLastLoopIdxs[0],
        s.vertNextLoopIdxs[0],
        w.mesh.quad[s.quadSideIdxs[0]],
        w.mesh.quad[s.quadSideIdxs[1]],
        w.mesh.quad[s.quadSideIdxs[2]],
        w.mesh.quad[s.quadSideIdxs[3]]
      );
    });
  });
  if (w.splinterState) {
    w.splinterState.splinterIdxPool.reset();
    for (
      let qi = w.splinterState.quadOffset;
      qi <
      w.splinterState.quadOffset +
        w.splinterState.maxNumSplinters * _quadsPerSplinter;
      qi++
    ) {
      V4.zero(w.mesh.quad[qi]);
    }
    for (
      let ti = w.splinterState.triOffset;
      ti <
      w.splinterState.triOffset +
        w.splinterState.maxNumSplinters * _trisPerSplinter;
      ti++
    ) {
      V3.zero(w.mesh.tri[ti]);
    }
  }
}

export function verifyUnsharedProvokingForWood(
  m: RawMesh,
  woodState: WoodState
): asserts m is RawMesh & { usesProvoking: true } {
  if (DBG_ASSERT) {
    const provokingVis = new Set<number>();
    for (let b of woodState.boards) {
      for (let seg of b.segments) {
        for (let qi of [
          seg.quadBackIdx,
          seg.quadFrontIdx,
          ...seg.quadSideIdxs,
        ]) {
          if (!qi) continue;
          const pVi = m.quad[qi][0];
          assert(
            !provokingVis.has(pVi),
            `Shared provoking vert found in quad ${qi} (vi: ${pVi}) for ${m.dbgName}`
          );
          provokingVis.add(pVi);
        }
      }
    }
  }
  (m as Mesh).usesProvoking = true;
}

export function unshareProvokingForWood(m: RawMesh, woodState: WoodState) {
  // TODO(@darzu): verify this actually works. We should pre-split the mesh
  //  into islands (which will speed up getBoardsFromMesh by a lot), and then
  //  verify each island is unshared.
  const provokingVis = new Set<number>();
  let bIdx = 0;
  for (let b of woodState.boards) {
    // for (let b of [woodState.boards[60]]) {
    // first, do ends
    for (let seg of b.segments) {
      for (let qi of [seg.quadBackIdx, seg.quadFrontIdx]) {
        if (!qi) continue;
        const done = unshareProvokingForBoardQuad(m.quad[qi], qi);
        if (!done)
          console.error(`invalid board ${bIdx}! End cap can't unshare`);
        // console.log(`end: ${m.quad[qi]}`);
      }
    }
    for (let seg of b.segments) {
      for (let qi of seg.quadSideIdxs) {
        const done = unshareProvokingForBoardQuad(m.quad[qi], qi, [
          ...seg.vertLastLoopIdxs,
        ]);
        // if (done) console.log(`side: ${m.quad[qi]}`);
        if (!done) {
          const done2 = unshareProvokingForBoardQuad(m.quad[qi], qi);
          // if (done2) console.log(`side(2): ${m.quad[qi]}`);
          if (!done2) {
            console.error(`invalid board ${bIdx}; unable to unshare provoking`);
          }
        }
      }
    }
    bIdx++;
  }
  function unshareProvokingForBoardQuad(
    [i0, i1, i2, i3]: V4,
    qi: number,
    preferVis?: number[]
  ) {
    if ((!preferVis || preferVis.includes(i0)) && !provokingVis.has(i0)) {
      provokingVis.add(i0);
      m.quad[qi] = V4.clone([i0, i1, i2, i3]);
      return true;
    } else if (
      (!preferVis || preferVis.includes(i1)) &&
      !provokingVis.has(i1)
    ) {
      provokingVis.add(i1);
      m.quad[qi] = V4.clone([i1, i2, i3, i0]);
      return true;
    } else if (
      (!preferVis || preferVis.includes(i2)) &&
      !provokingVis.has(i2)
    ) {
      provokingVis.add(i2);
      m.quad[qi] = V4.clone([i2, i3, i0, i1]);
      return true;
    } else if (
      (!preferVis || preferVis.includes(i3)) &&
      !provokingVis.has(i3)
    ) {
      provokingVis.add(i3);
      m.quad[qi] = V4.clone([i3, i0, i1, i2]);
      return true;
    } else {
      return false;
    }
  }
}

interface SegHealth {
  prev?: SegHealth;
  next?: SegHealth;
  health: number;
  broken: boolean;
  splinterTopIdx?: number;
  splinterBotIdx?: number;
  // splinterTopGeneration?: number;
  // splinterBotGeneration?: number;
}
type BoardHealth = SegHealth[];
interface WoodHealth {
  boards: BoardHealth[];
}

export function createWoodHealth(w: WoodState) {
  if (TRACK_MAX_BOARD_SEG_IDX) {
    const maxBoardIdx = w.boards.length;
    let maxSegIdx = -1;
    for (let b of w.boards) {
      maxSegIdx = Math.max(maxSegIdx, b.segments.length);
    }
    console.log(`maxBoardIdx: ${maxBoardIdx}`);
    console.log(`maxSegIdx: ${maxSegIdx}`);
  }

  return {
    boards: w.boards.map((b) => {
      let lastSeg = b.segments.reduce((p, n) => {
        const h: SegHealth = {
          prev: p,
          health: 1.0,
          broken: false,
        };
        return h;
      }, undefined as SegHealth | undefined);
      if (!lastSeg) return [] as SegHealth[];
      // patch up "next" ptrs
      while (lastSeg.prev) {
        lastSeg.prev.next = lastSeg;
        lastSeg = lastSeg.prev;
      }
      let nextSeg: SegHealth | undefined = lastSeg;
      const segHealths: SegHealth[] = [];
      while (nextSeg) {
        segHealths.push(nextSeg);
        nextSeg = nextSeg.next;
      }
      // console.dir(segHealths);
      return segHealths;
    }),
  };
}

export function resetWoodHealth(wh: WoodHealth) {
  wh.boards.forEach((b) =>
    b.forEach((s) => {
      s.health = 1.0;
      s.broken = false;
      s.splinterTopIdx = undefined;
      s.splinterBotIdx = undefined;
    })
  );
}
