import { CameraComputedDef } from "../camera/camera.js";
import { AlphaDef, ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { EM } from "../ecs/ecs.js";
import { AllMeshesDef, UnitCubeMesh } from "../meshes/mesh-list.js";
import { V3, V } from "../matrix/sprig-matrix.js";
import { MouseDragDef } from "../input/inputs.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { cloneMesh } from "../meshes/mesh.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { assert } from "../utils/util.js";
import { screenPosToWorldPos } from "../utils/utils-game.js";
import { UICursorDef } from "./game-font.js";
import { Phase } from "../ecs/sys-phase.js";
// adornments are: entities that are parented to an entity's mesh parts
//    [ ] track changes via version number on the mesh data
export const WidgetDef = EM.defineComponent("widget", () => true);
export const WidgetLayerDef = EM.defineResource("widgets", createWidgetLayer);
function createWidgetLayer() {
    return {
        selected: new Set(),
        hover: new Set(),
        cursor: undefined,
        moved: new Set(),
    };
}
// TODO(@darzu): FOR INIT STUFF,
//    have a registration table where an init function can specify which resources and systems it provides
//    then other code can require a certain resource / system, then it calls the right init function
// TODO(@darzu): IMPL
EM.addLazyInit([AllMeshesDef], [WidgetLayerDef], initWidgets);
// EM.addConstraint([WidgetLayerDef, "requires", "updateWidgets"]);
// // TODO(@darzu): instead of having these explit dependencies, maybe we should use an
// //  existance dependency disjoint set w/ the assumption that all constraints create
// //  an existance dependency
// EM.addConstraint([WidgetLayerDef, "requires", "colorWidgets"]);
// EM.addConstraint([WidgetLayerDef, "requires", "updateDragbox"]);
// EM.addConstraint(["colorWidgets", "after", "updateWidgets"]);
// EM.addConstraint(["updateDragbox", "before", "updateWidgets"]);
async function initDragBox() {
    const { allMeshes } = await EM.whenResources(AllMeshesDef);
    const unitCubeMesh = await UnitCubeMesh.gameMesh();
    // create dragbox
    // TODO(@darzu): dragbox should be part of some 2d gui abstraction thing
    const dragBox = EM.mk();
    const dragBoxMesh = cloneMesh(unitCubeMesh.mesh);
    EM.set(dragBox, AlphaDef, 0.2);
    EM.set(dragBox, RenderableConstructDef, dragBoxMesh);
    EM.set(dragBox, PositionDef, V(0, 0, -0.2));
    EM.set(dragBox, ScaleDef, V(1, 1, 1));
    EM.set(dragBox, ColorDef, V(0.0, 120 / 255, 209 / 255));
    EM.set(dragBox, ColliderDef, {
        shape: "AABB",
        solid: false,
        aabb: unitCubeMesh.aabb,
    });
    EM.addSystem("updateDragbox", Phase.GAME_WORLD, null, [MouseDragDef, CameraComputedDef, WidgetLayerDef], (_, { mousedrag, cameraComputed, widgets }) => {
        // update dragbox
        if (widgets.cursor || mousedrag.isDragEnd) {
            // hide dragbox
            V3.copy(dragBox.position, [0, 0, -1]);
            V3.copy(dragBox.scale, [0, 0, 0]);
        }
        else if (mousedrag.isDragging) {
            // place dragbox
            const min = screenPosToWorldPos(V3.tmp(), mousedrag.dragMin, cameraComputed);
            min[2] = 0.1;
            const max = screenPosToWorldPos(V3.tmp(), mousedrag.dragMax, cameraComputed);
            max[2] = 1;
            const size = V3.sub(max, min);
            V3.copy(dragBox.position, min);
            V3.copy(dragBox.scale, size);
        }
    });
    // TODO(@darzu): store this on a resource?
    return dragBox;
}
async function initWidgets({ allMeshes }) {
    EM.addResource(WidgetLayerDef);
    // TODO(@darzu): move to resource?
    const dragBox = await initDragBox();
    // TODO(@darzu):
    // TODO(@darzu): refactor. Also have undo-stack
    EM.addSystem("updateWidgets", Phase.GAME_WORLD, null, [
        WidgetLayerDef,
        PhysicsResultsDef,
        MouseDragDef,
        CameraComputedDef,
        UICursorDef,
    ], (_, { widgets, physicsResults, mousedrag, cameraComputed, uiCursor: { cursor: { id: cursorId }, }, }) => {
        const { selected, hover, moved } = widgets;
        moved.clear();
        // update world drag
        let worldDrag = V3.mk();
        if (mousedrag.isDragging) {
            const start = screenPosToWorldPos(V3.tmp(), mousedrag.dragLastEnd, cameraComputed);
            start[2] = 0;
            const end = screenPosToWorldPos(V3.tmp(), mousedrag.dragEnd, cameraComputed);
            end[2] = 0;
            V3.sub(end, start, worldDrag);
        }
        // update widget states
        if (mousedrag.isDragging) {
            // de-hover
            hover.clear();
            if (widgets.cursor) {
                // drag selected
                // TODO(@darzu): check that cursorGlyph is vert and selected
                const isCursorSelected = selected.has(widgets.cursor);
                if (!isCursorSelected) {
                    selected.clear();
                    selected.add(widgets.cursor);
                }
                for (let wi of selected.values()) {
                    const w = EM.findEntity(wi, [PositionDef]);
                    assert(w);
                    // TODO(@darzu): think about world positions and parenting..
                    // TODO(@darzu): think about world positions and parenting..
                    V3.add(w.position, worldDrag, w.position);
                    moved.add(wi);
                }
            }
            else {
                // deselect
                selected.clear();
                // find hover
                const hits = physicsResults.collidesWith.get(dragBox.id) ?? [];
                for (let hid of hits) {
                    const w = EM.findEntity(hid, [WidgetDef]);
                    if (!w)
                        continue;
                    hover.add(w.id);
                }
            }
        }
        else if (mousedrag.isDragEnd) {
            if (!widgets.cursor) {
                // select box done
                selected.clear();
                hover.forEach((wi) => selected.add(wi));
                hover.clear();
            }
            else {
                // drag selected done
                // TODO(@darzu): IMPL
            }
        }
        // non dragging
        if (!mousedrag.isDragging && !mousedrag.isDragEnd) {
            // unselect cursor glpyh
            widgets.cursor = undefined;
            // find under-cursor glyph
            const hits = physicsResults.collidesWith.get(cursorId) ?? [];
            // console.dir(hits);
            for (let hid of hits) {
                const g = EM.findEntity(hid, [WidgetDef, ColorDef]);
                if (g) {
                    // TODO(@darzu): better glyph color handling
                    V3.copy(g.color, ENDESGA16.red);
                    widgets.cursor = g.id;
                    break;
                }
            }
        }
    });
    EM.addSystem("colorWidgets", Phase.GAME_WORLD, [WidgetDef, ColorDef], [WidgetLayerDef], (ws, { widgets }) => {
        // update glyph colors based on state
        // TODO(@darzu): move to widgets.ts
        for (let g of ws) {
            V3.copy(g.color, ENDESGA16.lightBlue);
        }
        for (let wi of widgets.hover) {
            const g = EM.findEntity(wi, [ColorDef]);
            V3.copy(g.color, ENDESGA16.yellow);
        }
        for (let wi of widgets.selected) {
            const g = EM.findEntity(wi, [ColorDef]);
            V3.copy(g.color, ENDESGA16.lightGreen);
        }
        if (widgets.cursor) {
            const g = EM.findEntity(widgets.cursor, [ColorDef]);
            V3.copy(g.color, ENDESGA16.red);
        }
    });
}
//# sourceMappingURL=widgets.js.map