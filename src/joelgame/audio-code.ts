import { getRandomInt } from "./joel-game.js";

function assert(condition: any, msg?: string): asserts condition {
if (!condition)
    throw new Error(msg ?? "Assertion failed (consider adding a helpful msg).");
}

export interface ActionAudioData{
    elements: HTMLAudioElement[];
    endElements: HTMLAudioElement[];
    elementIndex: number;
    loopStartIndex: number;
    gainIndexes: number[];
}

export interface AudioGraph{
    ctx: AudioContext;
    sources: MediaElementAudioSourceNode[];
    sourceGains: GainNode[]
    analyser?: AnalyserNode;
    gain?: GainNode;
    pan?: StereoPannerNode;
    distortion?: WaveShaperNode;
}

export function createAudioGraph(
    htmlAudio: HTMLAudioElement, 
    hasGain?: boolean, 
    hasAnalyser?: boolean, 
    hasSterPan?: boolean, 
    hasDist?: boolean
    ): AudioGraph{
        assert(htmlAudio);
        console.log(`creating graph`);

        // TODO(@darzu): does this close all the old nodes???
        
        // const ctx = new AudioContext();

        const graph: AudioGraph = {ctx: new AudioContext(), sources: [], sourceGains: []};
        
        const track = graph.ctx.createMediaElementSource(htmlAudio);
        const gain = graph.ctx.createGain();
        track.connect(gain);

        let lastNode: AnalyserNode | GainNode | StereoPannerNode | WaveShaperNode = gain;

        graph.sources.push(track);
        graph.sourceGains.push(gain);

        if(hasAnalyser){
            graph.analyser = graph.ctx.createAnalyser();
            lastNode.connect(graph.analyser);
        } 
        if(hasGain){
            graph.gain = graph.ctx.createGain();
            lastNode.connect(graph.gain);
            lastNode = graph.gain;
        } 
        if(hasSterPan){
            graph.pan = graph.ctx.createStereoPanner();
            lastNode.connect(graph.pan);
            // if(graph.gain) graph.gain.connect(graph.pan);
            // else track.connect(graph.pan)
        }
        if(hasDist){
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

export function mkSoundEffectsArray(audioFileNames: string[], graph: AudioGraph): HTMLAudioElement[]{
    const soundEffectsAudioElements: HTMLAudioElement[] = [];
    // const soundEffectsSourceNodes: MediaElementAudioSourceNode[] = [];
    // const soundEffectsGraphs: AudioGraph[] = []
    for(const fileName of audioFileNames){
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

export function configureAnalyser(
    analyser: AnalyserNode, 
    fftSize: number = 2048, 
    minDecibles: number = -100, 
    maxDecibles: number = -30, 
    smoothing: number = .8){
        analyser.maxDecibels = 0;
        analyser.fftSize = fftSize;
        analyser.minDecibels = minDecibles;
        analyser.maxDecibels = maxDecibles;
        analyser.smoothingTimeConstant = smoothing;
}

export function buildFreqDataArray(analyser: AnalyserNode): Uint8Array{
    return new Uint8Array(analyser.frequencyBinCount);
}

export function getFrequencyData(analyser: AnalyserNode, dataArr: Uint8Array): Uint8Array{
    analyser.getByteTimeDomainData(dataArr);
    return dataArr;
}

export function mkActionAudioData(
    stretchFileNames: string[], 
    releaseFileNames: string[],
    loopStart: number = 1,
    audioGraph: AudioGraph,
    // graphsArr?: AudioGraph[],
): ActionAudioData{
    const gainIndexStart = audioGraph.sourceGains.length;
    const elements = mkSoundEffectsArray(stretchFileNames,audioGraph)
    const endElements = mkSoundEffectsArray(releaseFileNames,audioGraph)
    const gainIndexes: number[] = [];
    for(let i=gainIndexStart; i<audioGraph.sourceGains.length; i++) gainIndexes.push(i);
    return{
        elements,
        endElements,
        elementIndex: 0,
        loopStartIndex: loopStart,
        gainIndexes,
    };
}

export function updateActionAudio(aad: ActionAudioData){
    if(aad.elements[aad.elementIndex].ended){
        aad.elementIndex++;
        if(aad.elementIndex === aad.elements.length){
            aad.elementIndex = aad.loopStartIndex;
        }
        aad.elements[aad.elementIndex].play();
    }
}
export function endAndResetActionAudio(aad: ActionAudioData){
    resetActionAudio(aad);
    endActionAudio(aad);
}

export function endActionAudio(aad: ActionAudioData){
    aad.endElements[0].play();
}

export function resetActionAudio(aad: ActionAudioData){
    if(!aad.elements[aad.elementIndex].ended){
        aad.elements[aad.elementIndex].pause();
    }
    aad.elementIndex = 0;
}
