// TODO(@darzu): compare and find efficient pseudo-random algorithms
// TODO(@darzu): how does this compare perf-wise to Math.random()
export function createPseudorandomGen(seedX = 1, seedY = 1) {
    let _seedX = seedX;
    let _seedY = seedY;
    function setSeed(seedX, seedY = 1) {
        _seedX = seedX;
        _seedY = seedY;
    }
    // TODO(@darzu): allow for different strategies
    // NOTE: (-1, 1)
    function jitter1() {
        _seedX =
            (Math.cos(dot(_seedX, _seedY, 26.88662389, 200.54042905)) *
                240.61722267) %
                1;
        _seedY =
            (Math.cos(dot(_seedX, _seedY, 58.302370833, 341.7795489)) *
                523.34916812) %
                1;
        return _seedY;
    }
    // NOTE: (0,1)
    function rand() {
        const r0 = jitter1();
        const r = r0 * 0.5 + 0.5;
        // console.log(`rand: ${r}`);
        return r;
    }
    // NOTE: (-radius, radius)
    function jitter(radius) {
        return jitter1() * radius;
    }
    return {
        setSeed,
        rand,
        jitter,
    };
}
function dot(x0, y0, x1, y1) {
    return x0 * x1 + y0 * y1;
}
export const randGenerator = createPseudorandomGen();
export function rand() {
    return randGenerator.rand();
}
//# sourceMappingURL=rand.js.map