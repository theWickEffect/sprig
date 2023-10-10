import { Component, EM } from "../ecs/entity-manager.js";
import { vec2, vec3, vec4, quat, mat4, V } from "../matrix/sprig-matrix.js";
import { AABB } from "./aabb.js";

export type Layer = number; // a bit mask

export const DefaultLayer: Layer = 0b0000000000000001;
export const AllLayer: Layer = 0b1111111111111111;
export const NoLayer: Layer = 0b0000000000000000;

export type ColliderShape =
  | "Empty"
  | "AABB"
  | "Box"
  | "Sphere"
  | "Capsule"
  | "Multi";

interface ColliderBase {
  shape: ColliderShape;
  // TODO(@darzu): rename "solid" to "non-intersection?" or move this to physics systems options somewhere
  solid: boolean;
  myLayer?: Layer;
  targetLayer?: Layer;
}

export interface EmptyCollider extends ColliderBase {
  shape: "Empty";
}

export interface AABBCollider extends ColliderBase {
  shape: "AABB";
  aabb: AABB;
}

export interface BoxCollider extends ColliderBase {
  shape: "Box";
  center: vec3;
  halfsize: vec3;
}

export interface SphereCollider extends ColliderBase {
  shape: "Sphere";
  center: vec3;
  radius: number;
}

export interface CapsuleCollider extends ColliderBase {
  shape: "Capsule";
  center: vec3;
  height: number;
  radius: number;
  axis: 0 | 1 | 2;
}

export interface MultiCollider extends ColliderBase {
  shape: "Multi";
  children: Collider[];
}

export type Collider =
  | EmptyCollider
  | AABBCollider
  | BoxCollider
  | SphereCollider
  | CapsuleCollider
  | MultiCollider;

// TODO(@darzu): ensure we support swapping colliders?
export const ColliderDef = EM.defineNonupdatableComponent(
  "collider",
  (c?: Collider) => {
    return (
      c ??
      ({
        shape: "Empty",
        solid: false,
      } as Collider)
    );
  }
);
const __COLLIDER_ASSERT: Component<typeof ColliderDef> extends Collider
  ? true
  : false = true;
