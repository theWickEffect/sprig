import { CY } from "../gpu-registry.js";
const CLOTH_SIZE = 16; // TODO(@darzu):
const clothTexPtrDesc = {
    size: [CLOTH_SIZE, CLOTH_SIZE],
    // format: "rgba16float",
    // TODO(@darzu): what's going on with format type
    format: "rgba32float",
    init: () => {
        const clothData = new Float32Array(CLOTH_SIZE * CLOTH_SIZE * 4);
        for (let x = 0; x < CLOTH_SIZE; x++) {
            for (let y = 0; y < CLOTH_SIZE; y++) {
                const i = (y + x * CLOTH_SIZE) * 3;
                clothData[i + 0] = i / clothData.length;
                clothData[i + 1] = i / clothData.length;
                clothData[i + 2] = i / clothData.length;
            }
        }
        return clothData;
    },
};
const clothTexPtr0 = CY.createTexture("clothTex0", {
    ...clothTexPtrDesc,
});
const clothTexPtr1 = CY.createTexture("clothTex1", {
    ...clothTexPtrDesc,
});
// TODO(@darzu): CLOTH
let clothReadIdx = 1;
export const cmpClothPipelinePtr0 = CY.createComputePipeline("clothComp0", {
    globals: [
        { ptr: clothTexPtr0, access: "read", alias: "inTex" },
        { ptr: clothTexPtr1, access: "write", alias: "outTex" },
    ],
    workgroupCounts: [1, 1, 1],
    shader: "xp-cloth-update",
    shaderComputeEntry: "main",
});
export const cmpClothPipelinePtr1 = CY.createComputePipeline("clothComp1", {
    globals: [
        { ptr: clothTexPtr1, access: "read", alias: "inTex" },
        { ptr: clothTexPtr0, access: "write", alias: "outTex" },
    ],
    workgroupCounts: [1, 1, 1],
    shader: "xp-cloth-update",
    shaderComputeEntry: "main",
});
//# sourceMappingURL=xp-cloth-pipeline.js.map