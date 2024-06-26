import { AnimateToDef } from "../animation/animate-to.js";
import { createRef } from "../ecs/em-helpers.js";
import { EM } from "../ecs/ecs.js";
import { V2, V3, V } from "../matrix/sprig-matrix.js";
import { PhysicsParentDef, PositionDef, RotationDef, } from "../physics/transform.js";
import { createTextureReader } from "../render/cpu-texture.js";
import { createJfaPipelines } from "../render/pipelines/std-jump-flood.js";
import { oceanPoolPtr, RenderDataOceanDef, } from "../render/pipelines/std-ocean.js";
import { unwrapPipeline, unwrapPipeline2, uvMaskTex, uvToNormTex, uvToPosTex, uvToTangTex, } from "../render/pipelines/xp-uv-unwrap.js";
import { RenderableConstructDef, RenderableDef, RendererDef, } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { dbgLogOnce } from "../utils/util.js";
import { quatFromUpForward_OLD, } from "../utils/utils-3d.js";
import { ColorDef } from "../color/color-ecs.js";
import { DEFAULT_MASK, UVUNWRAP_MASK } from "../render/pipeline-masks.js";
import { compute_gerstner, createWaves } from "./gerstner.js";
import { Phase } from "../ecs/sys-phase.js";
const DBG_HIDE_OCEAN = false; // TODO(@darzu): DEBUGGING
// TODO(@darzu): rename "ocean" to "uvsurface" or similar
export const OceanDef = EM.defineResource("ocean", (o) => {
    return o;
});
export const UVPosDef = EM.defineComponent("uvPos", () => V2.mk(), (p, uv) => (uv ? V2.copy(p, uv) : p));
EM.registerSerializerPair(UVPosDef, (o, buf) => buf.writeVec2(o), (o, buf) => buf.readVec2(o));
export const UVDirDef = EM.defineComponent("uvDir", () => V(0, 1), (p, dir) => (dir ? V2.copy(p, dir) : p));
EM.registerSerializerPair(UVDirDef, (o, buf) => buf.writeVec2(o), (o, buf) => buf.readVec2(o));
// const BouyDef = EM.defineComponent(
//   "bouy",
//   (uv: vec2 = [0, 0], child?: Ref<[typeof PositionDef]>) => ({
//     uv: uv,
//     child: child ?? createRef(0, [PositionDef]),
//   })
// );
export const oceanJfa = createJfaPipelines({
    name: "oceanJfa",
    maskTex: uvMaskTex,
    maskMode: "exterior",
});
export async function initOcean(oceanMesh, color) {
    // TODO(@darzu): Z_UP fix ocean
    // console.log("initOcean");
    const res = await EM.whenResources(RendererDef, TimeDef);
    const ocean = EM.mk();
    let oceanEntId = ocean.id; // hacky?
    EM.set(ocean, RenderableConstructDef, 
    // TODO(@darzu): SEPERATE THIS DEPENDENCY! Need ocean w/o mesh
    oceanMesh, !DBG_HIDE_OCEAN, 0, UVUNWRAP_MASK | DEFAULT_MASK, oceanPoolPtr
    // meshPoolPtr
    );
    EM.set(ocean, ColorDef, color);
    //EM.set(ocean, PositionDef, [12000, 180, 0]);
    EM.set(ocean, PositionDef);
    let ocean2 = await EM.whenEntityHas(ocean, RenderableDef, RenderDataOceanDef);
    // let ocean2 = await EM.whenEntityHas(ocean, RenderableDef, RenderDataStdDef);
    // TODO(@darzu): dbging ?
    const preOceanGPU = performance.now();
    res.renderer.renderer
        .getCyResource(oceanPoolPtr)
        .updateUniform(ocean2.renderable.meshHandle, ocean2.renderDataOcean);
    // TODO(@darzu): seperate and compose uv unwrapping as its own feature with a more sane
    //  integration w/ the ocean stuff
    res.renderer.renderer.submitPipelines([ocean2.renderable.meshHandle], 
    // [unwrapPipeline, unwrapPipeline2]
    [unwrapPipeline, unwrapPipeline2, ...oceanJfa.allPipes()]);
    // read from one-time jobs
    // TODO(@darzu): what's the right way to handle these jobs
    const readPromises = [
        res.renderer.renderer.readTexture(uvToPosTex),
        res.renderer.renderer.readTexture(uvToNormTex),
        res.renderer.renderer.readTexture(uvToTangTex),
        // TODO(@darzu): JFA alignment issue! see note in readTexture
        res.renderer.renderer.readTexture(oceanJfa.sdfTex),
    ];
    const [uvToPosData, uvToNormData, uvToTangData, sdfData,
    //
    ] = await Promise.all(readPromises);
    const timeOceanGPU = performance.now() - preOceanGPU;
    console.log(`ocean GPU round-trip: ${timeOceanGPU.toFixed(2)}ms`);
    // TODO(@darzu): Account for the 1px border in the texture!!!
    const uvToPosReader = createTextureReader(uvToPosData, uvToPosTex.size, 3, uvToPosTex.format);
    const uvToNormReader = createTextureReader(uvToNormData, uvToNormTex.size, 3, uvToNormTex.format);
    const uvToTangReader = createTextureReader(uvToTangData, uvToTangTex.size, 3, uvToTangTex.format);
    const sdfReader = createTextureReader(sdfData, oceanJfa.sdfTex.size, 1, oceanJfa.sdfTex.format);
    // TODO(@darzu): re-enable all these texture reader things
    const uvToPos = (out, uv) => {
        dbgLogOnce(`uvToPos is disabled! tex format issues`, undefined, true);
        const x = uv[0] * uvToPosReader.size[0];
        const y = uv[1] * uvToPosReader.size[1];
        // console.log(`${x},${y}`);
        return uvToPosReader.sample(x, y, out);
    };
    const uvToNorm = (out, uv) => {
        dbgLogOnce(`uvToNorm is disabled! tex format issues`, undefined, true);
        const x = uv[0] * uvToNormReader.size[0];
        const y = uv[1] * uvToNormReader.size[1];
        // console.log(`${x},${y}`);
        return uvToNormReader.sample(x, y, out);
    };
    const uvToTang = (out, uv) => {
        dbgLogOnce(`uvToTang is disabled! tex format issues`, undefined, true);
        const x = uv[0] * uvToTangReader.size[0];
        const y = uv[1] * uvToTangReader.size[1];
        // console.log(`${x},${y}`);
        return uvToTangReader.sample(x, y, out);
    };
    // TODO(@darzu): re-enable
    const uvToEdgeDist = (uv) => {
        dbgLogOnce(`uvToEdgeDist is disabled! tex format issues`, undefined, true);
        const x = uv[0] * uvToNormReader.size[0];
        const y = uv[1] * uvToNormReader.size[1];
        return sdfReader.sample(x, y);
    };
    const gerstnerWaves = createWaves();
    // TODO(@darzu): HACK!
    const __temp1 = V2.mk();
    const __temp2 = V3.mk();
    const __temp3 = V3.mk();
    const __temp4 = V3.mk();
    const __temp5 = V3.mk();
    const __temp6 = V3.mk();
    const __temp7 = V3.mk();
    const __temp8 = V3.mk();
    const __temp9 = V3.mk();
    const __temp10 = V3.mk();
    const __temp11 = V3.mk();
    const uvToGerstnerDispAndNorm = (outDisp, outNorm, uv) => {
        // console.log(`uv: ${uv}`);
        // TODO(@darzu): impl
        compute_gerstner(outDisp, outNorm, gerstnerWaves, 
        // TODO(@darzu): reconcile input xy and uv or worldspace units
        // TODO(@darzu): wtf is this 1000x about?!
        V2.scale(uv, 1000, __temp1), 
        // uv,
        res.time.time);
        // TODO(@darzu): OCEAN. waht is this code below?
        // TODO(@darzu): OCEAN. Something below is essential for hyperspace game:
        const pos = uvToPos(__temp2, uv);
        const norm = uvToNorm(__temp3, uv);
        const tang = uvToTang(__temp4, uv);
        const perp = V3.cross(tang, norm, __temp5);
        // TODO(@darzu): Z_UP: i think we want to scale disp.x by tangent, .y by perp, .z by norm
        const disp = V3.add(V3.scale(perp, outDisp[0], __temp6), V3.add(V3.scale(norm, outDisp[1], __temp7), V3.scale(tang, outDisp[2], __temp8), __temp11), __temp9);
        // outDisp[0] = pos[0] + disp[0] * 0.5;
        // outDisp[1] = pos[1] + disp[1];
        // outDisp[2] = pos[2] + disp[2] * 0.5;
        // outDisp[0] = pos[0] + disp[0] * 0.5;
        // outDisp[1] = pos[1] + disp[1];
        // outDisp[2] = pos[2] + disp[2] * 0.5;
        V3.add(pos, disp, outDisp);
        const gNorm = V3.add(V3.scale(perp, outNorm[0], __temp6), V3.add(V3.scale(norm, outNorm[1], __temp7), V3.scale(tang, outNorm[2], __temp8), __temp11), __temp10);
        V3.copy(outNorm, gNorm);
        // HACK: smooth out norm?
        V3.add(outNorm, V3.scale(norm, 2.0, __temp6), outNorm);
        V3.norm(outNorm, outNorm);
    };
    // TODO(@darzu): hacky hacky way to do this
    const oceanRes = EM.addResource(OceanDef, {
        ent: createRef(oceanEntId, [PositionDef]),
        uvToPos,
        uvToNorm,
        uvToTang,
        uvToEdgeDist,
        uvToGerstnerDispAndNorm,
        // TODO: enforce programmatically that sum(Q_i * A_i * w_i) <= 1.0
        gerstnerWaves,
    });
    res.renderer.renderer.updateGerstnerWaves(oceanRes.gerstnerWaves);
    res.renderer.renderer.updateScene({
        numGerstnerWaves: oceanRes.gerstnerWaves.length,
    });
    // TODO(@darzu): Gerstner on CPU
    // res.time.time
}
export function registerOceanUVFns() {
    const __temp1 = V3.mk();
    const __temp2 = V3.mk();
    EM.addSystem("oceanUVtoPos", Phase.GAME_WORLD, [UVPosDef, PositionDef], [OceanDef], (es, res) => {
        // console.log("runOcean");
        for (let e of es) {
            // TODO(@darzu): need some notion of UV parenting?
            if (PhysicsParentDef.isOn(e) && e.physicsParent.id !== 0)
                continue;
            if (AnimateToDef.isOn(e))
                continue;
            // console.log(`copying: ${e.id}`);
            const newPos = __temp1;
            res.ocean.uvToGerstnerDispAndNorm(newPos, __temp2, e.uvPos);
            // const newPos = res.ocean.uvToPos(V3.tmp(), e.uvPos);
            // if (e.id > 10001) {
            //   // [-347.83,25.77,126.72]
            //   // [-347.83,25.77,126.72]
            //   console.log(
            //     `moving: ${e.id} at uv ${vec2Dbg(e.uvPos)} from ${vec3Dbg(
            //       e.position
            //     )} to ${vec3Dbg(newPos)}`
            //   );
            // }
            if (!V3.exactEquals(newPos, V3.ZEROS)) {
                V3.copy(e.position, newPos);
                // console.log(`moving to: ${vec3Dbg(e.position)}`);
            }
        }
    });
    const __temp3 = V2.mk();
    const __temp4 = V3.mk();
    EM.addSystem("oceanUVDirToRot", Phase.GAME_WORLD, [UVPosDef, UVDirDef, PositionDef, RotationDef], [OceanDef], (es, res) => {
        // console.log("runOcean");
        for (let e of es) {
            // TODO(@darzu): need some notion of UV parenting?
            if (PhysicsParentDef.isOn(e) && e.physicsParent.id !== 0)
                continue;
            if (AnimateToDef.isOn(e))
                continue;
            // console.log(`copying: ${e.id}`);
            // const newNorm = V3.tmp();
            // res.ocean.uvToGerstnerDispAndNorm(V3.tmp(), newNorm, e.uvPos);
            // vec3.copy(e.rotation, newNorm);
            // TODO(@darzu): this is horrible.
            // console.log(`copying: ${e.id}`);
            // const newNorm = V3.tmp();
            // res.ocean.uvToGerstnerDispAndNorm(V3.tmp(), newNorm, e.uvPos);
            // vec3.copy(e.rotation, newNorm);
            // TODO(@darzu): this is horrible.
            V2.norm(e.uvDir, e.uvDir);
            const scaledUVDir = V2.scale(e.uvDir, 0.0001, __temp3);
            const aheadUV = V2.add(e.uvPos, scaledUVDir, __temp3);
            const aheadPos = __temp1;
            res.ocean.uvToGerstnerDispAndNorm(aheadPos, __temp2, aheadUV);
            // const aheadPos = res.ocean.uvToPos(V3.tmp(), aheadUV);
            // TODO(@darzu): want SDF-based bounds checking
            if (!V3.exactEquals(aheadPos, V3.ZEROS)) {
                const forwardish = V3.sub(aheadPos, e.position, __temp1);
                const newNorm = __temp2;
                res.ocean.uvToGerstnerDispAndNorm(__temp4, newNorm, e.uvPos);
                quatFromUpForward_OLD(e.rotation, newNorm, forwardish);
                // console.log(
                //   `UVDir ${[e.uvDir[0], e.uvDir[1]]} -> ${quatDbg(e.rotation)}`
                // );
            }
        }
    });
}
// TODO(@darzu): debug movement on the ocean
// EM.registerSystem(
//   [UVPosDef, UVDirDef, PositionDef, RotationDef],
//   [OceanDef, InputsDef],
//   (es, res) => {
//     // console.log("runOcean");
//     for (let e of es) {
//       // TODO(@darzu): debug moving
//       // console.log("moving buoy!");
//       let speed = 0.001;
//       const deltaUV = V2.zero(V2.tmp());
//       if (res.inputs.keyDowns["shift"]) speed *= 5;
//       if (res.inputs.keyDowns["arrowright"]) deltaUV[1] -= speed;
//       if (res.inputs.keyDowns["arrowleft"]) deltaUV[1] += speed;
//       if (res.inputs.keyDowns["arrowup"]) deltaUV[0] += speed;
//       if (res.inputs.keyDowns["arrowdown"]) deltaUV[0] -= speed;
//       if (deltaUV[0] !== 0.0 || deltaUV[1] !== 0.0) {
//         const newUV = V2.add(V2.tmp(), e.uvPos, deltaUV);
//         // TODO(@darzu): need a better way to see if UV is out of map bounds
//         const newPos = res.ocean.uvToPos(V3.tmp(), newUV);
//         if (!vec3.exactEquals(newPos, vec3.ZEROS)) {
//           V2.copy(e.uvPos, newUV);
//           V2.copy(e.uvDir, deltaUV);
//         }
//       }
//     }
//   },
//   "runOcean"
// );
// TODO(@darzu): ocean texture posibilities:
// [x] 2D voronoi texture to CPU
// [x] 2D normals texture
// [ ] 3D->3D voronoi texture
// [ ] 3D->2D voronoi seeds lookup texture
// [ ] 3D normals texture ?
//# sourceMappingURL=ocean.js.map