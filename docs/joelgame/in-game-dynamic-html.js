const hearts = document.createElement("h6");
hearts.setAttribute("id", "hearts");
// export let lives = 3;
//to do import lifeControll interface for lives;
// updateHearts();
displayHearts();
export const updatePowerMeter = buildPowerMeter();
export function updateHearts(lc) {
    console.log("updateHearts");
    let heartString = "";
    for (let i = 0; i < lc.hearts; i++) {
        heartString += " ❤️";
    }
    hearts.textContent = heartString;
}
export function breakHeart(lc) {
    lc.hearts--;
    if (hearts.textContent) {
        hearts.textContent = hearts.textContent.substring(0, hearts.textContent.length - 2) + " 💔";
    }
}
export function killHeart() {
    if (hearts.textContent) {
        hearts.textContent = hearts.textContent.substring(0, hearts.textContent.length - 2);
    }
}
function displayHearts() {
    console.log("displayHearts");
    const heartsDiv = document.getElementById("hearts-div");
    heartsDiv?.appendChild(hearts);
}
function buildPowerMeter() {
    // const meterText = document.createElement("h6");
    // meterText.textContent = "Power Meter:";
    const meter = document.createElement("meter");
    meter.setAttribute("id", "power-meter");
    meter.setAttribute("min", "10");
    //set max to whatever our old max was
    meter.setAttribute("max", "250");
    meter.setAttribute("value", "0");
    // meter.setAttribute("low","10");
    // meter.setAttribute("high","250");
    const meterDiv = document.getElementById("power-meter-div");
    // meterDiv?.appendChild(meterText);
    meterDiv?.appendChild(meter);
    function updateMeter(val) {
        val = Math.floor(val);
        meter.setAttribute("value", val.toString());
    }
    return updateMeter;
}
//# sourceMappingURL=in-game-dynamic-html.js.map