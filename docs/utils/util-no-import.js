// NOTE: No imports in this file! This file is included at top-level stuff like sprig-matrix
// TODO(@darzu): It's annoying to have to work around dependency issues with things like this.
export const PI = Math.PI; // TODO(@darzu): replace all usage with PI
export const PIn2 = Math.PI * 2; // PI numerator 2
export const PId2 = Math.PI / 2; // PI denominator 2
export const PId3 = Math.PI / 3; // 60 degrees
export const PId4 = Math.PI / 4; // 45 degrees
export const PId6 = Math.PI / 6; // 30 degrees
export const PId8 = Math.PI / 8; // 22.5 degrees
export const PId12 = Math.PI / 12; // 15 degrees
export const PId36 = Math.PI / 36; // 5 degrees
export function getCallStack() {
    return new Error()
        .stack.split("\n")
        .map((ln) => ln.trim())
        .filter((ln) => ln !== "Error" && !ln.includes("getCallStack"));
}
let blameMaps = new Map();
export function dbgAddBlame(kind, amount) {
    let map = blameMaps.get(kind);
    if (!map) {
        map = new Map();
        blameMaps.set(kind, map);
    }
    getCallStack().forEach((ln) => {
        map.set(ln, (map.get(ln) ?? 0) + amount);
    });
}
export function dbgGetBlame(kind) {
    return blameMaps.get(kind);
}
export function dbgClearBlame(kind) {
    blameMaps.get(kind)?.clear();
}
export function never(x, msg) {
    throw new Error(msg ?? `never(${x})`);
}
// TODO(@darzu): put on prototype?
export function flatten(doubleArr) {
    return doubleArr.reduce((p, n) => [...p, ...n], []);
}
export function assert(cond, msg) {
    // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions
    if (!cond)
        throw new Error(msg ?? "Assertion failed (consider adding a helpful msg).");
}
export function T() {
    return (p) => p;
}
//# sourceMappingURL=util-no-import.js.map