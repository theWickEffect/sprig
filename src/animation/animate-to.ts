// TODO(@darzu): Move easing system elsewhere
// TODO(@darzu): share code with smoothing?

import { EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { PositionDef } from "../physics/transform.js";
import { TimeDef } from "../time/time.js";
import { EaseFn, EASE_LINEAR } from "../utils/util-ease.js";
import { Phase } from "../ecs/sys-phase.js";

export interface AnimateTo {
  // TODO(@darzu): support rotation, other properties?
  startPos: vec3;
  endPos: vec3;
  easeFn: EaseFn;
  durationMs: number;
  progressMs: number;
  // TODO(@darzu): pathFn
}

export const AnimateToDef = EM.defineComponent2(
  "animateTo",
  function (): AnimateTo {
    return {
      startPos: vec3.create(),
      endPos: vec3.create(),
      easeFn: EASE_LINEAR,
      durationMs: 1000,
      progressMs: 0,
    };
  },
  function (p, a?: Partial<AnimateTo>): AnimateTo {
    return a ? Object.assign(p, a) : p;
  }
);

EM.addEagerInit([AnimateToDef], [], [], () => {
  let delta = vec3.create();

  EM.addSystem(
    "animateTo",
    Phase.PHYSICS_MOTION,
    [AnimateToDef, PositionDef],
    [TimeDef],
    (cs, res) => {
      let toRemove: number[] = [];

      // advance the animation
      for (let c of cs) {
        c.animateTo.progressMs += res.time.dt;

        const percentTime = c.animateTo.progressMs / c.animateTo.durationMs;

        if (percentTime < 0) {
          // outside the time bounds, we're in a start delay
          vec3.copy(c.position, c.animateTo.startPos);
          continue;
        }

        if (percentTime >= 1.0) {
          toRemove.push(c.id);
          vec3.copy(c.position, c.animateTo.endPos);
          continue;
        }

        const percentPath = c.animateTo.easeFn(percentTime);

        vec3.sub(c.animateTo.endPos, c.animateTo.startPos, delta);

        // TODO(@darzu): support other (non-linear) paths
        vec3.scale(delta, percentPath, delta);

        vec3.add(c.animateTo.startPos, delta, c.position);
      }

      // clean up finished
      for (let id of toRemove) {
        EM.removeComponent(id, AnimateToDef);
      }
    }
  );
});
