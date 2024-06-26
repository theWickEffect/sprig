import { EM } from "../ecs/ecs.js";
import { Phase } from "../ecs/sys-phase.js";
import { ScaleDef } from "../physics/transform.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { TimeDef } from "../time/time.js";
export const BubbleDef = EM.defineNonupdatableComponent("bubble", () => true);
export const OxygenDef = EM.defineResource("bubbleOxygenRemaining", (oxygen) => ({
    oxygen: oxygen ?? 0,
}));
// amount of oxygen / cubic meter
const OXYGEN_DENSITY = 0.001;
// oxygen consumed per ms
const OXYGEN_CONSUMPTION_RATE = 1 / 1000;
EM.addEagerInit([], [OxygenDef], [], () => {
    EM.addSystem("updateBubbleOxygen", Phase.POST_GAME_PLAYERS, [BubbleDef], [OxygenDef, RendererDef, TimeDef], (es, res) => {
        // other systems will use this to determine that the game has ended, or add to it when oxygen is delivered
        res.bubbleOxygenRemaining.oxygen -= OXYGEN_CONSUMPTION_RATE * res.time.dt;
        const bubbleRadius = Math.pow(res.bubbleOxygenRemaining.oxygen / OXYGEN_DENSITY, 1 / 3);
        // console.log(
        //   `oxygen remaining ${res.bubbleOxygenRemaining.oxygen}, radius ${bubbleRadius}`
        // );
        res.renderer.renderer.updateScene({
            bubbleRadius,
        });
        for (let e of es) {
            EM.set(e, ScaleDef, [bubbleRadius, bubbleRadius, bubbleRadius]);
        }
    });
});
//# sourceMappingURL=oxygen.js.map