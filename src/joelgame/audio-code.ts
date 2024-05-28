function assert(condition: any, msg?: string): asserts condition {
    if (!condition)
      throw new Error(msg ?? "Assertion failed (consider adding a helpful msg).");
  }

    export interface AudioGraph{
        ctx: AudioContext;
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

            const graph: AudioGraph = {ctx: new AudioContext()};
          
            const track = graph.ctx.createMediaElementSource(htmlAudio);

            if(hasAnalyser){
                graph.analyser = graph.ctx.createAnalyser();
                track.connect(graph.analyser);
            } 
            if(hasGain){
                graph.gain = graph.ctx.createGain();
                track.connect(graph.gain);
            } 
            if(hasSterPan){
                graph.pan = graph.ctx.createStereoPanner();
                if(graph.gain) graph.gain.connect(graph.pan);
                else track.connect(graph.pan)
            }
            if(hasDist){
                graph.distortion = graph.ctx.createWaveShaper();
                if(graph.pan) graph.pan.connect(graph.distortion);
                else if(graph.gain) graph.gain.connect(graph.distortion);
                else track.connect(graph.distortion);
                graph.distortion.connect(graph.ctx.destination)
            }
            else if(graph.pan) graph.pan.connect(graph.ctx.destination);
            else if(graph.gain) graph.gain.connect(graph.ctx.destination);
            else track.connect(graph.ctx.destination);

            return graph;
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
