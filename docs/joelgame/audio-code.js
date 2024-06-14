function assert(condition, msg) {
    if (!condition)
        throw new Error(msg ?? "Assertion failed (consider adding a helpful msg).");
}
export function createAudioGraph(htmlAudio, hasGain, hasAnalyser, hasSterPan, hasDist) {
    assert(htmlAudio);
    console.log(`creating graph`);
    // TODO(@darzu): does this close all the old nodes???
    // const ctx = new AudioContext();
    const graph = { ctx: new AudioContext() };
    const track = graph.ctx.createMediaElementSource(htmlAudio);
    if (hasAnalyser) {
        graph.analyser = graph.ctx.createAnalyser();
        track.connect(graph.analyser);
    }
    if (hasGain) {
        graph.gain = graph.ctx.createGain();
        track.connect(graph.gain);
    }
    if (hasSterPan) {
        graph.pan = graph.ctx.createStereoPanner();
        if (graph.gain)
            graph.gain.connect(graph.pan);
        else
            track.connect(graph.pan);
    }
    if (hasDist) {
        graph.distortion = graph.ctx.createWaveShaper();
        if (graph.pan)
            graph.pan.connect(graph.distortion);
        else if (graph.gain)
            graph.gain.connect(graph.distortion);
        else
            track.connect(graph.distortion);
        graph.distortion.connect(graph.ctx.destination);
    }
    else if (graph.pan)
        graph.pan.connect(graph.ctx.destination);
    else if (graph.gain)
        graph.gain.connect(graph.ctx.destination);
    else
        track.connect(graph.ctx.destination);
    return graph;
}
export function configureAnalyser(analyser, fftSize = 2048, minDecibles = -100, maxDecibles = -30, smoothing = .8) {
    analyser.maxDecibels = 0;
    analyser.fftSize = fftSize;
    analyser.minDecibels = minDecibles;
    analyser.maxDecibels = maxDecibles;
    analyser.smoothingTimeConstant = smoothing;
}
export function buildFreqDataArray(analyser) {
    return new Uint8Array(analyser.frequencyBinCount);
}
export function getFrequencyData(analyser, dataArr) {
    analyser.getByteTimeDomainData(dataArr);
    return dataArr;
}
//# sourceMappingURL=audio-code.js.map