import { ColorDef, TintsDef, applyTints } from "../color/color-ecs.js";
import { EM } from "../ecs/ecs.js";
import { CY, linearSamplerPtr } from "../render/gpu-registry.js";
import { createCyStruct } from "../render/gpu-struct.js";
import { pointLightsPtr } from "../render/lights.js";
import { MAX_INDICES } from "../render/mesh-pool.js";
import { sceneBufPtr, surfacesTexturePtr, mainDepthTex, worldNormsAndFresTexPtr, unlitTexturePtr, } from "../render/pipelines/std-scene.js";
import { RenderableDef, RendererDef, RendererWorldFrameDef, } from "../render/renderer-ecs.js";
import { mat4, V, V3 } from "../matrix/sprig-matrix.js";
import { assertDbg } from "../utils/util.js";
import { computeTriangleNormal } from "../utils/utils-3d.js";
import { LandMapTexPtr } from "../levels/level-map.js";
import { Phase } from "../ecs/sys-phase.js";
const MAX_GRASS_VERTS = MAX_INDICES;
const MAX_GRASS_MESHES = 500;
// TODO(@darzu): change
export const GrassVertStruct = createCyStruct({
    position: "vec3<f32>",
    normal: "vec3<f32>",
    surfaceId: "u32",
}, {
    isCompact: true,
    serializer: ({ position, normal, surfaceId }, _, offsets_32, views) => {
        views.f32.set(position, offsets_32[0]);
        views.f32.set(normal, offsets_32[1]);
        views.u32[offsets_32[2]] = surfaceId;
    },
});
export const GrassUniStruct = createCyStruct({
    transform: "mat4x4<f32>",
    // TODO(@darzu): what is this for?
    // aabbMin: "vec3<f32>",
    // aabbMax: "vec3<f32>",
    tint: "vec3<f32>",
    id: "u32",
    spawnDist: "f32",
}, {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
        views.f32.set(d.transform, offsets_32[0]);
        // views.f32.set(d.aabbMin, offsets_32[1]);
        // views.f32.set(d.aabbMax, offsets_32[2]);
        views.f32.set(d.tint, offsets_32[1]);
        views.u32[offsets_32[2]] = d.id;
        views.f32[offsets_32[3]] = d.spawnDist;
    },
});
function createEmptyVertexTS() {
    return {
        position: V3.mk(),
        // color: V3.create(),
        // tangent: m.tangents ? m.tangents[i] : [1.0, 0.0, 0.0],
        normal: V3.mk(),
        // uv: m.uvs ? m.uvs[i] : [0.0, 0.0],
        surfaceId: 0,
    };
}
// TODO(@darzu): MESH PARTS: de-dupe this logic
const tempVertsData = [];
function computeGrassVertsData(m, startIdx, count) {
    assertDbg(0 <= startIdx && startIdx + count <= m.pos.length);
    // TODO(@darzu): use resizeArray?
    while (tempVertsData.length < count)
        tempVertsData.push(createEmptyVertexTS());
    for (let vi = startIdx; vi < startIdx + count; vi++) {
        const dIdx = vi - startIdx;
        // NOTE: assignment is fine since this better not be used without being re-assigned
        tempVertsData[dIdx].position = m.pos[vi];
        // TODO(@darzu): UVs and other properties?
    }
    // NOTE: for per-face data (e.g. color and surface IDs), first all the quads then tris
    m.tri.forEach((triInd, i) => {
        // set provoking vertex data
        const provVi = triInd[0];
        // is triangle relevant to changed vertices?
        if (provVi < startIdx || startIdx + count <= provVi)
            return;
        const dIdx = provVi - startIdx;
        // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
        // TODO(@darzu): what to do about normals. If we're modifying verts, they need to recompute. But it might be in the mesh.
        computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]], tempVertsData[dIdx].normal);
        const faceIdx = i + m.quad.length; // quads first
        // TODO(@darzu): QUAD DATA BEING FIRST BUT TRIANGLES INDICES BEING FIRST IS INCONSISTENT
        // tempVertsData[dIdx].color = m.colors[faceIdx];
        tempVertsData[dIdx].surfaceId = m.surfaceIds[faceIdx];
    });
    m.quad.forEach((quadInd, i) => {
        // set provoking vertex data
        const provVi = quadInd[0];
        // is quad relevant to changed vertices?
        if (provVi < startIdx || startIdx + count <= provVi)
            return;
        const dIdx = provVi - startIdx;
        computeTriangleNormal(m.pos[quadInd[0]], m.pos[quadInd[1]], m.pos[quadInd[2]], tempVertsData[dIdx].normal);
        const faceIdx = i; // quads first
        // TODO(@darzu): QUAD DATA BEING FIRST BUT TRIANGLES INDICES BEING FIRST IS INCONSISTENT
        // tempVertsData[dIdx].color = m.colors[faceIdx];
        tempVertsData[dIdx].surfaceId = m.surfaceIds[faceIdx];
    });
    return tempVertsData;
}
export const RenderDataGrassDef = EM.defineNonupdatableComponent("renderDataGrass", (r) => r);
export const grassPoolPtr = CY.createMeshPool("grassPool", {
    computeVertsData: computeGrassVertsData,
    vertsStruct: GrassVertStruct,
    unisStruct: GrassUniStruct,
    maxMeshes: MAX_GRASS_MESHES,
    maxSets: 1,
    setMaxPrims: MAX_GRASS_VERTS,
    setMaxVerts: MAX_GRASS_VERTS,
    // TODO(@darzu): this dataDef is v weird
    dataDef: RenderDataGrassDef,
    prim: "tri",
});
export const GrassCutTexPtr = CY.createTexture("grassCut", {
    size: [1024, 512],
    // TODO(@darzu): we want the smaller format
    format: "r32float",
    // format: "r8unorm",
});
export const renderGrassPipe = CY.createRenderPipeline("grassRender", {
    globals: [
        sceneBufPtr,
        { ptr: linearSamplerPtr, alias: "samp" },
        // gerstnerWavesPtr,
        pointLightsPtr,
        GrassCutTexPtr,
        LandMapTexPtr,
        // { ptr: grassJfa.sdfTex, alias: "sdf" },
    ],
    // TODO(@darzu): for perf, maybe do backface culling
    cullMode: "none",
    meshOpt: {
        pool: grassPoolPtr,
        stepMode: "per-mesh-handle",
    },
    shaderVertexEntry: "vert_main",
    shaderFragmentEntry: "frag_main",
    output: [
        {
            ptr: unlitTexturePtr,
            clear: "never",
        },
        {
            ptr: worldNormsAndFresTexPtr,
            clear: "never",
            defaultColor: V(0, 0, 0, 0),
        },
        {
            ptr: surfacesTexturePtr,
            clear: "never",
        },
    ],
    depthStencil: mainDepthTex,
    shader: (shaderSet) => `
  ${shaderSet["std-rand"].code}
  ${shaderSet["std-grass"].code}
  `,
});
const _lastTilePos = new Map();
export function registerUploadGrassData() {
    EM.addSystem("updateGrassRenderData", Phase.RENDER_PRE_DRAW, [RenderableDef, RenderDataGrassDef, RendererWorldFrameDef], [RendererDef], (objs, res) => {
        const pool = res.renderer.renderer.getCyResource(grassPoolPtr);
        for (let o of objs) {
            let lastPos = _lastTilePos.get(o.id);
            if (!lastPos) {
                lastPos = V(Infinity, Infinity, Infinity);
                _lastTilePos.set(o.id, lastPos);
            }
            const newPos = mat4.getTranslation(o.rendererWorldFrame.transform);
            if (V3.sqrDist(lastPos, newPos) < 0.01) {
                continue;
            }
            V3.copy(lastPos, newPos);
            // TODO(@darzu): do we need all this for grass?
            // color / tint
            if (ColorDef.isOn(o)) {
                V3.copy(o.renderDataGrass.tint, o.color);
            }
            if (TintsDef.isOn(o)) {
                applyTints(o.tints, o.renderDataGrass.tint);
            }
            // id
            // o.renderDataGrass.id = o.renderable.meshHandle.mId;
            // transform
            mat4.copy(o.renderDataGrass.transform, o.rendererWorldFrame.transform);
            pool.updateUniform(o.renderable.meshHandle, o.renderDataGrass);
        }
    });
    // EM.addConstraint(["updateGrassRenderData", "after", "renderList"]);
    // EM.addConstraint(["updateGrassRenderData", "before", "stepRenderer"]);
}
//# sourceMappingURL=std-grass.js.map