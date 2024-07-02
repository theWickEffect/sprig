function assert(condition, msg) {
    if (!condition)
        throw new Error(msg ?? "Assertion failed (consider adding a helpful msg).");
}
export function createAudioGraph(htmlAudio, hasGain, hasAnalyser, hasSterPan, hasDist) {
    assert(htmlAudio);
    console.log(`creating graph`);
    // TODO(@darzu): does this close all the old nodes???
    // const ctx = new AudioContext();
    const graph = { ctx: new AudioContext(), sources: [], sourceGains: [] };
    const track = graph.ctx.createMediaElementSource(htmlAudio);
    const gain = graph.ctx.createGain();
    track.connect(gain);
    let lastNode = gain;
    graph.sources.push(track);
    graph.sourceGains.push(gain);
    if (hasAnalyser) {
        graph.analyser = graph.ctx.createAnalyser();
        lastNode.connect(graph.analyser);
    }
    if (hasGain) {
        graph.gain = graph.ctx.createGain();
        lastNode.connect(graph.gain);
        lastNode = graph.gain;
    }
    if (hasSterPan) {
        graph.pan = graph.ctx.createStereoPanner();
        lastNode.connect(graph.pan);
        // if(graph.gain) graph.gain.connect(graph.pan);
        // else track.connect(graph.pan)
    }
    if (hasDist) {
        graph.distortion = graph.ctx.createWaveShaper();
        lastNode.connect(graph.distortion);
        lastNode = graph.distortion;
        //     if(graph.pan) graph.pan.connect(graph.distortion);
        //     else if(graph.gain) graph.gain.connect(graph.distortion);
        //     else track.connect(graph.distortion);
        //     graph.distortion.connect(graph.ctx.destination)
    }
    // else if(graph.pan) graph.pan.connect(graph.ctx.destination);
    // else if(graph.gain) graph.gain.connect(graph.ctx.destination);
    // else track.connect(graph.ctx.destination);
    lastNode.connect(graph.ctx.destination);
    return graph;
}
export function mkSoundEffectsArray(audioFileNames, graph) {
    const soundEffectsAudioElements = [];
    // const soundEffectsSourceNodes: MediaElementAudioSourceNode[] = [];
    // const soundEffectsGraphs: AudioGraph[] = []
    for (const fileName of audioFileNames) {
        const ae = new Audio(fileName);
        soundEffectsAudioElements.push(ae);
        const source = graph.ctx.createMediaElementSource(ae);
        graph.sources.push(source);
        const sourceGain = graph.ctx.createGain();
        source.connect(sourceGain);
        graph.sourceGains.push(sourceGain);
        assert(graph.gain);
        sourceGain.connect(graph.gain);
        // const graph = createAudioGraph(ae,true);
        // if(graphsArr) graphsArr.push(graph);
        // soundEffectsGraphs.push(graph);
    }
    return soundEffectsAudioElements;
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
/** DOES THE THING */
export function getFrequencyData(analyser, dataArr) {
    analyser.getByteTimeDomainData(dataArr);
    return dataArr;
}
export function mkActionAudioData(stretchFileNames, releaseFileNames, loopStart = 1, audioGraph) {
    const gainIndexStart = audioGraph.sourceGains.length;
    const elements = mkSoundEffectsArray(stretchFileNames, audioGraph);
    const endElements = mkSoundEffectsArray(releaseFileNames, audioGraph);
    const gainIndexes = [];
    for (let i = gainIndexStart; i < audioGraph.sourceGains.length; i++)
        gainIndexes.push(i);
    return {
        elements,
        endElements,
        elementIndex: 0,
        loopStartIndex: loopStart,
        gainIndexes,
    };
}
export function updateActionAudio(aad) {
    if (aad.elements[aad.elementIndex].ended) {
        aad.elementIndex++;
        if (aad.elementIndex === aad.elements.length) {
            aad.elementIndex = aad.loopStartIndex;
        }
        aad.elements[aad.elementIndex].play();
    }
}
export function endAndResetActionAudio(aad) {
    resetActionAudio(aad);
    endActionAudio(aad);
}
export function endActionAudio(aad) {
    aad.endElements[0].play();
}
export function resetActionAudio(aad) {
    if (!aad.elements[aad.elementIndex].ended) {
        aad.elements[aad.elementIndex].pause();
    }
    aad.elementIndex = 0;
}
//# sourceMappingURL=audio-code.js.map