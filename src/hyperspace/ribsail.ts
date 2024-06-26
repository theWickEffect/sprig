import { AllMeshesDef } from "../meshes/mesh-list.js";
import { ColorDef } from "../color/color-ecs.js";
import { createRef } from "../ecs/em-helpers.js";
import { EntityW } from "../ecs/em-entities.js";
import { EM } from "../ecs/ecs.js";
import {
  PositionDef,
  ScaleDef,
  RotationDef,
  PhysicsParentDef,
} from "../physics/transform.js";
import {
  RenderableConstructDef,
  RenderableDef,
  RendererDef,
} from "../render/renderer-ecs.js";
import { mat4, quat, V, V2, V3 } from "../matrix/sprig-matrix.js";
import { range } from "../utils/util.js";
import { defineNetEntityHelper } from "../ecs/em-helpers.js";
import { MeDef } from "../net/components.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { cloneMesh, mapMeshPositions } from "../meshes/mesh.js";
import { RenderDataStdDef, FLAG_UNLIT } from "../render/pipelines/std-scene.js";
import {
  signedAreaOfTriangle,
  positionAndTargetToOrthoViewProjMatrix,
} from "../utils/utils-3d.js";
import { ENDESGA16 } from "../color/palettes.js";
import { Phase } from "../ecs/sys-phase.js";

const RIB_COUNT = 6;
export const DEFAULT_SAIL_COLOR = V(0.05, 0.05, 0.05);

const BOOM_LENGTH = 20;
// const MAST_LENGTH = 40;
// const BOOM_HEIGHT = MAST_LENGTH - BOOM_LENGTH - 2;

export const { RibSailPropsDef, RibSailLocalDef, createRibSailNow } =
  defineNetEntityHelper({
    name: "ribSail",
    defaultProps: () => ({
      // pitch: Math.PI / 2,
    }),
    updateProps: (p) => p,
    serializeProps: (o, buf) => {
      // buf.writeFloat32(o.pitch);
    },
    deserializeProps: (o, buf) => {
      // o.pitch = buf.readFloat32();
    },
    defaultLocal: () => ({
      // TODO(@darzu): move the ribs into the sail mesh?
      pitch: Math.PI / 2,
      _lastPitch: NaN,

      ribs: range(RIB_COUNT).map(() => createRef(0, [RotationDef])),
      // sail: createRef(0, [
      //   RenderableDef,
      //   WorldFrameDef,
      //   // SailColorDef,
      //   ColorDef,
      // ]),
    }),
    dynamicComponents: [RotationDef /*, BoomPitchesDef*/],
    buildResources: [AllMeshesDef, MeDef],
    build: (sail, res) => {
      // const sail = EM.new();

      EM.set(sail, PositionDef, V(0, 0, 0));
      // EM.set(sail, PositionDef, V(0, 0, 0));
      EM.set(sail, RenderableConstructDef, cloneMesh(res.allMeshes.sail.mesh));
      //EM.set(sail1, ScaleDef, [12, 12, 12]);
      EM.set(sail, RotationDef);
      // EM.set(sail, SailColorDef, STAR1_COLOR);
      EM.set(sail, ColorDef, DEFAULT_SAIL_COLOR);
      // EM.set(sail, PhysicsParentDef, mast.id);
      EM.whenEntityHas(
        sail,
        RenderDataStdDef
        // RenderableDef,
        // WorldFrameDef,
        // SailColorDef,
        // ColorDef
      ).then((sail1) => {
        sail1.renderDataStd.flags |= FLAG_UNLIT;
        // mast.hypMastLocal.sail1 = createRef(sail1);
      });

      const mast = EM.mk();

      EM.set(mast, PositionDef, V(0, -20, 0));
      EM.set(mast, ScaleDef, V(0.5, 1.0, 0.5));
      EM.set(mast, RenderableConstructDef, res.allMeshes.mast.mesh);
      EM.set(mast, PhysicsParentDef, sail.id);
      EM.set(mast, ColorDef, ENDESGA16.lightBrown);
      V3.scale(mast.color, 0.5, mast.color);

      sail.ribSailLocal.ribs = range(RIB_COUNT).map((i) => {
        const isEnd = i === 0;
        const width = isEnd ? 1 : 0.7;
        return createRef(createRib(width));
      });

      function createRib(width: number) {
        const rib = EM.mk();
        EM.set(rib, PositionDef);
        EM.set(rib, RenderableConstructDef, res.allMeshes.mast.mesh);
        EM.set(rib, ScaleDef, V(0.5 * width, 0.5, 0.5 * width));
        EM.set(rib, RotationDef);
        EM.set(rib, ColorDef, ENDESGA16.lightBrown);
        V3.scale(rib.color, 0.7, rib.color);
        EM.set(rib, PhysicsParentDef, sail.id);
        return rib;
      }

      return sail;
    },
  });
type RibSail = ReturnType<typeof createRibSailNow>;

export function registerRibSailSystems() {
  EM.addSystem(
    `updateRibSail`,
    Phase.GAME_WORLD,
    [RibSailLocalDef, RenderableDef],
    [RendererDef],
    (cs, res) => {
      for (let sail of cs) {
        if (sail.ribSailLocal.pitch === sail.ribSailLocal._lastPitch) continue;

        sail.ribSailLocal.ribs.forEach((ribRef, i) => {
          const rib = ribRef()!;
          quat.rotX(
            quat.IDENTITY,
            sail.ribSailLocal.pitch * (1 - i / RIB_COUNT),
            rib.rotation
          );
        });

        const rotations = sail.ribSailLocal.ribs.map((b) => b()!.rotation);

        rotations.push(quat.identity(quat.tmp()));
        mapMeshPositions(sail.renderable.meshHandle.mesh!, (pos, i) => {
          const ribIndex = Math.floor(i / 3);
          const ribRotationBot = rotations[ribIndex];
          const ribRotationTop = rotations[ribIndex + 1];
          if (i % 3 == 1) {
            V3.tQuat([0, BOOM_LENGTH * 0.9, 0], ribRotationTop, pos);
          } else if (i % 3 == 2) {
            V3.tQuat([0, BOOM_LENGTH * 0.99, 0], ribRotationBot, pos);
          }
          return pos;
        });
        res.renderer.renderer.stdPool.updateMeshVertices(
          sail.renderable.meshHandle,
          sail.renderable.meshHandle.mesh!
        );

        sail.ribSailLocal._lastPitch = sail.ribSailLocal.pitch;
      }
    }
  );
  // TODO(@darzu): only require this if one exists?
}

// HACK: ASSUMES MESH IS allMeshes.sail.mesh
export function getSailMeshArea(verts: V3[]) {
  // TODO(@darzu): generalize this for different mesh? Or create the mesh and type it?
  return (
    signedAreaOfTriangle(
      V(verts[0][1], verts[0][2]),
      V(verts[1][1], verts[1][2]),
      V(verts[2][1], verts[2][2])
    ) * RIB_COUNT
  );
}

export function sailForceAndSignedArea(
  sail: EntityW<[typeof RenderableDef, typeof WorldFrameDef]>,
  starPos: V3
): [V3, number] {
  const viewProjMatrix = positionAndTargetToOrthoViewProjMatrix(
    mat4.tmp(),
    starPos,
    sail.world.position
  );

  const localVerts = sail.renderable.meshHandle.mesh!.pos;

  const worldVerts = localVerts.map((pos) => {
    return V3.tMat4(pos, sail.world.transform);
  });

  const starViewVerts = worldVerts.map((pos) => {
    return V3.tMat4(pos, viewProjMatrix);
  });

  const area = getSailMeshArea(starViewVerts);

  const sailNormal = V3.cross(
    V3.sub(worldVerts[1], worldVerts[0]),
    V3.sub(worldVerts[2], worldVerts[0])
  );

  V3.norm(sailNormal, sailNormal);
  return [V3.scale(sailNormal, area, sailNormal), area];
}
