// Inspiration, I think most effects r just dots: https://store.steampowered.com/app/1843760/Rogue_Tower/
//  change size, color, location over time

import { defineResourceWithInit } from "../ecs/em-helpers.js";
import { EM } from "../ecs/ecs.js";
import { Resources } from "../ecs/em-resources.js";
import { V, V3 } from "../matrix/sprig-matrix.js";
import { CyArray } from "../render/data-webgpu.js";
import {
  DotTS,
  MAX_NUM_DOTS,
  DotStruct,
  dotDataPtr,
  initDots,
} from "../render/pipelines/std-dots.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { assert, range } from "../utils/util.js";
import { T } from "../utils/util-no-import.js";

// TODO(@darzu): Implement freeAll + generations?
// TODO(@darzu): impl size change, color change, velocity, accel, lifetimes

export interface DotsAlloc {
  readonly data: DotTS[];
  readonly len: number;
  readonly _idx: number;

  queueUpdate: () => void;
  // TODO(@darzu): hmm could we use a TS type function to generate a set fn sig from a CyToTS ?
  set: (i: number, pos: V3.InputT, color: V3.InputT, size: number) => void;
}

export const DotsDef = defineResourceWithInit(
  "dots",
  [RendererDef],
  ({ renderer }) => {
    renderer.renderer.submitPipelines([], [initDots]);

    const _dotGPUData = renderer.renderer.getCyResource(dotDataPtr);
    assert(_dotGPUData);
    const dotGPUData: CyArray<typeof DotStruct.desc> = _dotGPUData;

    let nextIdx = 0;

    function allocDots(len: number): DotsAlloc {
      assert(0 < len);
      assert(
        nextIdx + len <= MAX_NUM_DOTS,
        `Too many dots! Increase MAX_NUM_DOTS:${MAX_NUM_DOTS}?`
      );
      const _idx = nextIdx;
      nextIdx += len;

      const data: DotTS[] = range(len).map((_) => ({
        pos: V(0, 0, 0),
        color: V(1, 0, 0),
        size: 0.0,
      }));

      function queueUpdate() {
        dotGPUData.queueUpdates(data, _idx, 0, len);
      }

      function set(i: number, pos: V3.InputT, color: V3.InputT, size: number) {
        V3.copy(data[i].pos, pos);
        V3.copy(data[i].color, color);
        data[i].size = size;
      }

      return {
        data,
        len,
        _idx,
        queueUpdate,
        set,
      };
    }

    return {
      allocDots,
    };
  }
);
