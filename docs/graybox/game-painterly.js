import { CameraDef } from "../camera/camera.js";
import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16, seqEndesga16 } from "../color/palettes.js";
import { DevConsoleDef } from "../debug/console.js";
import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { V, quat, tmpStack, V3, mat4 } from "../matrix/sprig-matrix.js";
import { BallMesh, CubeMesh, TetraMesh } from "../meshes/mesh-list.js";
import { cloneMesh, scaleMesh, transformMesh, } from "../meshes/mesh.js";
import { mkCubeMesh } from "../meshes/primatives.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { GraphicsSettingsDef } from "../render/graphics-settings.js";
import { DEFAULT_MASK, PAINTERLY_JFA_PRE_PASS_MASK, } from "../render/pipeline-masks.js";
import { createGridComposePipelines } from "../render/pipelines/std-compose.js";
import { FLAG_BACKFACE_CULL, PainterlyUniDef, PainterlyUniStruct, painterlyLineMeshPoolPtr, painterlyLinePrepass, painterlyLineMainPass, painterlyPointPrepass, painterlyPointMainPass, painterlyJfa, painterlyDeferredPipe, painterlyPointMeshPoolPtr, } from "../render/pipelines/std-painterly.js";
import { stdMeshPipe } from "../render/pipelines/std-mesh.js";
import { meshPoolPtr, } from "../render/pipelines/std-scene.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
import { align } from "../utils/math.js";
import { PI } from "../utils/util-no-import.js";
import { range, zip } from "../utils/util.js";
import { computeTriangleNormal, randVec3OfLen } from "../utils/utils-3d.js";
import { DotsDef } from "./dots.js";
import { GlitchDef } from "./glitch.js";
import { createSun, initGhost } from "./graybox-helpers.js";
import { testingLSys } from "./l-systems.js";
import { createObj, defineObj } from "../ecs/em-objects.js";
// const dbgGrid = [
//   [xpPointTex, xpPointTex],
//   [xpPointTex, xpPointTex],
// ];
const dbgGrid = [
    [painterlyJfa._inputMaskTex],
    // [pointsJFA._inputMaskTex, pointsJFA._uvMaskTex],
    // [pointsJFA.voronoiTex, pointsJFA.sdfTex],
    // [pointsJFA.voronoiTex],
];
let dbgGridCompose = createGridComposePipelines(dbgGrid);
// let dbgGridCompose = createGridComposePipelines(pointsJFA._debugGrid);
export async function initPainterlyGame() {
    EM.addSystem("painterlyPipelines", Phase.GAME_WORLD, [], [RendererDef, GraphicsSettingsDef, DevConsoleDef], (_, res) => {
        // renderer
        res.renderer.pipelines = [];
        // TODO(@darzu): OUTLINE?
        res.renderer.pipelines.push(...shadowPipelines, stdMeshPipe, // TODO(@darzu): we should have stdMesh surf + depth prepass
        painterlyLinePrepass, painterlyPointPrepass, painterlyPointMainPass, painterlyLineMainPass, ...painterlyJfa.allPipes(), painterlyDeferredPipe);
        res.renderer.pipelines.push(...(res.dev.showConsole ? dbgGridCompose : []));
    });
    const { camera } = await EM.whenResources(CameraDef);
    // camera
    camera.fov = Math.PI * 0.5;
    camera.viewDist = 10000;
    V3.set(-200, -200, -200, camera.maxWorldAABB.min);
    V3.set(+200, +200, +200, camera.maxWorldAABB.max);
    // TODO(@darzu): WORK AROUND: For whatever reason this particular init order and this obj are
    //  needed to avoid a bug in canary (122.0.6255.1) not present in retail (120.0.6099.234)
    //  more on branch: white-screen-bug-repro
    // TODO(@darzu): if you're here from the future, try removing this workaround (this obj, collapse the
    //  whenResources calls, remove the unnecessary addEagerInit)
    const __bugWorkAround = createObj([RenderableConstructDef], [
        [CubeMesh, false],
    ]);
    const res = await EM.whenResources(RendererDef, DotsDef);
    // sun
    createSun();
    // line exp
    const lineBox = createObj([RenderableConstructDef, PositionDef, ColorDef, ScaleDef], {
        renderableConstruct: [
            mkCubeMesh(),
            true,
            undefined,
            PAINTERLY_JFA_PRE_PASS_MASK | DEFAULT_MASK,
            painterlyLineMeshPoolPtr,
        ],
        position: [240, 40, 40],
        scale: [10, 10, 10],
        color: ENDESGA16.lightBrown,
    });
    // EM.set(box, GlitchDef);
    EM.whenResources(BallMesh.def).then((ball) => {
        const mesh = cloneMesh(ball.mesh_ball.mesh);
        mesh.lines = range(9).map((_) => V(0, 1));
        const e = createObj([RenderableConstructDef, PositionDef, ColorDef, ScaleDef], {
            renderableConstruct: [
                mesh,
                true,
                undefined,
                PAINTERLY_JFA_PRE_PASS_MASK | DEFAULT_MASK,
                painterlyLineMeshPoolPtr,
            ],
            position: [240, 80, 40],
            scale: [10, 10, 10],
            color: ENDESGA16.darkBrown,
        });
        EM.set(e, GlitchDef);
    });
    testingLSys();
    function distributePointsOnTriangleOrQuad(pos, ind, ptsPerArea, quad) {
        const points = [];
        // TODO(@darzu): use blue noise!
        const p0 = pos[ind[0]];
        const p1 = pos[ind[1]];
        const p2 = quad ? pos[ind[3]] : pos[ind[2]];
        // const p2 = pos[ind[2]];
        const u = V3.sub(p2, p0);
        const v = V3.sub(p1, p0);
        const area = (quad ? 1 : 0.5) * V3.len(V3.cross(u, v));
        const num = align(Math.ceil(area * ptsPerArea), 2);
        // console.log(`area: ${area}, num: ${num}`);
        const _stk = tmpStack();
        for (let i = 0; i < num; i++) {
            // const uLen = V3.len(u);
            // const vLen = V3.len(v);
            let uLen = Math.random();
            let vLen = Math.random();
            if (!quad)
                while (uLen + vLen > 1.0) {
                    // TODO(@darzu): reflect accross u = -v + 1
                    uLen = Math.random();
                    vLen = Math.random();
                }
            const randU = V3.scale(u, uLen);
            const randV = V3.scale(v, vLen);
            const newP = V3.add(p0, V3.add(randU, randV), V3.mk());
            points.push(newP);
            _stk.popAndRemark();
        }
        _stk.pop();
        return points;
    }
    function morphMeshIntoPts(m, ptsPerArea) {
        scaleMesh(m, 0.99);
        // TODO(@darzu): use blue noise for even-ish distribution?
        // console.log("MORPH: " + m.dbgName);
        let newPoints = [];
        let posNormals = [];
        let _stk = tmpStack();
        for (let t of [...m.tri, ...m.quad]) {
            const norm = computeTriangleNormal(m.pos[t[0]], m.pos[t[1]], m.pos[t[2]], V3.mk());
            // console.log(vec3Dbg(norm));
            const isQuad = t.length === 4;
            const ps = distributePointsOnTriangleOrQuad(m.pos, t, ptsPerArea, isQuad);
            ps.forEach((p) => newPoints.push(p));
            ps.forEach((_) => {
                const n = V3.clone(norm);
                V3.add(n, randVec3OfLen(0.05), n);
                V3.norm(n, n);
                posNormals.push(n);
                _stk.popAndRemark();
            }); // TODO(@darzu): okay to share normals like this?
            _stk.popAndRemark();
        }
        _stk.pop();
        m.pos = newPoints;
        m.tri = [];
        m.quad = [];
        m.colors = [];
        m.surfaceIds = [];
        m.lines = undefined;
        m.posNormals = posNormals;
        // console.dir(m);
    }
    // point exp
    {
        function makePlaneMesh(x1, x2, y1, y2) {
            const res = {
                pos: [V(x1, y1, 0), V(x2, y1, 0), V(x2, y2, 0), V(x1, y2, 0)],
                tri: [],
                quad: [
                    V(0, 1, 2, 3), // top
                ],
                colors: [V3.mk()],
                surfaceIds: [1],
                usesProvoking: true,
                dbgName: "plane",
            };
            return res;
        }
        EM.whenResources(BallMesh.def, TetraMesh.def, CubeMesh.def).then((res) => {
            const size = 512;
            const ptsPerArea = 1 / 32.0;
            // const ptsPerPlane = size * size * ptsPerArea;
            const xyPlane = makePlaneMesh(0, size, 0, size);
            const xzPlane = makePlaneMesh(0, size, 0, size);
            transformMesh(xzPlane, mat4.mul(mat4.fromYaw(PI / 2), mat4.fromRoll(-PI / 2)));
            const yzPlane = makePlaneMesh(0, size, 0, size);
            transformMesh(yzPlane, mat4.mul(mat4.fromYaw(-PI / 2), mat4.fromPitch(PI / 2)));
            const L = 0.1;
            // const planeColors: V3.InputT[] = [
            //   [L, L, 0],
            //   [L, 0, L],
            //   [0, L, L],
            // ];
            const planeColors = [
                ENDESGA16.lightGray,
                ENDESGA16.lightGray,
                ENDESGA16.lightGray,
            ];
            let planeObjId = 200;
            for (let [plane, color] of zip([xyPlane, xzPlane, yzPlane], planeColors)) {
                let planePts = cloneMesh(plane);
                morphMeshIntoPts(planePts, ptsPerArea);
                createObj([
                    RenderableConstructDef,
                    PainterlyUniDef,
                    PositionDef,
                    ColorDef,
                ], {
                    renderableConstruct: [
                        planePts,
                        true,
                        undefined,
                        undefined,
                        painterlyPointMeshPoolPtr,
                        undefined,
                        undefined,
                        planeObjId,
                    ],
                    painterlyUni: PainterlyUniStruct.fromPartial({
                        flags: FLAG_BACKFACE_CULL,
                        id: planeObjId,
                    }),
                    position: undefined,
                    color,
                });
                createObj([RenderableConstructDef, PositionDef, ColorDef], {
                    renderableConstruct: [
                        plane,
                        true,
                        undefined,
                        undefined,
                        meshPoolPtr,
                        undefined,
                        undefined,
                        planeObjId,
                    ],
                    position: undefined,
                    color,
                });
            }
            // const ptMesh = cloneMesh(ball.mesh_ball.mesh);
            // // console.log(`ball tris: ${ptMesh.tri.length + ptMesh.quad.length * 2}`);
            // morphMeshIntoPts(ptMesh, 16);
            let objMeshes = [
                res.mesh_ball,
                res.mesh_tetra,
                res.mesh_cube,
                res.mesh_ball,
            ];
            let balLColors = [
                ENDESGA16.orange,
                ENDESGA16.blue,
                ENDESGA16.darkRed,
                ENDESGA16.darkGreen,
            ];
            let scales = [
                [10, 10, 10],
                [10, 10, 20],
                [15, 15, 15],
                [10, 10, 10],
            ];
            for (let i = 0; i < 4; i++) {
                const objId = 100 + i;
                // const color = seqEndesga16();
                let pos = [40 * (i + 1), 40 * (i + 1), 40];
                const color = balLColors[i];
                createObj([
                    RenderableConstructDef,
                    PositionDef,
                    ColorDef,
                    ScaleDef,
                    RotationDef,
                ], {
                    renderableConstruct: [
                        objMeshes[i].proto,
                        true,
                        undefined,
                        undefined,
                        meshPoolPtr,
                        undefined,
                        undefined,
                        objId,
                    ],
                    // position: [-40, 0, 40],
                    position: pos,
                    scale: scales[i],
                    rotation: quat.fromYawPitchRoll(i * PI * 0.123),
                    color,
                });
                const ptMesh = cloneMesh(objMeshes[i].mesh);
                morphMeshIntoPts(ptMesh, 16);
                createObj([
                    RenderableConstructDef,
                    PainterlyUniDef,
                    PositionDef,
                    ColorDef,
                    ScaleDef,
                    RotationDef,
                ], {
                    renderableConstruct: [
                        ptMesh,
                        true,
                        undefined,
                        undefined,
                        painterlyPointMeshPoolPtr,
                        undefined,
                        undefined,
                        objId,
                    ],
                    painterlyUni: {
                        flags: FLAG_BACKFACE_CULL,
                        id: objId,
                    },
                    // position: [-40, 0, 40],
                    position: pos,
                    scale: scales[i],
                    rotation: quat.fromYawPitchRoll(i * PI * 0.123),
                    color,
                });
            }
            // EM.set(e, GlitchDef);
        });
    }
    // bouncing balls
    // createBouncingBalls();
    // dbg ghost
    initGhost();
}
async function createBouncingBalls() {
    const ballObj = defineObj({
        name: "ball",
        components: [
            PositionDef,
            RotationDef,
            // AngularVelocityDef,
            ColorDef,
            RenderableConstructDef,
            ScaleDef,
        ],
    });
    const { mesh_ball, renderer } = await EM.whenResources(BallMesh.def, RendererDef);
    const ballM1 = mesh_ball.proto;
    const _ballM2 = cloneMesh(ballM1.mesh);
    const ballM2 = renderer.renderer.stdPool.addMesh(_ballM2);
    const NUM = 10;
    // const RADIUS = 200;
    for (let i = 0; i < NUM; i++) {
        const t = i * ((PI * 2) / NUM);
        // const s = Math.random() * 50 + 5;
        const s = 25;
        // const ring = Math.floor(i / NUM);
        // const r = 100 + s * 5; // * Math.pow(5, ring);
        const r = 400;
        const x = Math.cos(t) * r;
        const y = Math.sin(t) * r;
        const glitch = i % 2 === 0;
        const ball = createObj(ballObj, {
            args: {
                scale: [s, s, s],
                position: [x, y, 0],
                renderableConstruct: [glitch ? ballM2 : ballM1],
                rotation: undefined,
                // angularVelocity: V3.scale(randNormalVec3(), 0.001),
                color: seqEndesga16(),
            },
        });
        if (glitch)
            EM.set(ball, GlitchDef);
    }
    EM.addSystem("bounceBall", Phase.GAME_WORLD, [ballObj.props, PositionDef], [TimeDef], (es, res) => {
        for (let e of es) {
            const t = Math.atan2(e.position[1], e.position[0]);
            e.position[2] = 100 * Math.sin(t * 7.0 + res.time.time * 0.001);
        }
    });
}
//# sourceMappingURL=game-painterly.js.map