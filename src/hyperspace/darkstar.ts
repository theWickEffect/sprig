import { defineNetEntityHelper } from "../ecs/em-helpers.js";
import { EM } from "../ecs/ecs.js";
import { V3, V } from "../matrix/sprig-matrix.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { AllMeshesDef } from "../meshes/mesh-list.js";
import { PointLightDef } from "../render/lights.js";
import { FLAG_UNLIT, RenderDataStdDef } from "../render/pipelines/std-scene.js";
import { ColorDef } from "../color/color-ecs.js";
import { HyperspaceGameState, HSGameStateDef } from "./hyperspace-gamestate.js";
import { Phase } from "../ecs/sys-phase.js";

const DARKSTAR_SPEED = 1;

export const STAR1_COLOR = V(0.8, 0.3, 0.3);
export const STAR2_COLOR = V(0.3, 0.8, 0.6);

export const { DarkStarPropsDef, DarkStarLocalDef, createDarkStarNow } =
  defineNetEntityHelper({
    name: "darkStar",
    defaultProps: () => ({
      pos: V(0, 0, 0),
      color: V(0, 0, 0),
      orbiting: V(0, 0, 0),
      orbitalAxis: V(1, 0, 0),
    }),
    updateProps: (
      p,
      pos?: V3.InputT,
      color?: V3.InputT,
      orbiting?: V3.InputT,
      orbitalAxis?: V3.InputT
    ) => {
      if (pos) V3.copy(p.pos, pos);
      if (color) V3.copy(p.color, color);
      if (orbiting) V3.copy(p.orbiting, orbiting);
      if (orbitalAxis) V3.copy(p.orbitalAxis, orbitalAxis);
      return p;
    },
    serializeProps: (o, buf) => {
      buf.writeVec3(o.pos);
      buf.writeVec3(o.color);
    },
    deserializeProps: (o, buf) => {
      buf.readVec3(o.pos);
      buf.readVec3(o.color);
    },
    defaultLocal: () => ({}),
    dynamicComponents: [PositionDef],
    buildResources: [AllMeshesDef],
    build: (star, res) => {
      V3.copy(star.position, star.darkStarProps.pos);
      EM.set(star, RenderableConstructDef, res.allMeshes.ball.proto);
      EM.set(star, ScaleDef, V(100, 100, 100));
      EM.set(star, ColorDef, star.darkStarProps.color);
      EM.set(star, PointLightDef);
      star.pointLight.constant = 1.0;
      V3.copy(star.pointLight.ambient, star.color);
      V3.scale(star.pointLight.ambient, 0.2, star.pointLight.ambient);
      V3.copy(star.pointLight.diffuse, star.color);
      EM.whenEntityHas(star, RenderDataStdDef).then((star1) => {
        star1.renderDataStd.flags |= FLAG_UNLIT;
      });
      return star;
    },
  });

export function registerDarkstarSystems() {
  // TODO: this star will escape! must bring it closer to the orbit point sometimes
  EM.addSystem(
    "darkStarOrbit",
    Phase.GAME_WORLD,
    [DarkStarPropsDef, PositionDef, AuthorityDef],
    [MeDef, HSGameStateDef],
    (es, res) => {
      if (res.hsGameState.state !== HyperspaceGameState.PLAYING) {
        return;
      }
      for (let star of es) {
        if (star.authority.pid !== res.me.pid) continue;
        const toCenter = V3.sub(star.darkStarProps.orbiting, star.position);
        const distance = V3.len(toCenter);
        // TODO: revisit random orbits
        /*
        let arbitraryVector = V(1, 0, 0);
        let basis1 = vec3.cross(arbitraryVector, arbitraryVector, toCenter);
        if (vec3.length(basis1) < 0.001) {
          console.log("ended up with a tiny basis vector");
          arbitraryVector = V(0, 1, 0);
          basis1 = vec3.cross(arbitraryVector, arbitraryVector, toCenter);
        }
        const basis2 = vec3.cross(V3.tmp(), basis1, toCenter);
        vec3.normalize(basis1, basis1);
        vec3.normalize(basis2, basis2);
        vec3.scale(basis1, basis1, Math.random() - 0.5);
        vec3.scale(basis2, basis2, Math.random() - 0.5);
        console.log(
          `toCenter ${vec3Dbg(toCenter)}, basis1 ${vec3Dbg(
            basis1
          )}, basis2 ${vec3Dbg(basis2)}`
          );
        const movementDirection = vec3.add(basis1, basis1, basis2);
        vec3.normalize(movementDirection, movementDirection);
        */
        const movementDirection = V3.cross(
          toCenter,
          star.darkStarProps.orbitalAxis
        );
        V3.norm(movementDirection, movementDirection);
        V3.add(
          star.position,
          V3.scale(movementDirection, DARKSTAR_SPEED, movementDirection),
          star.position
        );

        V3.sub(star.darkStarProps.orbiting, star.position, toCenter);
        const newDistance = V3.len(toCenter);
        V3.norm(toCenter, toCenter);
        V3.scale(toCenter, newDistance - distance, toCenter);
        //console.log(`distance ${distance}, newDistance ${newDistance}`);
        //console.log(`distance ${distance}, newDistance ${newDistance}`);
        V3.add(star.position, toCenter, star.position);
      }
    }
  );
}
