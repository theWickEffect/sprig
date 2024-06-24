import { Hold, } from "./joel-game.js";


export module HoldMod {
    export function explode(hold: Hold){

    }
    export function shake(hold: Hold){
        hold.entity.position[0] += .01 * Math.random() - .005;
        hold.entity.position[1] += .01 * Math.random() - .005;
        hold.entity.position[2] += .01 * Math.random() - .005;
    }
}