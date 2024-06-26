import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { EM } from "../ecs/ecs.js";
import { V3, quat, V } from "../matrix/sprig-matrix.js";
import { InputsDef } from "../input/inputs.js";
import { remapEase } from "../utils/math.js";
import { ColliderDef } from "../physics/collider.js";
import { AngularVelocityDef } from "../motion/velocity.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { cloneMesh } from "../meshes/mesh.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { boidRender, boidComp0, boidComp1, } from "../render/pipelines/xp-boids-pipeline.js";
import { cmpClothPipelinePtr0, cmpClothPipelinePtr1, } from "../render/pipelines/xp-cloth-pipeline.js";
import { compRopePipelinePtr } from "../render/pipelines/xp-ropestick-pipeline.js";
import { RendererDef, RenderableConstructDef, RenderableDef, } from "../render/renderer-ecs.js";
import { EASE_INQUAD } from "../utils/util-ease.js";
import { assert } from "../utils/util.js";
import { drawLine } from "../utils/utils-game.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { ClothConstructDef, ClothLocalDef } from "./cloth.js";
import { GlobalCursor3dDef } from "../gui/cursor.js";
import { ENEMY_SHIP_COLOR } from "../hyperspace/uv-enemy-ship.js";
import { createGhost } from "../debug/ghost.js";
import { ForceDef } from "./spring.js";
import { TextDef } from "../gui/ui.js";
import { deferredPipeline } from "../render/pipelines/std-deferred.js";
import { Phase } from "../ecs/sys-phase.js";
// TODO(@darzu): BROKEN. cloth sandbox isn't lit right and cloth isn't there
export async function initClothSandbox() {
    const res = await EM.whenResources(AllMeshesDef, GlobalCursor3dDef, RendererDef, CameraDef);
    const camera = res.camera;
    camera.fov = Math.PI * 0.5;
    let renderPipelinesPtrs = [
        // TODO(@darzu):
        ...shadowPipelines,
        stdMeshPipe,
        // renderRopePipelineDesc,
        boidRender,
        // boidCanvasMerge,
        // shadowDbgDisplay,
        // normalDbg,
        // positionDbg,
        outlineRender,
        deferredPipeline,
        postProcess,
    ];
    let computePipelinesPtrs = [
        cmpClothPipelinePtr0,
        cmpClothPipelinePtr1,
        compRopePipelinePtr,
        boidComp0,
        boidComp1,
    ];
    res.renderer.pipelines = [...computePipelinesPtrs, ...renderPipelinesPtrs];
    const m2 = cloneMesh(res.allMeshes.cube.mesh);
    const g = createGhost(m2);
    V3.copy(g.position, [0, 1, -1.2]);
    quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, g.rotation);
    g.controllable.sprintMul = 3;
    {
        // vec3.copy(e.position, [-16.85, 7.11, -4.33]);
        // quat.copy(e.rotation, [0.0, -0.76, 0.0, 0.65]);
        // vec3.copy(e.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
        // e.cameraFollow.yawOffset = 0.0;
        // e.cameraFollow.pitchOffset = -0.368;
        V3.copy(g.position, [4.46, 9.61, -10.52]);
        quat.copy(g.rotation, [0.0, -1.0, 0.0, 0.04]);
        V3.copy(g.cameraFollow.positionOffset, [0.0, 0.0, 0.0]);
        g.cameraFollow.yawOffset = 0.0;
        g.cameraFollow.pitchOffset = -0.106;
    }
    const c = res.globalCursor3d.cursor();
    assert(RenderableDef.isOn(c));
    c.renderable.enabled = true;
    c.cursor3d.maxDistance = 10;
    const plane = EM.mk();
    EM.set(plane, RenderableConstructDef, res.allMeshes.plane.proto);
    EM.set(plane, ColorDef, V(0.2, 0.3, 0.2));
    EM.set(plane, PositionDef, V(0, -5, 0));
    const ship = EM.mk();
    EM.set(ship, RenderableConstructDef, res.allMeshes.ship.proto);
    EM.set(ship, ColorDef, ENEMY_SHIP_COLOR);
    EM.set(ship, PositionDef, V(20, -2, 0));
    EM.set(ship, RotationDef, quat.fromEuler(0, Math.PI * 0.1, 0, quat.mk()));
    // const ocean = EM.newEntity();
    // EM.set(
    //   ocean,
    //   EM.defineComponent("ocean", () => true)
    // );
    // EM.set(
    //   ocean,
    //   RenderableConstructDef,
    //   res.allMeshes.ocean.proto
    // );
    // EM.set(ocean, ColorDef, [0.0, 0.0, 0.4]);
    // EM.set(ocean, PositionDef, [12000, 180, 0]);
    // // vec3.scale(ocean.position, ocean.position, scale);
    // const scale = 100.0;
    // EM.set(ocean, ScaleDef, [scale, scale, scale]);
    // EM.set(
    //   ocean,
    //   RotationDef,
    //   quat.fromEuler(quat.create(), 0, Math.PI * 0.1, 0)
    // );
    const box = EM.mk();
    EM.set(box, RenderableConstructDef, res.allMeshes.cube.proto);
    EM.set(box, ColorDef, V(0.1, 0.1, 0.1));
    EM.set(box, PositionDef, V(0, 0, 3));
    EM.set(box, RotationDef);
    EM.set(box, AngularVelocityDef, V(0, 0.001, 0.001));
    EM.set(box, WorldFrameDef);
    EM.set(box, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: res.allMeshes.cube.aabb,
    });
    const cloth = EM.mk();
    EM.set(cloth, ClothConstructDef, {
        location: V(0, 0, 0),
        color: V(0.9, 0.9, 0.8),
        rows: 5,
        columns: 5,
        distance: 2,
    });
    const F = 100.0;
    EM.set(cloth, ForceDef, V(F, F, F));
    const line = await drawLine(V3.mk(), V3.mk(), V(0, 1, 0));
    EM.addSystem("clothSandbox", Phase.GAME_WORLD, [ClothConstructDef, ClothLocalDef, WorldFrameDef, ForceDef], [GlobalCursor3dDef, RendererDef, InputsDef, TextDef], (cs, res) => {
        if (!cs.length)
            return;
        const cloth = cs[0];
        // cursor to cloth
        const cursorPos = res.globalCursor3d.cursor().world.position;
        const midpoint = V3.scale([cloth.clothConstruct.columns / 2, cloth.clothConstruct.rows / 2, 0], cloth.clothConstruct.distance);
        const clothPos = V3.add(midpoint, cloth.world.position, midpoint);
        // line from cursor to cloth
        line.renderable.enabled = true;
        const m = line.renderable.meshHandle.mesh;
        V3.copy(m.pos[0], cursorPos);
        V3.copy(m.pos[1], clothPos);
        res.renderer.renderer.stdPool.updateMeshVertices(line.renderable.meshHandle, m);
        // scale the force
        const delta = V3.sub(clothPos, cursorPos);
        const dist = V3.len(delta);
        V3.norm(delta, cloth.force);
        const strength = remapEase(dist, 4, 20, 0, 500, (p) => EASE_INQUAD(1.0 - p));
        res.text.upperText = `${strength.toFixed(2)}`;
        // apply the force?
        if (res.inputs.keyDowns["e"]) {
            V3.scale(cloth.force, strength, cloth.force);
        }
        else {
            V3.copy(cloth.force, [0, 0, 0]);
            if (RenderableDef.isOn(line)) {
                line.renderable.enabled = false;
            }
        }
    });
}
//# sourceMappingURL=game-cloth.js.map