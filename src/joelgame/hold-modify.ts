import { ColorDef } from "../color/color-ecs.js";
import { EM } from "../ecs/ecs.js";
import { V, V3 } from "../matrix/sprig-matrix.js";
import { TetraMesh } from "../meshes/mesh-list.js";
import { PositionDef, RotationDef, ScaleDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { GuyData, Hold, J3, Point, } from "./joel-game.js";


export module HoldMod {
    export function mkExplodeArr(guy: GuyData): Point[]{
        const startPoint = guy.hold.entity.position;
        const force = 1.1;
        const scale = .015;
        const explodeObjectCount = 100;
        const explodeArr: Point[] = [];
        
        for(let i=0;i<explodeObjectCount;i++){
            const piece = EM.mk();
            EM.set(piece, RenderableConstructDef, TetraMesh);
            EM.set(piece, ColorDef, getColor());
            EM.set(piece, ScaleDef, V(Math.random() * scale, Math.random() * scale, Math.random() * scale));
            EM.set(piece, RotationDef, V(Math.random()*6,Math.random()*6,Math.random()*6,Math.random()*6,));
            EM.set(piece, PositionDef, J3.clone(startPoint))
            const point: Point = {
                object: piece,
                position: piece.position,
                prevPosition: V(startPoint[0] - .5 * force + Math.random() * force,
                    startPoint[1] - .5 * force + Math.random() * force,
                    startPoint[2] - .5 * force + Math.random() * force),
                fixed: false
            };
            explodeArr.push(point);

        }
        return explodeArr;

        function getColor():V3{
            if(Math.random()<.1) return V(0,0,0);
            return V(.5 + Math.random() * .5, Math.random()*.5, 0);
        }
    }
    export function updateExplodeArr(explodeArr: Point[], gravity: number){
        for(let point of explodeArr){
            const movementVec = J3.sub(point.position, point.prevPosition);
            J3.add(point.position, movementVec, false);
            J3.add(point.prevPosition, movementVec, false);
            point.position[2] -= gravity;
          }
    }
    export function shake(guy: GuyData, ogPos: V3){
        guy.hold.entity.position[0] = ogPos[0] + .15 * Math.random() - .075;
        guy.hold.entity.position[1] = ogPos[1] + .15 * Math.random() - .075;
        guy.hold.entity.position[2] = ogPos[2] + .15 * Math.random() - .075;
        J3.copy(guy.holdHand.position, guy.hold.entity.position);
        guy.holdHand.position[1] -= 2.2;
        console.log(ogPos);
        // console.log("shaking");
    }
}