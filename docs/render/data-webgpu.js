import { align } from "../utils/math.js";
import { assert, assertDbg } from "../utils/util.js";
import { texTypeIsStencil, texTypeToBytes, } from "./gpu-struct.js";
import { isRenderPipelinePtr, } from "./gpu-registry.js";
import { V4 } from "../matrix/sprig-matrix.js";
import { GPUBufferUsage } from "./webgpu-hacks.js";
import { PERF_DBG_GPU, PERF_DBG_GPU_BLAME } from "../flags.js";
import { dbgAddBlame } from "../utils/util-no-import.js";
export function isRenderPipeline(p) {
    return isRenderPipelinePtr(p.ptr);
}
export let _gpuQueueBufferWriteBytes = 0;
// TODO(@darzu): just take a ptr?
export function createCySingleton(device, name, struct, usage, initData) {
    assert(struct.opts?.isUniform, "CyOne struct must be created with isUniform");
    const _buf = device.createBuffer({
        label: `${name}_singleton`,
        size: struct.size,
        // TODO(@darzu): parameterize these
        // TODO(@darzu): be precise
        usage,
        mappedAtCreation: !!initData,
    });
    const buf = {
        struct,
        buffer: _buf,
        lastData: undefined,
        queueUpdate,
        binding,
    };
    if (initData) {
        buf.lastData = initData;
        const mappedBuf = new Uint8Array(_buf.getMappedRange());
        const d = struct.serialize(initData);
        mappedBuf.set(d, 0);
        _buf.unmap();
    }
    function queueUpdate(data) {
        // TODO(@darzu): measure perf. we probably want to allow hand written serializers
        buf.lastData = data;
        const b = struct.serialize(data);
        assertDbg(b.byteLength % 4 === 0, `alignment`);
        device.queue.writeBuffer(_buf, 0, b);
        if (PERF_DBG_GPU)
            _gpuQueueBufferWriteBytes += b.byteLength;
        if (PERF_DBG_GPU_BLAME)
            dbgAddBlame("gpu", b.byteLength);
    }
    function binding(idx, plurality) {
        // TODO(@darzu): more binding options?
        return {
            binding: idx,
            // TODO(@darzu): is explicit size good?
            resource: { buffer: _buf, size: struct.size },
        };
    }
    if (PERF_DBG_GPU) {
        console.log(`CySingleton ${name}: ${struct.size}b`);
    }
    return buf;
}
export function createCyArray(device, name, struct, usage, lenOrData) {
    // TODO(@darzu): just take in a ptr?
    const hasInitData = typeof lenOrData !== "number";
    const length = hasInitData ? lenOrData.length : lenOrData;
    // if ((usage & GPUBufferUsage.UNIFORM) !== 0) {
    //   // TODO(@darzu): is this true for arrays where the whole array might be a uniform?
    //   assert(
    //     struct.size % 256 === 0,
    //     "CyArray with UNIFORM usage must be 256 aligned"
    //   );
    // }
    const _buf = device.createBuffer({
        label: `${name}_array`,
        size: struct.size * length,
        // TODO(@darzu): parameterize these
        usage,
        mappedAtCreation: hasInitData,
    });
    const buf = {
        struct,
        buffer: _buf,
        length,
        queueUpdate,
        queueUpdates,
        queueZeros,
        binding,
    };
    if (hasInitData) {
        const data = lenOrData;
        const mappedBuf = new Uint8Array(_buf.getMappedRange());
        for (let i = 0; i < data.length; i++) {
            const d = struct.serialize(data[i]);
            mappedBuf.set(d, i * struct.size);
        }
        _buf.unmap();
    }
    function queueUpdate(data, index) {
        const b = struct.serialize(data);
        const bufOffset = index * struct.size;
        _queueUpdates(bufOffset, b.byteLength, b);
    }
    // TODO(@darzu): somewhat hacky way to reuse Uint8Arrays here; we could do some more global pool
    //    of these.
    let tempUint8Array = new Uint8Array(struct.size * 10);
    function _queueUpdates(bufOffset, dataSize, data) {
        assertDbg(dataSize % 4 === 0, `alignment`);
        assertDbg(bufOffset % 4 === 0, `alignment`);
        device.queue.writeBuffer(_buf, bufOffset, data, 0, dataSize);
        if (PERF_DBG_GPU)
            _gpuQueueBufferWriteBytes += dataSize;
        if (PERF_DBG_GPU_BLAME)
            dbgAddBlame("gpu", dataSize);
    }
    function queueUpdates(data, bufIdx, dataIdx, // TODO(@darzu): make last two params optional?
    dataCount) {
        // TODO(@darzu): PERF. probably a good idea to keep the serialized array
        //  around and modify that directly for many scenarios that need frequent
        //  updates.
        const dataSize = struct.size * dataCount;
        if (tempUint8Array.byteLength <= dataSize) {
            tempUint8Array = new Uint8Array(dataSize);
        }
        const serialized = tempUint8Array;
        // TODO(@darzu): DBG HACK! USE TEMP!
        // const serialized = new Uint8Array(dataSize);
        for (let i = dataIdx; i < dataIdx + dataCount; i++)
            serialized.set(struct.serialize(data[i]), struct.size * (i - dataIdx));
        const bufOffset = bufIdx * struct.size;
        _queueUpdates(bufOffset, dataSize, serialized);
    }
    function queueZeros(idx, count) {
        const dataSize = struct.size * count;
        if (tempUint8Array.byteLength <= dataSize) {
            tempUint8Array = new Uint8Array(dataSize);
        }
        tempUint8Array.fill(0, 0, dataSize);
        const bufOffset = idx * struct.size;
        _queueUpdates(bufOffset, dataSize, tempUint8Array);
    }
    function binding(idx, plurality) {
        const size = plurality === "one" ? struct.size : length * struct.size;
        return {
            binding: idx,
            resource: { buffer: _buf, size },
        };
    }
    if (PERF_DBG_GPU)
        console.log(`CyArray ${name}: ${struct.size * buf.length}b`);
    return buf;
}
export function createCyIdxBuf(device, name, length, data) {
    const hasInitData = !!data;
    const size = align(length * Uint16Array.BYTES_PER_ELEMENT, 4);
    // console.log(`idx size: ${size}`);
    const _buf = device.createBuffer({
        size: size,
        // TODO(@darzu): update usages based on.. usage
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: hasInitData,
        label: name,
    });
    const buf = {
        buffer: _buf,
        length,
        size,
        queueUpdate,
    };
    if (hasInitData) {
        const mappedBuf = new Uint16Array(_buf.getMappedRange());
        assert(mappedBuf.length >= data.length, "mappedBuf.length >= data.length");
        mappedBuf.set(data);
        _buf.unmap();
    }
    function queueUpdate(data, startIdx) {
        const startByte = startIdx * 2;
        assertDbg(data.byteLength % 4 === 0, `alignment`);
        assertDbg(startByte % 4 === 0, `alignment`);
        device.queue.writeBuffer(_buf, startByte, data);
        if (PERF_DBG_GPU)
            _gpuQueueBufferWriteBytes += data.byteLength;
        if (PERF_DBG_GPU_BLAME)
            dbgAddBlame("gpu", data.byteLength);
    }
    if (PERF_DBG_GPU) {
        console.log(`CyIdx ${name}: ${buf.size}b`);
    }
    return buf;
}
// TODO(@darzu): these paramters should just be CyTexturePtr
export function createCyTexture(device, ptr, usage) {
    const { size, format, init } = ptr;
    // TODO(@darzu): parameterize
    // TODO(@darzu): be more precise
    const bytesPerVal = texTypeToBytes[format];
    assert(bytesPerVal, `TODO format: ${format}`);
    const VIEW_CACHE_DEFAULT = 1;
    const cyTex = {
        _viewCache: new Map(),
        ptr,
        size,
        usage,
        format,
        texture: undefined, // pretty hacky...
        queueUpdate,
        resize,
        attachment,
    };
    resize(size[0], size[1]);
    if (init) {
        const data = init();
        if (PERF_DBG_GPU)
            console.log(`creating texture of size: ${(data.length * 4) / 1024}kb`);
        queueUpdate(data);
    }
    const black = V4.clone([0, 0, 0, 1]);
    return cyTex;
    function resize(width, height) {
        // TODO(@darzu): BUG: this nop doesn't work?
        // if (cyTex.texture && width === cyTex.size[0] && height === cyTex.size[1])
        //   return; // nop
        cyTex.size[0] = width;
        cyTex.size[1] = height;
        // TODO(@darzu): HACK. feels wierd to mutate the descriptor...
        ptr.size[0] = width;
        ptr.size[1] = height;
        const size = ptr.count ? [width, height, ptr.count] : [width, height];
        cyTex.texture?.destroy();
        cyTex.texture = device.createTexture({
            label: `${ptr.name}_tex`,
            size,
            format,
            dimension: "2d",
            // sampleCount,
            usage,
        });
        cyTex._viewCache.clear();
    }
    // TODO(@darzu): support updating different data types (instead of Float32Array)
    function queueUpdate(data, x, y, w, h) {
        if (bytesPerVal % data.BYTES_PER_ELEMENT !== 0) {
            console.warn(`mismatch between ${cyTex.ptr.name}.queueUpdate data el size ${data.BYTES_PER_ELEMENT} vs tex el size ${bytesPerVal}`);
        }
        assert(!ptr.count, `TODO: impl queueUpdate for texture arrays`);
        x = x ?? 0;
        y = y ?? 0;
        w = w ?? cyTex.size[0] - x;
        h = h ?? cyTex.size[1] - y;
        const bytesPerRow = w * bytesPerVal;
        device.queue.writeTexture({
            origin: {
                x,
                y,
            },
            texture: cyTex.texture,
        }, data, {
            offset: 0,
            bytesPerRow,
            // rowsPerImage: cyTex.size[1],
        }, {
            width: w,
            height: h,
            // TODO(@darzu): what does this mean?
            depthOrArrayLayers: 1,
        });
    }
    function attachment(opts) {
        assert(!ptr.count, `TODO: impl attachment for texture arrays`);
        const loadOp = opts?.doClear ? "clear" : "load";
        const backgroundColor = opts?.defaultColor ?? black;
        let view = opts?.viewOverride ?? cyTex._viewCache.get(VIEW_CACHE_DEFAULT);
        if (!view) {
            view = cyTex.texture.createView();
            cyTex._viewCache.set(VIEW_CACHE_DEFAULT, view);
        }
        return {
            view,
            loadOp,
            clearValue: backgroundColor,
            storeOp: "store",
        };
    }
}
export function createCyDepthTexture(device, ptr, usage) {
    const tex = createCyTexture(device, ptr, usage);
    const hasStencil = ptr.format in texTypeIsStencil;
    const VIEW_CACHE_DEPTH = 1 << 2;
    return Object.assign(tex, {
        kind: "depthTexture",
        ptr,
        depthAttachment,
    });
    function depthAttachment(clear, layerIdx) {
        const cacheKey = VIEW_CACHE_DEPTH | layerIdx;
        let view = tex._viewCache.get(cacheKey);
        if (!view) {
            view = tex.texture.createView({
                label: `${ptr.name}_viewForDepthAtt`,
                dimension: "2d",
                baseArrayLayer: layerIdx,
                arrayLayerCount: 1,
            });
            tex._viewCache.set(cacheKey, view);
        }
        return {
            view,
            depthLoadOp: clear ? "clear" : "load",
            depthClearValue: 1.0,
            depthStoreOp: "store",
            stencilLoadOp: hasStencil ? "clear" : undefined,
            stencilClearValue: hasStencil ? 0 : undefined,
            stencilStoreOp: hasStencil ? "store" : undefined,
        };
    }
}
//# sourceMappingURL=data-webgpu.js.map