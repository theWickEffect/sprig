import { Component, EM, Resource } from "../ecs/entity-manager.js";

export const TimeDef = EM.defineResource("time", () => ({
  time: 0,
  lastTime: 0,
  step: 0,
  dt: 0,
}));
export type Time = Resource<typeof TimeDef>;

export function tick(dt: number) {
  const time = EM.ensureResource(TimeDef);
  time.lastTime = time.time;
  time.time += dt;
  time.step += 1;
  time.dt = dt;
}
