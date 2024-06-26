import { EM } from "../ecs/ecs.js";
import { Component } from "../ecs/em-components.js";
import { getText } from "../web/webget.js";

const DEFAULT_SHADER_PATH = "shaders/";

export const ShaderPaths = [
  "std-mesh",
  "xp-circle-textured",
  "std-rigged",
  "std-ocean",
  "std-gerstner",
  "std-outline",
  "std-blur",
  "std-post",
  "xp-boid-render",
  "xp-boid-update",
  "std-jump-flood",
  "xp-cloth-update",
  "std-screen-quad-vert",
  "std-rand",
  "std-stars",
  "xp-alpha",
  "std-grass",
  "std-sky",
  "std-deferred",
  "xp-bubble",
  "std-dots",
  "std-grid",
  "std-helpers",
  "std-line",
  "std-painterly-prepass",
  "std-painterly-jfa",
  "std-painterly-main",
  "std-painterly-deferred",
  "std-particle-render",
  "std-particle-update",
] as const;

export type ShaderName = (typeof ShaderPaths)[number];

export interface Shader {
  code: string;
}

export type ShaderSet = { [P in ShaderName]: Shader };

export const ShadersDef = EM.defineResource(
  "shaders",
  (shaders: ShaderSet) => shaders
);
export type Shaders = Component<typeof ShadersDef>;

async function loadShaders(): Promise<ShaderSet> {
  const codePromises = ShaderPaths.map((name) =>
    getText(`${DEFAULT_SHADER_PATH}${name}.wgsl`)
  );
  const codes = await Promise.all(codePromises);

  const set: Partial<ShaderSet> = {};

  for (let i = 0; i < ShaderPaths.length; i++) {
    set[ShaderPaths[i]] = {
      code: codes[i],
    };
  }

  // TODO(@darzu): should this submit to webgpu for parsing?

  return set as ShaderSet;
}

EM.addLazyInit([], [ShadersDef], async () => {
  EM.addResource(ShadersDef, await loadShaders());
});
