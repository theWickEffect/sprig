import { CameraDef } from "../camera/camera.js";
import { EM } from "../ecs/ecs.js";
import { V2, V3, V4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { max } from "../utils/math.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef } from "../motion/velocity.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import {
  CyRenderPipelinePtr,
  CyCompPipelinePtr,
  CY,
  linearSamplerPtr,
} from "../render/gpu-registry.js";
import { cloneMesh } from "../meshes/mesh.js";
import { RendererDef, RenderableConstructDef } from "../render/renderer-ecs.js";
import {
  sceneBufPtr,
  meshPoolPtr,
  litTexturePtr,
  mainDepthTex,
  canvasTexturePtr,
} from "../render/pipelines/std-scene.js";
import { uintToVec3unorm } from "../utils/utils-3d.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { GlobalCursor3dDef } from "../gui/cursor.js";
import { createGhost } from "./ghost.js";
import { PointLightDef } from "../render/lights.js";

export async function initCubeGame() {
  const res = await EM.whenResources(
    AllMeshesDef,
    // GlobalCursor3dDef,
    RendererDef,
    CameraDef
  );
  res.camera.fov = Math.PI * 0.5;

  let renderPipelinesPtrs: CyRenderPipelinePtr[] = [
    cubeRenderPipeline,
    cubePost,
  ];
  let computePipelinesPtrs: CyCompPipelinePtr[] = [
    // ...
  ];
  res.renderer.pipelines = [...computePipelinesPtrs, ...renderPipelinesPtrs];

  const m2 = cloneMesh(res.allMeshes.cube.mesh);
  const g = createGhost(m2);
  g.controllable.sprintMul = 3;

  {
    // auto-gen; use dbg.saveCamera() to update
    V3.copy(g.position, [6.68, 5.09, 3.33]);
    quat.copy(g.rotation, [0.87, -0.37, 0.29, -0.12]);
    V3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
    g.cameraFollow.yawOffset = 0.0;
    g.cameraFollow.pitchOffset = -0.604;
  }

  const box = EM.mk();
  const boxM = cloneMesh(res.allMeshes.cube.mesh);
  const sIdMax = max(boxM.surfaceIds);
  boxM.colors = boxM.surfaceIds.map((_, i) => uintToVec3unorm(i, sIdMax));
  // boxM.colors = boxM.surfaceIds.map((_, i) => [0.1, i / 12, 0.1]);
  // console.dir(boxM.colors);
  EM.set(box, RenderableConstructDef, boxM);
  // EM.set(box, ColorDef, [0.1, 0.4, 0.1]);
  EM.set(box, PositionDef, V(0, 0, 3));
  EM.set(box, RotationDef);
  EM.set(box, AngularVelocityDef, V(0, 0.001, 0.001));
  EM.set(box, WorldFrameDef);
  EM.set(box, ColliderDef, {
    shape: "AABB",
    solid: false,
    aabb: res.allMeshes.cube.aabb,
  });
}

const cubeRenderPipeline = CY.createRenderPipeline("cubeRender", {
  globals: [sceneBufPtr],
  meshOpt: {
    pool: meshPoolPtr,
    stepMode: "per-mesh-handle",
  },
  shaderVertexEntry: "vert_main",
  shaderFragmentEntry: "frag_main",
  output: [
    {
      ptr: litTexturePtr,
      clear: "once",
      // defaultColor: [0.0, 0.0, 0.0, 1.0],
      defaultColor: V4.clone([0.1, 0.1, 0.1, 1.0]),
      // defaultColor: [0.7, 0.8, 1.0, 1.0],
    },
  ],
  depthStencil: mainDepthTex,
  shader: () =>
    `
struct VertexOutput {
    @location(0) @interpolate(flat) color : vec3<f32>,
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vert_main(input: VertexInput) -> VertexOutput {
    var output : VertexOutput;

    output.position = 
      scene.cameraViewProjMatrix 
      * meshUni.transform 
      * vec4<f32>(input.position, 1.0);

    output.color = input.color + meshUni.tint;

    return output;
}

struct FragOut {
  @location(0) color: vec4<f32>,
}

@fragment
fn frag_main(input: VertexOutput) -> FragOut {

    var out: FragOut;
    out.color = vec4(input.color, 1.0);

    return out;
}
`,
});

// TODO(@darzu): rg32uint "uint"
// rg16uint "uint"

const cubePost = CY.createRenderPipeline("cubePost", {
  globals: [
    { ptr: litTexturePtr, alias: "colorTex" },
    { ptr: linearSamplerPtr, alias: "samp" },
  ],
  meshOpt: {
    vertexCount: 6,
    stepMode: "single-draw",
  },
  output: [canvasTexturePtr],
  shader: () => {
    return `
struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
};

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  let xs = vec2(-1.0, 1.0);
  let ys = vec2(-1.0, 1.0);
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(xs.x, ys.x),
    vec2<f32>(xs.y, ys.x),
    vec2<f32>(xs.y, ys.y),
    vec2<f32>(xs.x, ys.y),
    vec2<f32>(xs.x, ys.x),
    vec2<f32>(xs.y, ys.y),
  );

  var uv = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
  );

  var output : VertexOutput;
  output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  return output;
}

@fragment
fn frag_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
  var color = textureSample(colorTex, samp, fragUV);

  // vignette
  let edgeDistV = fragUV - 0.5;
  let edgeDist = 1.0 - dot(edgeDistV, edgeDistV) * 0.5;
  color *= edgeDist;
  
  return color;
}
  `;
  },
  shaderFragmentEntry: "frag_main",
  shaderVertexEntry: "vert_main",
});
