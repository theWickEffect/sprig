import { CY } from "../gpu-registry.js";
import { GRID_MASK } from "../pipeline-masks.js";
import { sceneBufPtr, meshPoolPtr, mainDepthTex, litTexturePtr, } from "./std-scene.js";
// TODO(@darzu): support tri-planar mapping?
export const stdGridRender = CY.createRenderPipeline("stdGridRender", {
    globals: [sceneBufPtr],
    cullMode: "back",
    meshOpt: {
        pool: meshPoolPtr,
        stepMode: "per-mesh-handle",
        meshMask: GRID_MASK,
    },
    shaderVertexEntry: "vert_main",
    shaderFragmentEntry: "frag_main",
    output: [
        {
            // ptr: unlitTexturePtr,
            ptr: litTexturePtr,
            clear: "never",
            // TODO(@darzu): do we want to do this?
            blend: {
                color: {
                    srcFactor: "src-alpha",
                    dstFactor: "one-minus-src-alpha",
                    operation: "add",
                },
                alpha: {
                    srcFactor: "constant",
                    dstFactor: "zero",
                    operation: "add",
                },
            },
        },
    ],
    depthStencil: mainDepthTex,
    shader: "std-grid",
    fragOverrides: {
        // TODO(@darzu): Bug. These initial values don't matter? They init values in shader can't be excluded and these don't apply
        lineSpacing1: 1,
        lineWidth1: 1,
        lineSpacing2: 1,
        lineWidth2: 1,
        ringStart: 1,
        ringWidth: 1,
    },
});
//# sourceMappingURL=std-grid.js.map