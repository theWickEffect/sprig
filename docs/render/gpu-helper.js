import { assert } from "../utils/util.js";
import { isFunction } from "../utils/util.js";
import { never } from "../utils/util-no-import.js";
import { CY, isResourcePtr, linearSamplerPtr, } from "./gpu-registry.js";
import { createCyStruct, texTypeIsDepth, TexTypeToElementArity, texTypeToSampleType, TexTypeToWGSLElement, } from "./gpu-struct.js";
export const QuadStruct = createCyStruct({
    minX: "f32",
    maxX: "f32",
    minY: "f32",
    maxY: "f32",
}, {
    isUniform: true,
});
export const fullQuad = CY.createSingleton(`fullQuadStruct`, {
    struct: QuadStruct,
    init: () => ({
        minX: -1,
        maxX: 1,
        minY: -1,
        maxY: 1,
    }),
});
export function createRenderTextureToQuad(name, inTexAtt, outTex, minX = -1, maxX = 1, minY = -1, maxY = 1, sample = false, 
// TODO(@darzu): maybe all shaders should work this way?
//   with this dictionary being statically typed based on the globals
//   defined in the CyPtr. Kind of like the ECS systems.
fragSnippet, libs) {
    const quad = CY.createSingleton(`${name}Quad`, {
        struct: QuadStruct,
        init: () => ({
            minX,
            maxX,
            minY,
            maxY,
        }),
    });
    const inTex = isResourcePtr(inTexAtt) ? inTexAtt : inTexAtt.ptr;
    const inIdx = isResourcePtr(inTexAtt) ? 0 : inTexAtt.idx;
    const isArray = !!inTex.count;
    const inTexIsUnfilterable = texTypeToSampleType[inTex.format]?.every((f) => f.startsWith("unfilterable"));
    // TODO(@darzu): turn on-off sampling?
    const doSample = !inTexIsUnfilterable && sample;
    if (sample && inTexIsUnfilterable) {
        console.warn(`specifying "sample = true" for unfilterable format "${inTex.format}" during ${name}`);
    }
    // outTex.format;
    const shader = (shaders) => {
        const inputArity = TexTypeToElementArity[inTex.format];
        assert(inputArity, `Missing texture element arity for: ${inTex.format}`);
        const outArity = TexTypeToElementArity[outTex.format];
        assert(outArity, `Missing texture element arity for: ${outTex.format}`);
        const returnWgslType = TexTypeToWGSLElement[outTex.format];
        assert(returnWgslType, `Missing WGSL return type for: ${outTex.format}`);
        // TODO(@darzu): we're doing all kinds of template-y / macro-y stuff w/ shaders
        //      needs more thought for good abstration.
        // TODO(@darzu): so many macro hacks. what's the principled approach?
        // TODO(@darzu): HACK-y. Parameterize this. And we might want to normalize w/ different values.
        const inIsInt = inTex.format.endsWith("int");
        let fSnipInExpression = "inPx";
        if (inIsInt) {
            if (inputArity === 2) {
                fSnipInExpression = `(vec2<f32>(inPx) / dimsF)`;
            }
            else
                throw `TODO: inIsInt && inputArity === ${inputArity}`;
        }
        let fSnip = `return ${returnWgslType}(${fSnipInExpression});`;
        if (inputArity === 2 && outArity === 4)
            fSnip = `return ${returnWgslType}(${fSnipInExpression}.xy, 0.0, 0.0);`;
        if (fragSnippet) {
            if (isFunction(fragSnippet))
                fSnip = fragSnippet({
                    dimsI: "dimsI",
                    dimsF: "dimsF",
                    inPx: "inPx",
                    uv: "uv",
                    inTex: "inTex",
                    xy: "xy",
                });
            else
                fSnip = shaders[fragSnippet].code;
        }
        const loadSuffix = inputArity === 1
            ? texTypeIsDepth[inTex.format]
                ? ``
                : `.x`
            : inputArity === 2
                ? `.xy`
                : inputArity === 4
                    ? `.xyzw`
                    : never(inputArity);
        let sampleStr;
        if (!doSample) {
            if (!isArray)
                sampleStr = `let inPx = textureLoad(inTex, xy, 0)${loadSuffix};`;
            else
                sampleStr = `let inPx = textureLoad(inTex, xy, ${inIdx}, 0)${loadSuffix};`;
        }
        else {
            if (!isArray)
                sampleStr = `let inPx = textureSample(inTex, mySampler, uv)${loadSuffix};`;
            else
                sampleStr = `let inPx = textureSample(inTex, mySampler, uv, ${inIdx})${loadSuffix};`;
        }
        return `
    ${libs ? libs.map((l) => shaders[l].code).join("\n") : ""}

    ${shaders["std-screen-quad-vert"].code}

    @fragment
    fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) ${returnWgslType} {
      // TODO(@darzu): we probably shouldn't always cast this into i32..
      let dimsI : vec2<i32> = vec2<i32>(textureDimensions(inTex));
      let dimsF = vec2<f32>(dimsI);
      let xy = vec2<i32>(uv * dimsF);
      ${sampleStr}
      ${fSnip}
    }
  `;
    };
    const pipeline = CY.createRenderPipeline(name, {
        globals: [
            // TODO(@darzu): Actually, not all textures (e.g. unfilterable rgba32float)
            //  support this sampler.
            //  Hmm. Actually the shader code itself might need to change based on filterable vs not. F.
            { ptr: linearSamplerPtr, alias: "mySampler" },
            // TODO(@darzu): WTF typescript?! This ternary is necessary for some reason.
            inTex.kind === "texture"
                ? { ptr: inTex, alias: "inTex" }
                : { ptr: inTex, alias: "inTex" },
            { ptr: quad, alias: "quad" },
        ],
        meshOpt: {
            vertexCount: 6,
            stepMode: "single-draw",
        },
        output: [outTex],
        shader,
        shaderFragmentEntry: "frag_main",
        shaderVertexEntry: "vert_main",
    });
    return { pipeline, quad };
}
//# sourceMappingURL=gpu-helper.js.map