// Inspiration, I think most effects r just dots: https://store.steampowered.com/app/1843760/Rogue_Tower/
//  change size, color, location over time
import { defineResourceWithInit } from "../ecs/em-helpers.js";
import { V, V3 } from "../matrix/sprig-matrix.js";
import { MAX_NUM_DOTS, dotDataPtr, initDots, } from "../render/pipelines/std-dots.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { assert, range } from "../utils/util.js";
export const DotsDef = defineResourceWithInit("dots", [RendererDef], ({ renderer }) => {
    renderer.renderer.submitPipelines([], [initDots]);
    const _dotGPUData = renderer.renderer.getCyResource(dotDataPtr);
    assert(_dotGPUData);
    const dotGPUData = _dotGPUData;
    let nextIdx = 0;
    function allocDots(len) {
        assert(0 < len);
        assert(nextIdx + len <= MAX_NUM_DOTS, `Too many dots! Increase MAX_NUM_DOTS:${MAX_NUM_DOTS}?`);
        const _idx = nextIdx;
        nextIdx += len;
        const data = range(len).map((_) => ({
            pos: V(0, 0, 0),
            color: V(1, 0, 0),
            size: 0.0,
        }));
        function queueUpdate() {
            dotGPUData.queueUpdates(data, _idx, 0, len);
        }
        function set(i, pos, color, size) {
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
});
//# sourceMappingURL=dots.js.map