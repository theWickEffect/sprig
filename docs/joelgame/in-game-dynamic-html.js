const hearts = document.createElement("h6");
hearts.setAttribute("id", "hearts");
export let lives = 3;
updateHearts();
displayHearts();
export function updateHearts() {
    console.log("updateHearts");
    let heartString = "";
    for (let i = 0; i < lives; i++) {
        heartString += " ❤️";
    }
    hearts.textContent = heartString;
}
export function breakHeart() {
    lives--;
    if (hearts.textContent) {
        hearts.textContent = hearts.textContent.substring(0, hearts.textContent.length - 1) + "💔";
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
//# sourceMappingURL=in-game-dynamic-html.js.map