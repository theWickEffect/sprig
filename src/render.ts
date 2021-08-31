import { Mesh, GameObject, GameView } from "./state.js";
import { mat4, vec3, quat } from "./gl-matrix.js";

// TODO: some state lives in global variables when it should live on the Renderer object

// shaders

const shaderSceneStruct = `
    [[block]] struct Scene {
        cameraViewProjMatrix : mat4x4<f32>;
        lightViewProjMatrix : mat4x4<f32>;
        lightDir : vec3<f32>;
    };
`;
const vertexShader =
  shaderSceneStruct +
  `
    [[block]] struct Model {
        modelMatrix : mat4x4<f32>;
    };

    [[group(0), binding(0)]] var<uniform> scene : Scene;
    [[group(1), binding(0)]] var<uniform> model : Model;

    struct VertexOutput {
        [[location(0)]] normal : vec3<f32>;
        [[location(1)]] color : vec3<f32>;
        [[builtin(position)]] position : vec4<f32>;
    };

    [[stage(vertex)]]
    fn main(
        [[location(0)]] position : vec3<f32>,
        [[location(1)]] color : vec3<f32>,
        [[location(2)]] normal : vec3<f32>,
        ) -> VertexOutput {
        var output : VertexOutput;
        let worldPos: vec4<f32> = model.modelMatrix * vec4<f32>(position, 1.0);
        output.position = scene.cameraViewProjMatrix * worldPos;
        output.normal = normalize(model.modelMatrix * vec4<f32>(normal, 0.0)).xyz;
        output.color = color;
        return output;
    }
`;
const fragmentShader =
  shaderSceneStruct +
  `
    [[group(0), binding(0)]] var<uniform> scene : Scene;

    struct VertexOutput {
        [[location(0)]] normal : vec3<f32>;
        [[location(1)]] color : vec3<f32>;
    };

    [[stage(fragment)]]
    fn main(input: VertexOutput) -> [[location(0)]] vec4<f32> {
        let sunLight : f32 = clamp(dot(-scene.lightDir, input.normal), 0.0, 1.0);
        let resultColor: vec3<f32> = input.color * (sunLight * 2.0 + 0.2);
        let gammaCorrected: vec3<f32> = pow(resultColor, vec3<f32>(1.0/2.2));
        return vec4<f32>(gammaCorrected, 1.0);
    }
`;

const bytesPerFloat = Float32Array.BYTES_PER_ELEMENT;
const bytesPerMat4 = 4 * 4 /*4x4 mat*/ * 4; /*f32*/
const bytesPerVec3 = 3 /*vec3*/ * 4; /*f32*/
const indicesPerTriangle = 3;
const bytesPerTri = Uint16Array.BYTES_PER_ELEMENT * indicesPerTriangle;

// render pipeline parameters
const antiAliasSampleCount = 4;
const swapChainFormat = "bgra8unorm";
const depthStencilFormat = "depth24plus-stencil8";
const backgroundColor = { r: 0.5, g: 0.5, b: 0.5, a: 1.0 };

let depthTexture: GPUTexture;
let depthTextureView: GPUTextureView;
let colorTexture: GPUTexture;
let colorTextureView: GPUTextureView;
let lastWidth = 0;
let lastHeight = 0;
let aspectRatio = 1;

// recomputes textures, widths, and aspect ratio on canvas resize
function checkCanvasResize(
  device: GPUDevice,
  canvasWidth: number,
  canvasHeight: number
) {
  if (lastWidth === canvasWidth && lastHeight === canvasHeight) return;

  if (depthTexture) depthTexture.destroy();
  if (colorTexture) colorTexture.destroy();

  depthTexture = device.createTexture({
    size: { width: canvasWidth, height: canvasHeight },
    format: depthStencilFormat,
    sampleCount: antiAliasSampleCount,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  depthTextureView = depthTexture.createView();

  colorTexture = device.createTexture({
    size: { width: canvasWidth, height: canvasHeight },
    sampleCount: antiAliasSampleCount,
    format: swapChainFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  colorTextureView = colorTexture.createView();

  lastWidth = canvasWidth;
  lastHeight = canvasHeight;

  aspectRatio = Math.abs(canvasWidth / canvasHeight);
}

// normally vertices can be shared by triangles, so this duplicates vertices as necessary so they are unshared
// TODO: this shouldn't be needed once "flat" shading is supported in Chrome's WGSL, see:
//      https://bugs.chromium.org/p/tint/issues/detail?id=746&q=interpolate&can=2
function unshareVertices(input: Mesh): Mesh {
  const pos: vec3[] = [];
  const tri: vec3[] = [];
  input.tri.forEach(([i0, i1, i2], i) => {
    pos.push(input.pos[i0]);
    pos.push(input.pos[i1]);
    pos.push(input.pos[i2]);
    tri.push([i * 3 + 0, i * 3 + 1, i * 3 + 2]);
  });
  return { pos, tri, colors: input.colors };
}

// once a mesh has been added to our vertex, triangle, and uniform buffers, we need
// to track offsets into those buffers so we can make modifications and form draw calls.
interface MeshHandle {
  // handles into the buffers
  vertNumOffset: number;
  indicesNumOffset: number;
  modelUniByteOffset: number;
  triCount: number;
  // data
  obj: GameObject;
}

// define the format of our vertices (this needs to agree with the inputs to the vertex shaders)
const vertexDataFormat: GPUVertexAttribute[] = [
  { shaderLocation: 0, offset: bytesPerVec3 * 0, format: "float32x3" }, // position
  { shaderLocation: 1, offset: bytesPerVec3 * 1, format: "float32x3" }, // color
  { shaderLocation: 2, offset: bytesPerVec3 * 2, format: "float32x3" }, // normals
];
// these help us pack and use vertices in that format
const vertElStride = 3 /*pos*/ + 3 /*color*/ + 3; /*normal*/
const vertByteSize = bytesPerFloat * vertElStride;

// define the format of our models' uniform buffer
const meshUniByteSizeExact =
  bytesPerMat4 + // transform
  bytesPerFloat; // max draw distance;
const meshUniByteSizeAligned = align(meshUniByteSizeExact, 256); // uniform objects must be 256 byte aligned

// defines the format of our scene's uniform data
const sceneUniBufferSizeExact =
  bytesPerMat4 * 2 + // camera and light projection
  bytesPerVec3 * 1; // light pos
const sceneUniBufferSizeAligned = align(sceneUniBufferSizeExact, 256); // uniform objects must be 256 byte aligned

// defines the limits of our vertex, index, and uniform buffers
const maxMeshes = 100;
const maxTris = maxMeshes * 100;
const maxVerts = maxTris * 3;

// create a directional light and compute it's projection (for shadows) and direction
const worldOrigin = vec3.fromValues(0, 0, 0);
const lightPosition = vec3.fromValues(50, 50, 0);
const upVector = vec3.fromValues(0, 1, 0);
const lightViewMatrix = mat4.lookAt(
  mat4.create(),
  lightPosition,
  worldOrigin,
  upVector
);
const lightProjectionMatrix = mat4.ortho(
  mat4.create(),
  -80,
  80,
  -80,
  80,
  -200,
  300
);
const lightViewProjMatrix = mat4.multiply(
  mat4.create(),
  lightProjectionMatrix,
  lightViewMatrix
);
const lightDir = vec3.subtract(vec3.create(), worldOrigin, lightPosition);
vec3.normalize(lightDir, lightDir);

function align(x: number, size: number): number {
  return Math.ceil(x / size) * size;
}
function computeTriangleNormal(p1: vec3, p2: vec3, p3: vec3): vec3 {
  // cross product of two edges, https://www.khronos.org/opengl/wiki/Calculating_a_Surface_Normal
  const n = vec3.cross(
    vec3.create(),
    vec3.sub(vec3.create(), p2, p1),
    vec3.sub(vec3.create(), p3, p1)
  );
  vec3.normalize(n, n);
  return n;
}

// matrix utilities
export function pitch(m: mat4, rad: number) {
  return mat4.rotateX(m, m, rad);
}
function yaw(m: mat4, rad: number) {
  return mat4.rotateY(m, m, rad);
}
function roll(m: mat4, rad: number) {
  return mat4.rotateZ(m, m, rad);
}
function moveX(m: mat4, n: number) {
  return mat4.translate(m, m, [n, 0, 0]);
}
function moveY(m: mat4, n: number) {
  return mat4.translate(m, m, [0, n, 0]);
}
function moveZ(m: mat4, n: number) {
  return mat4.translate(m, m, [0, 0, n]);
}

interface MappedGPUBuffers {
  vertexBufferOffset: number;
  vertexBuffer: Float32Array;
  indexBufferOffset: number;
  indexBuffer: Uint16Array;
  meshUniformBufferOffset: number;
  meshUniformBuffer: Float32Array;
}

export class Renderer {
  maxMeshes = 100;
  maxTris = maxMeshes * 100;
  maxVerts = maxTris * 3;

  state: GameView;
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;

  numVerts: number;
  numTris: number;

  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  meshUniformBuffer: GPUBuffer;
  sceneUniformBuffer: GPUBuffer;

  cameraOffset: mat4;

  meshHandles: MeshHandle[];

  mappedGPUBuffers: MappedGPUBuffers | null = null;

  renderBundle: GPURenderBundle;

  private gpuBufferWriteMeshTransform(m: MeshHandle) {
    this.device.queue.writeBuffer(
      this.meshUniformBuffer,
      m.modelUniByteOffset,
      (m.obj.transform() as Float32Array).buffer
    );
  }

  // should only be called when GPU buffers are already mapped
  private getMappedRanges() {
    let vertexBuffer = new Float32Array(this.vertexBuffer.getMappedRange());
    let indexBuffer = new Uint16Array(this.indexBuffer.getMappedRange());
    let meshUniformBuffer = new Float32Array(
      this.meshUniformBuffer.getMappedRange()
    );

    this.mappedGPUBuffers = {
      vertexBuffer,
      indexBuffer,
      meshUniformBuffer,
      vertexBufferOffset: 0,
      indexBufferOffset: 0,
      meshUniformBufferOffset: 0,
    };
  }

  private async mapGPUBuffers() {
    await Promise.all([
      this.vertexBuffer.mapAsync(GPUMapMode.READ),
      this.indexBuffer.mapAsync(GPUMapMode.READ),
      this.meshUniformBuffer.mapAsync(GPUMapMode.READ),
    ]);
    this.getMappedRanges();
  }

  private unmapGPUBuffers() {
    this.vertexBuffer.unmap();
    this.indexBuffer.unmap();
    this.meshUniformBuffer.unmap();
    this.mappedGPUBuffers = null;
  }

  /*
    Adds an object to be rendered. Currently expects the GPU's buffers to be memory-mapped.
                  
    TODO: support adding objects when buffers aren't memory-mapped using device.queue
  */
  addObject(o: GameObject): MeshHandle {
    let m = o.mesh();
    m = unshareVertices(m); // work-around; see TODO inside function
    if (this.mappedGPUBuffers === null) {
      throw "addObject() called with un-mapped buffers";
    } else {
      // need to introduce a new variable to convince Typescript the mapping is non-null
      let mapped = this.mappedGPUBuffers;
      if (this.numVerts + m.pos.length > maxVerts) throw "Too many vertices!";
      if (this.numTris + m.tri.length > maxTris) throw "Too many triangles!";

      const vertNumOffset = this.numVerts;
      const indicesNumOffset = this.numTris * 3;

      m.tri.forEach((triInd, i) => {
        const vOff = this.numVerts * vertElStride;
        const iOff = this.numTris * indicesPerTriangle;
        mapped.indexBuffer[iOff + 0] = triInd[0];
        mapped.indexBuffer[iOff + 1] = triInd[1];
        mapped.indexBuffer[iOff + 2] = triInd[2];
        const normal = computeTriangleNormal(
          m.pos[triInd[0]],
          m.pos[triInd[1]],
          m.pos[triInd[2]]
        );
        mapped.vertexBuffer.set(
          [...m.pos[triInd[0]], ...m.colors[i], ...normal],
          vOff + 0 * vertElStride
        );
        mapped.vertexBuffer.set(
          [...m.pos[triInd[1]], ...m.colors[i], ...normal],
          vOff + 1 * vertElStride
        );
        mapped.vertexBuffer.set(
          [...m.pos[triInd[2]], ...m.colors[i], ...normal],
          vOff + 2 * vertElStride
        );
        this.numVerts += 3;
        this.numTris += 1;
      });

      const uniOffset = this.meshHandles.length * meshUniByteSizeAligned;
      mapped.meshUniformBuffer.set(
        o.transform() as Float32Array,
        uniOffset / bytesPerFloat
      );
      const res: MeshHandle = {
        vertNumOffset,
        indicesNumOffset,
        modelUniByteOffset: uniOffset,
        triCount: m.tri.length,
        obj: o,
      };
      this.meshHandles.push(res);
      return res;
    }
  }

  setupSceneBuffer() {
    this.device.queue.writeBuffer(
      this.sceneUniformBuffer,
      bytesPerMat4 * 1,
      (lightViewProjMatrix as Float32Array).buffer
    );
    this.device.queue.writeBuffer(
      this.sceneUniformBuffer,
      bytesPerMat4 * 2,
      (lightDir as Float32Array).buffer
    );
  }

  constructor(state: GameView, canvas: HTMLCanvasElement, device: GPUDevice) {
    this.state = state;
    this.canvas = canvas;
    this.device = device;
    this.context = canvas.getContext("gpupresent")!;
    this.context.configure({ device, format: swapChainFormat });

    this.vertexBuffer = device.createBuffer({
      size: maxVerts * vertByteSize,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    this.indexBuffer = device.createBuffer({
      size: maxTris * bytesPerTri,
      usage: GPUBufferUsage.INDEX,
      mappedAtCreation: true,
    });
    this.meshUniformBuffer = device.createBuffer({
      size: meshUniByteSizeAligned * maxMeshes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    this.getMappedRanges();
    // create our scene's uniform buffer
    this.sceneUniformBuffer = device.createBuffer({
      size: sceneUniBufferSizeAligned,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.meshHandles = [];
    this.numVerts = 0;
    this.numTris = 0;

    for (let obj of state.objects()) {
      this.addObject(obj);
    }
    this.unmapGPUBuffers();

    this.setupSceneBuffer();

    this.cameraOffset = mat4.create();
    pitch(this.cameraOffset, -Math.PI / 8);

    const modelUniBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: "uniform",
            hasDynamicOffset: true,
            minBindingSize: meshUniByteSizeAligned,
          },
        },
      ],
    });
    const modelUniBindGroup = device.createBindGroup({
      layout: modelUniBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.meshUniformBuffer,
            size: meshUniByteSizeAligned,
          },
        },
      ],
    });

    // we'll use a triangle list with backface culling and counter-clockwise triangle indices for both pipelines
    const primitiveBackcull: GPUPrimitiveState = {
      topology: "triangle-list",
      cullMode: "back",
      frontFace: "ccw",
    };

    // define the resource bindings for the mesh rendering pipeline
    const renderSceneUniBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
    const renderSceneUniBindGroup = device.createBindGroup({
      layout: renderSceneUniBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.sceneUniformBuffer } }],
    });

    // setup our second phase pipeline which renders meshes to the canvas
    const renderPipelineDesc: GPURenderPipelineDescriptor = {
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          renderSceneUniBindGroupLayout,
          modelUniBindGroupLayout,
        ],
      }),
      vertex: {
        module: device.createShaderModule({ code: vertexShader }),
        entryPoint: "main",
        buffers: [
          {
            arrayStride: vertByteSize,
            attributes: vertexDataFormat,
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({ code: fragmentShader }),
        entryPoint: "main",
        targets: [{ format: swapChainFormat }],
      },
      primitive: primitiveBackcull,
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less",
        format: depthStencilFormat,
      },
      multisample: {
        count: antiAliasSampleCount,
      },
    };
    const renderPipeline = device.createRenderPipeline(renderPipelineDesc);

    // record all the draw calls we'll need in a bundle which we'll replay during the render loop each frame.
    // This saves us an enormous amount of JS compute. We need to rebundle if we add/remove meshes.
    const bundleEnc = device.createRenderBundleEncoder({
      colorFormats: [swapChainFormat],
      depthStencilFormat: depthStencilFormat,
      sampleCount: antiAliasSampleCount,
    });
    bundleEnc.setPipeline(renderPipeline);
    bundleEnc.setBindGroup(0, renderSceneUniBindGroup);
    bundleEnc.setVertexBuffer(0, this.vertexBuffer);
    bundleEnc.setIndexBuffer(this.indexBuffer, "uint16");
    for (let m of this.meshHandles) {
      bundleEnc.setBindGroup(1, modelUniBindGroup, [m.modelUniByteOffset]);
      bundleEnc.drawIndexed(
        m.triCount * 3,
        undefined,
        m.indicesNumOffset,
        m.vertNumOffset
      );
    }
    this.renderBundle = bundleEnc.finish();
  }

  renderFrame() {
    checkCanvasResize(this.device, this.canvas.width, this.canvas.height);
    const viewMatrix = this.state.viewMatrix();
    const projectionMatrix = mat4.perspective(
      mat4.create(),
      (2 * Math.PI) / 5,
      aspectRatio,
      1,
      10000.0 /*view distance*/
    );
    const viewProj = mat4.multiply(
      mat4.create(),
      projectionMatrix,
      viewMatrix
    ) as Float32Array;
    console.log(viewProj);
    this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, viewProj.buffer);

    // update all mesh transforms
    // TODO: only update when changed
    for (let m of this.meshHandles) {
      this.gpuBufferWriteMeshTransform(m);
    }

    // start collecting our render commands for this frame
    const commandEncoder = this.device.createCommandEncoder();

    // render to the canvas' via our swap-chain
    const renderPassEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: colorTextureView,
          resolveTarget: this.context.getCurrentTexture().createView(),
          loadValue: backgroundColor,
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTextureView,
        depthLoadValue: 1.0,
        depthStoreOp: "store",
        stencilLoadValue: 0,
        stencilStoreOp: "store",
      },
    });
    renderPassEncoder.executeBundles([this.renderBundle]);
    renderPassEncoder.endPass();

    // submit render passes to GPU
    this.device.queue.submit([commandEncoder.finish()]);
  }
}
