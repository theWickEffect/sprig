import { ColorDef } from "../color/color-ecs.js";
import { EM } from "../ecs/ecs.js";
import { NonupdatableComponentDef } from "../ecs/em-components.js";
import { Entity, EntityW } from "../ecs/em-entities.js";
import { V, V3 } from "../matrix/sprig-matrix.js";
import { Mesh, createEmptyMesh } from "../meshes/mesh.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { Renderable, RenderableConstructDef, RenderableDef } from "../render/renderer-ecs.js";
import { J3 } from "./joel-game.js";


export module PowerMeter{
    export interface PM{
        border: EntityW<[typeof PositionDef]>;
        power: EntityW<[typeof PositionDef, typeof ColorDef,NonupdatableComponentDef<"renderable", Renderable, [r: Renderable], false>], number>;
        powerMesh: Mesh;
        minHt: number;
        maxHt: number;
    }
    export async function mk():Promise<PM>{
        const height = 8;
        const width = 1;
        const margin = .1;
        const borderRaw = createEmptyMesh("border");
        borderRaw.surfaceIds = [1];
        const borderMesh = borderRaw as Mesh;
        borderMesh.usesProvoking = true;
        borderMesh.pos.push(
            V(-.5*width,0,-.5*height),
            V(.5*width,0,-.5*height),
            V(.5*width,0,.5*height),
            V(-.5*width,0,.5*height)
        )
        borderMesh.quad.push(V(0,1,2,3));
        borderMesh.colors.push(V(0,0,0));
        const border = EM.mk();
        EM.set(border, RenderableConstructDef, borderMesh);
        EM.set(border, PositionDef, V(0,0,0));
        const powerRaw = createEmptyMesh("power");
        powerRaw.surfaceIds = [1];
        const powerMesh = powerRaw as Mesh;
        powerMesh.usesProvoking = true;
        powerMesh.pos.push(
            V(-.5*width+margin,-0.01,-.5*height+margin),
            V(.5*width-margin,-0.01,-.5*height+margin),
            V(.5*width-margin,-0.01,-.5*height +.2),
            V(-.5*width+margin,-0.01,-.5*height+.2)
        )
        powerMesh.quad.push(V(0,1,2,3));
        powerMesh.colors.push(V(0,1,0));
        const power = EM.mk();
        EM.set(power, RenderableConstructDef, powerMesh);
        EM.set(power, PositionDef, border.position);
        EM.set(power,ScaleDef,V(1,1,1))
        EM.set(power, ColorDef, V(0,1,0));
        let finalPower = await EM.whenEntityHas(power,RenderableDef,ColorDef,PositionDef);
        const pm: PM ={
            border,
            power: finalPower,
            powerMesh,
            minHt: height * -.5 + margin,
            maxHt: height * .5 - margin,
        }
        return pm;
    }
    export function updatePos(cameraPos:V3, meter: PM){
        J3.copy(meter.border.position, cameraPos);
        meter.border.position[0]+=8;
        meter.border.position[1] += 8;
        J3.copy(meter.power.position, cameraPos);
        meter.power.position[0]+=8;
        meter.power.position[1] += 8;
        // console.log(meter.power.position);
    }
    export function updatePower(power: number, meter: PM, powerScale: number = .035, maxPower: number = 200){
        const meterLevel = Math.min(meter.minHt + power * powerScale, meter.maxHt);
        meter.powerMesh.pos[2][2] = meterLevel;
        meter.powerMesh.pos[3][2] = meterLevel;
        meter.power.renderable.meshHandle.pool.updateMeshVertices(meter.power.renderable.meshHandle,meter.powerMesh);
        
        // let poszTemp = meter.power.position[2];
        // meter.power.position[2] = 0;
        // meter.power.scale[2] = power;
        // meter.power.position[2] = poszTemp;
        const qPow = maxPower *.25;
        const halfPow = maxPower/2;
        const tqPow  = maxPower * .75;
        // console.log(power);
        if(power<=halfPow){
            meter.power.color[0] = 0;
            meter.power.color[1] = 1;
        }
        else if(power<=tqPow){
            meter.power.color[0] = power-halfPow/qPow;
            meter.power.color[1] = 1;
        }
        else{
            meter.power.color[0] = 1;
            meter.power.color[1] = Math.min(1,1-(power-tqPow)/qPow);
        }
    }
}