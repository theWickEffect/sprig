import {
  EntityManager,
  EM,
  Entity,
  EntityW,
  ComponentDef,
} from "../entity-manager.js";
import { AlphaDef, applyTints, TintsDef } from "../color-ecs.js";
import { CameraViewDef } from "../camera.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../sprig-matrix.js";
import {
  Frame,
  TransformDef,
  PhysicsParentDef,
  updateFrameFromTransform,
  updateFrameFromPosRotScale,
  copyFrame,
} from "../physics/transform.js";
import { ColorDef } from "../color-ecs.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { DeadDef, DeletedDef } from "../delete.js";
import { stdRenderPipeline } from "./pipelines/std-mesh.js";
import {
  computeUniData,
  meshPoolPtr,
  MeshUniformTS,
} from "./pipelines/std-scene.js";
import { CanvasDef } from "../canvas.js";
import { FORCE_WEBGL } from "../main.js";
import { createRenderer } from "./renderer-webgpu.js";
import { CyMeshPoolPtr, CyPipelinePtr, CyTexturePtr } from "./gpu-registry.js";
import { createFrame, WorldFrameDef } from "../physics/nonintersection.js";
import { tempVec3 } from "../temp-pool.js";
import {
  isMeshHandle,
  MeshHandle,
  MeshPool,
  MeshReserve,
} from "./mesh-pool.js";
import { Mesh } from "./mesh.js";
import { SceneTS } from "./pipelines/std-scene.js";
import { max } from "../math.js";
import {
  positionAndTargetToOrthoViewProjMatrix,
  vec3Dbg,
} from "../utils-3d.js";
import { ShadersDef, ShaderSet } from "./shader-loader.js";
import { dbgLogOnce, never } from "../util.js";
import { TimeDef } from "../time.js";
import { PartyDef } from "../games/party.js";
import { PointLightDef, pointLightsPtr, PointLightTS } from "./lights.js";
import {
  computeOceanUniData,
  OceanMeshHandle,
  OceanUniTS,
} from "./pipelines/std-ocean.js";
import { assert } from "../util.js";
import {
  DONT_SMOOTH_WORLD_FRAME,
  PERF_DBG_GPU,
  VERBOSE_LOG,
} from "../flags.js";
import { ALPHA_MASK } from "./pipeline-masks.js";
import { RenderDataGrassDef, computeGrassUniData } from "../smol/std-grass.js";
import { WindDef } from "../smol/wind.js";

const BLEND_SIMULATION_FRAMES_STRATEGY: "interpolate" | "extrapolate" | "none" =
  "none";

// TODO(@darzu): we need a better way to handle arbitrary pools
// TODO(@darzu): support height map?
// export type PoolKind = "std" | "ocean" | "grass";
export interface RenderableConstruct {
  readonly enabled: boolean;
  readonly sortLayer: number;
  // TODO(@darzu): mask is inconsitently placed; here it is in the component,
  //  later it is in the mesh handle.
  readonly mask?: number;
  readonly pool: CyMeshPoolPtr<any, any>;
  // TODO(@darzu): little hacky: hidden vs enabled?
  // NOTE:
  //   "enabled" objects are debundled and not sent to the GPU.
  //   "hidden" objects are sent to the GPU w/ scale 0 (so they don't appear).
  //   hidden objects might be more efficient in object pools b/c it causes
  //   less rebundling, but this needs measurement.
  readonly hidden: boolean;
  meshOrProto: Mesh | MeshHandle;
  readonly reserve?: MeshReserve;
}

export const RenderableConstructDef = EM.defineComponent(
  "renderableConstruct",
  (
    // TODO(@darzu): this constructor is too messy, we should use a params obj instead
    meshOrProto: Mesh | MeshHandle,
    enabled: boolean = true,
    // TODO(@darzu): do we need sort layers? Do we use them?
    sortLayer: number = 0,
    mask?: number,
    pool?: CyMeshPoolPtr<any, any>,
    hidden: boolean = false,
    reserve?: MeshReserve
  ) => {
    const r: RenderableConstruct = {
      enabled,
      sortLayer: sortLayer,
      meshOrProto,
      mask,
      pool: pool ?? meshPoolPtr,
      hidden,
      reserve,
    };
    return r;
  }
);

export interface Renderable {
  // TODO(@darzu): clean up these options...
  enabled: boolean;
  hidden: boolean;
  sortLayer: number;
  meshHandle: MeshHandle;
}

export const RenderableDef = EM.defineComponent(
  "renderable",
  (r: Renderable) => r
);

// TODO: standardize names more

// export const RenderDataStdDef = EM.defineComponent(
//   "renderDataStd",
//   (r: MeshUniformTS) => r
// );

const _hasRendererWorldFrame = new Set();

export const SmoothedWorldFrameDef = EM.defineComponent(
  "smoothedWorldFrame",
  () => createFrame()
);

const PrevSmoothedWorldFrameDef = EM.defineComponent(
  "prevSmoothedWorldFrame",
  () => createFrame()
);

export const RendererWorldFrameDef = EM.defineComponent(
  "rendererWorldFrame",
  () => createFrame()
);

function updateSmoothedWorldFrame(em: EntityManager, o: Entity) {
  if (DeletedDef.isOn(o)) return;
  if (!TransformDef.isOn(o)) return;
  let parent = null;
  if (PhysicsParentDef.isOn(o) && o.physicsParent.id) {
    if (!_hasRendererWorldFrame.has(o.physicsParent.id)) {
      updateSmoothedWorldFrame(em, em.findEntity(o.physicsParent.id, [])!);
    }
    parent = em.findEntity(o.physicsParent.id, [SmoothedWorldFrameDef]);
    if (!parent) return;
  }
  let firstFrame = false;
  if (!SmoothedWorldFrameDef.isOn(o)) firstFrame = true;
  em.ensureComponentOn(o, SmoothedWorldFrameDef);
  em.ensureComponentOn(o, PrevSmoothedWorldFrameDef);
  copyFrame(o.prevSmoothedWorldFrame, o.smoothedWorldFrame);
  mat4.copy(o.smoothedWorldFrame.transform, o.transform);
  updateFrameFromTransform(o.smoothedWorldFrame);
  if (MotionSmoothingDef.isOn(o)) {
    vec3.add(
      o.smoothedWorldFrame.position,
      o.motionSmoothing.positionError,
      o.smoothedWorldFrame.position
    );
    quat.mul(
      o.smoothedWorldFrame.rotation,
      o.motionSmoothing.rotationError,
      o.smoothedWorldFrame.rotation
    );
    updateFrameFromPosRotScale(o.smoothedWorldFrame);
  }
  if (parent) {
    mat4.mul(
      parent.smoothedWorldFrame.transform,
      o.smoothedWorldFrame.transform,
      o.smoothedWorldFrame.transform
    );
    updateFrameFromTransform(o.smoothedWorldFrame);
  }
  if (firstFrame) copyFrame(o.prevSmoothedWorldFrame, o.smoothedWorldFrame);
  _hasRendererWorldFrame.add(o.id);
}

export function registerUpdateSmoothedWorldFrames(em: EntityManager) {
  em.registerSystem(
    [RenderableConstructDef, TransformDef],
    [],
    (objs, res) => {
      _hasRendererWorldFrame.clear();

      for (const o of objs) {
        // TODO(@darzu): PERF HACK!
        if (DONT_SMOOTH_WORLD_FRAME) {
          em.ensureComponentOn(o, SmoothedWorldFrameDef);
          em.ensureComponentOn(o, PrevSmoothedWorldFrameDef);
          continue;
        }

        updateSmoothedWorldFrame(em, o);
      }
    },
    "updateSmoothedWorldFrames"
  );
}

let _simulationAlpha = 0.0;

export function setSimulationAlpha(to: number) {
  _simulationAlpha = to;
}

function interpolateFrames(
  alpha: number,
  out: Frame,
  prev: Frame,
  next: Frame
) {
  vec3.lerp(prev.position, next.position, alpha, out.position);
  quat.slerp(prev.rotation, next.rotation, alpha, out.rotation);
  vec3.lerp(prev.scale, next.scale, alpha, out.scale);
  updateFrameFromPosRotScale(out);
}

function extrapolateFrames(
  alpha: number,
  out: Frame,
  prev: Frame,
  next: Frame
) {
  // out.position = next.position + alpha * (next.position - prev.position)
  // out.position = next.position + alpha * (next.position - prev.position)
  vec3.sub(next.position, prev.position, out.position);
  vec3.scale(out.position, alpha, out.position);
  vec3.add(out.position, next.position, out.position);

  // see https://answers.unity.com/questions/168779/extrapolating-quaternion-rotation.html
  // see https://answers.unity.com/questions/168779/extrapolating-quaternion-rotation.html
  quat.invert(prev.rotation, out.rotation);
  quat.mul(next.rotation, out.rotation, out.rotation);
  const axis = tempVec3();
  let angle = quat.getAxisAngle(out.rotation, axis);
  // ensure we take the shortest path
  if (angle > Math.PI) {
    angle -= Math.PI * 2;
  }
  if (angle < -Math.PI) {
    angle += Math.PI * 2;
  }
  angle = angle * alpha;
  quat.setAxisAngle(axis, angle, out.rotation);
  quat.mul(out.rotation, next.rotation, out.rotation);

  // out.scale = next.scale + alpha * (next.scale - prev.scale)
  // out.scale = next.scale + alpha * (next.scale - prev.scale)
  vec3.sub(next.scale, prev.scale, out.scale);
  vec3.scale(out.scale, alpha, out.scale);
  vec3.add(out.scale, next.scale, out.scale);

  updateFrameFromPosRotScale(out);
}

export function registerUpdateRendererWorldFrames(em: EntityManager) {
  em.registerSystem(
    [SmoothedWorldFrameDef, PrevSmoothedWorldFrameDef],
    [],
    (objs) => {
      for (let o of objs) {
        em.ensureComponentOn(o, RendererWorldFrameDef);

        // TODO(@darzu): HACK!
        if (DONT_SMOOTH_WORLD_FRAME) {
          (o as any).rendererWorldFrame = (o as any).world;
          continue;
        }

        switch (BLEND_SIMULATION_FRAMES_STRATEGY) {
          case "interpolate":
            interpolateFrames(
              _simulationAlpha,
              o.rendererWorldFrame,
              o.prevSmoothedWorldFrame,
              o.smoothedWorldFrame
            );
            break;
          case "extrapolate":
            extrapolateFrames(
              _simulationAlpha,
              o.rendererWorldFrame,
              o.prevSmoothedWorldFrame,
              o.smoothedWorldFrame
            );
            break;
          default:
            copyFrame(o.rendererWorldFrame, o.smoothedWorldFrame);
        }
      }
    },
    "updateRendererWorldFrames"
  );
}

// TODO(@darzu): We need to add constraints for updateRendererWorldFrames and such w/ respect to gameplay, physics, and rendering!

// export const poolKindToDataDef = {
//   std: RenderDataStdDef,
//   ocean: RenderDataOceanDef,
//   grass: RenderDataGrassDef,
// };
// type Assert_PoolKindToDataDef = typeof poolKindToDataDef[PoolKind];

// export const poolKindToDataUpdate: {
//   [k in PoolKind]: (
//     o: EntityW<
//       [
//         typeof RenderableDef,
//         typeof poolKindToDataDef[k],
//         typeof RendererWorldFrameDef
//       ]
//     >
//   ) => boolean;
// } = {
//   std: updateStdRenderData,
//   ocean: updateOceanRenderData,
//   grass: updateGrassRenderData,
// };

export function registerRenderer(em: EntityManager) {
  // NOTE: we use "renderListDeadHidden" and "renderList" to construct a custom
  //  query of renderable objects that include dead, hidden objects. The reason
  //  for this is that it causes a more stable entity list when we have object
  //  pools, and thus we have to rebundle less often.
  const renderObjs: EntityW<
    [typeof RendererWorldFrameDef, typeof RenderableDef]
  >[] = [];
  em.registerSystem(
    [RendererWorldFrameDef, RenderableDef, DeadDef],
    [],
    (objs, _) => {
      renderObjs.length = 0;
      for (let o of objs)
        if (o.renderable.enabled && o.renderable.hidden && !DeletedDef.isOn(o))
          renderObjs.push(o);
    },
    "renderListDeadHidden"
  );
  em.registerSystem(
    [RendererWorldFrameDef, RenderableDef],
    [],
    (objs, _) => {
      for (let o of objs)
        if (o.renderable.enabled && !DeletedDef.isOn(o)) renderObjs.push(o);
    },
    "renderList"
  );

  em.registerSystem(
    null, // NOTE: see "renderList*" systems and NOTE above. We use those to construct our query.
    [CameraViewDef, RendererDef, TimeDef, PartyDef],
    (_, res) => {
      const renderer = res.renderer.renderer;
      const cameraView = res.cameraView;

      const objs = renderObjs;

      // ensure our mesh handle is up to date
      // for (let o of objs) {
      //   // TODO(@darzu): generalize mesh pool kind stuff
      //   if (RenderDataStdDef.isOn(o)) {
      //     if (updateStdRenderData(o))
      //       res.renderer.renderer.stdPool.updateUniform(
      //         o.renderable.meshHandle,
      //         o.renderDataStd
      //       );
      //   } else if (RenderDataOceanDef.isOn(o)) {
      //     if (updateOceanRenderData(o))
      //       res.renderer.renderer.oceanPool.updateUniform(
      //         o.renderable.meshHandle,
      //         o.renderDataOcean
      //       );
      //   } else if (RenderDataGrassDef.isOn(o)) {
      //     if (updateGrassRenderData(o))
      //       res.renderer.renderer.grassPool.updateUniform(
      //         o.renderable.meshHandle,
      //         o.renderDataGrass
      //       );
      //   }
      // }

      // TODO(@darzu): this is currently unused, and maybe should be dropped.
      // sort
      // objs.sort((a, b) => b.renderable.sortLayer - a.renderable.sortLayer);

      // render
      // TODO(@darzu):
      // const m24 = objs.filter((o) => o.renderable.meshHandle.mId === 24);
      // const e10003 = objs.filter((o) => o.id === 10003);
      // console.log(`mId 24: ${!!m24.length}, e10003: ${!!e10003.length}`);

      // TODO(@darzu): go elsewhere
      // const lightPosition = V(50, 100, -100);

      const pointLights = em
        .filterEntities([PointLightDef, WorldFrameDef])
        .map((e) => {
          positionAndTargetToOrthoViewProjMatrix(
            e.pointLight.viewProj,
            e.world.position,
            cameraView.location
          );
          let { viewProj, ...rest } = e.pointLight;
          return {
            viewProj,
            position: e.world.position,
            ...rest,
          };
        });
      dbgLogOnce(`Num point lights: ${pointLights.length}`);

      // const lightPosition =
      //   pointLights[0]?.position ?? V(0, 0, 0);

      // TODO(@darzu): this maxSurfaceId calculation is super inefficient, we need
      //  to move this out of this loop.
      let maxSurfaceId = 1000;
      // let maxSurfaceId = max(
      //   objs
      //     .map((o) => o.renderable.meshHandle.readonlyMesh?.GF ?? [0])
      //     .reduce((p, n) => [...p, ...n], [])
      // );
      // TODO(@darzu): DBG
      // maxSurfaceId = 12;
      // console.log(`maxSurfaceId: ${maxSurfaceId}`);

      renderer.updateScene({
        cameraViewProjMatrix: cameraView.viewProjMat,
        //lightViewProjMatrix,
        time: res.time.time,
        canvasAspectRatio: res.cameraView.aspectRatio,
        maxSurfaceId,
        partyPos: res.party.pos,
        partyDir: res.party.dir,
        cameraPos: cameraView.location,
        numPointLights: pointLights.length,
      });
      // console.log(`pointLights.length: ${pointLights.length}`);

      renderer.updatePointLights(pointLights);

      // TODO(@darzu): dbg
      // console.log(`pipelines: ${res.renderer.pipelines.map((p) => p.name)}`);
      renderer.submitPipelines(
        objs.map((o) => o.renderable.meshHandle),
        res.renderer.pipelines
      );

      if (objs.length && res.renderer.pipelines.length) {
        dbgLogOnce(
          "first-frame",
          `Rendering first frame at: ${performance.now().toFixed(2)}ms`
        );
      }

      // Performance logging
      if (PERF_DBG_GPU) {
        const stdPool = res.renderer.renderer.getCyResource(meshPoolPtr)!;
        const stats = stdPool._stats;
        const totalBytes =
          stats._accumTriDataQueued +
          stats._accumUniDataQueued +
          stats._accumVertDataQueued;
        const totalKb = totalBytes / 1024;
        if (totalKb > 100) {
          console.log(`Big frame: ${totalKb.toFixed(0)}kb`);
          console.log(`tris: ${stats._accumTriDataQueued / 1024}kb`);
          console.log(`uni: ${stats._accumUniDataQueued / 1024}kb`);
          console.log(`vert: ${stats._accumVertDataQueued / 1024}kb`);
        }
        stats._accumTriDataQueued = 0;
        stats._accumUniDataQueued = 0;
        stats._accumVertDataQueued = 0;
      }
    },
    "stepRenderer"
  );

  em.requireSystem("renderListDeadHidden");
  em.requireSystem("renderList");
  em.requireSystem("stepRenderer");
  em.addConstraint([
    "renderListDeadHidden",
    "after",
    "updateRendererWorldFrames",
  ]);
  em.addConstraint(["renderListDeadHidden", "before", "renderList"]);
  em.addConstraint(["renderList", "before", "stepRenderer"]);
}

// export function poolKindToPool(
//   renderer: Renderer,
//   kind: PoolKind
// ): MeshPool<any, any> {
//   if (kind === "std") {
//     return renderer.stdPool;
//   } else if (kind === "ocean") {
//     return renderer.oceanPool;
//   } else if (kind === "grass") {
//     return renderer.grassPool;
//   } else {
//     never(kind);
//   }
// }

export function registerConstructRenderablesSystem(em: EntityManager) {
  em.registerSystem(
    [RenderableConstructDef],
    [RendererDef],
    (es, res) => {
      for (let e of es) {
        // TODO(@darzu): this seems somewhat inefficient to look for this every frame
        if (!RenderableDef.isOn(e)) {
          let meshHandle: MeshHandle;
          let mesh: Mesh;
          const pool = res.renderer.renderer.getCyResource(
            e.renderableConstruct.pool
          );
          assert(pool);
          if (isMeshHandle(e.renderableConstruct.meshOrProto)) {
            // TODO(@darzu): renderableConstruct is getting to large and wierd
            assert(
              !e.renderableConstruct.reserve,
              `cannot have a reserve when adding an instance`
            );
            meshHandle = pool.addMeshInstance(
              e.renderableConstruct.meshOrProto
            );
            mesh = meshHandle.mesh!;
          } else {
            meshHandle = pool.addMesh(
              e.renderableConstruct.meshOrProto,
              e.renderableConstruct.reserve
            );
            mesh = e.renderableConstruct.meshOrProto;
          }
          if (e.renderableConstruct.mask) {
            meshHandle.mask = e.renderableConstruct.mask;
          }

          em.addComponent(e.id, RenderableDef, {
            enabled: e.renderableConstruct.enabled,
            hidden: false,
            sortLayer: e.renderableConstruct.sortLayer,
            meshHandle,
          });

          // pool.updateUniform
          const uni = pool.ptr.computeUniData(mesh);
          em.ensureComponentOn(e, pool.ptr.dataDef, uni);
          // TODO(@darzu): HACK! We need some notion of required uni data maybe? Or common uni data
          if ("id" in e[pool.ptr.dataDef.name]) {
            // console.log(
            //   `setting ${e.id}.${pool.ptr.dataDef.name}.id = ${meshHandle.mId}`
            // );
            e[pool.ptr.dataDef.name]["id"] = meshHandle.mId;
          }
        }
      }
    },
    "constructRenderables"
  );
}

export type Renderer = ReturnType<typeof createRenderer>;
// export interface Renderer {
//   // opts
//   drawLines: boolean;
//   drawTris: boolean;

//   addMesh(m: Mesh): MeshHandleStd;
//   addMeshInstance(h: MeshHandleStd): MeshHandleStd;
//   updateMesh(handle: MeshHandleStd, newMeshData: Mesh): void;
//   // TODO(@darzu): scene struct maybe shouldn't be special cased, all uniforms
//   //  should be neatily updatable.
//   updateScene(scene: Partial<SceneTS>): void;
//   updatePointLights(pointLights: PointLightTS[]): void;
//   submitPipelines(handles: MeshHandleStd[], pipelines: CyPipelinePtr[]): void;
//   readTexture(tex: CyTexturePtr): Promise<ArrayBuffer>;
//   stats(): Promise<Map<string, bigint>>;
// }

// TODO(@darzu): the double "Renderer" naming is confusing. Maybe one should be GPUManager or something?
export const RendererDef = EM.defineComponent(
  "renderer",
  (renderer: Renderer, usingWebGPU: boolean, pipelines: CyPipelinePtr[]) => {
    return {
      renderer,
      usingWebGPU,
      pipelines,
    };
  }
);

let _rendererPromise: Promise<void> | null = null;

export function registerRenderInitSystem(em: EntityManager) {
  em.registerSystem(
    [],
    [CanvasDef, ShadersDef],
    (_, res) => {
      if (!!em.getResource(RendererDef)) return; // already init
      if (!!_rendererPromise) return;
      _rendererPromise = chooseAndInitRenderer(
        em,
        res.shaders,
        res.htmlCanvas.canvas
      );
    },
    "renderInit"
  );
}

async function chooseAndInitRenderer(
  em: EntityManager,
  shaders: ShaderSet,
  canvas: HTMLCanvasElement
): Promise<void> {
  let renderer: Renderer | undefined = undefined;
  let usingWebGPU = false;
  if (!FORCE_WEBGL) {
    // try webgpu first
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) console.error("navigator.gpu?.requestAdapter() failed");
    if (adapter) {
      const supportsTimestamp = adapter.features.has("timestamp-query");
      if (!supportsTimestamp && VERBOSE_LOG)
        console.log(
          "GPU profiling disabled: device does not support timestamp queries"
        );
      const device = await adapter.requestDevice({
        requiredFeatures: supportsTimestamp ? ["timestamp-query"] : [],
      });
      // TODO(@darzu): uses cast while waiting for webgpu-types.d.ts to be updated
      const context = canvas.getContext("webgpu");
      // console.log("webgpu context:");
      // console.dir(context);
      if (context) {
        renderer = createRenderer(canvas, device, context, shaders);
        if (renderer) usingWebGPU = true;
      }
    }
  }
  // TODO(@darzu): re-enable WebGL
  // if (!rendererInit)
  //   rendererInit = attachToCanvasWebgl(canvas, MAX_MESHES, MAX_VERTICES);
  if (!renderer) {
    displayWebGPUError();
    throw new Error("Unable to create webgl or webgpu renderer");
  }
  if (VERBOSE_LOG) console.log(`Renderer: ${usingWebGPU ? "webGPU" : "webGL"}`);

  // add to ECS
  // TODO(@darzu): this is a little wierd to do this in an async callback
  em.addResource(RendererDef, renderer, usingWebGPU, []);
}

export function displayWebGPUError() {
  const style = `font-size: 48px;
      color: green;
      margin: 24px;
      max-width: 600px;`;
  document.getElementsByTagName(
    "body"
  )[0].innerHTML = `<div style="${style}">This page requires WebGPU which isn't yet supported in your browser!<br>Or something else went wrong that was my fault.<br><br>U can try Chrome >106.<br><br>🙂</div>`;
}
