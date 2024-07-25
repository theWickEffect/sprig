import { assert } from "../utils/util.js";
const view = {
    topDiv: document.getElementById("top-div"),
    title: document.createElement("h1"),
    smallTitle: document.createElement("h2"),
    instructions: document.createElement("p"),
    playButton: document.createElement("button"),
    continueButton: document.createElement("button"),
    goButton: document.createElement("button"),
    lossHeading: document.createElement("h3"),
    winHeading: document.createElement("h3"),
    finishHeading: document.createElement("h3"),
    levelText: [],
    levelTitle: [],
};
let playFunction = () => { };
view.playButton.onclick = () => { playFunction(); };
assert(view.topDiv);
initViewText();
markViewElements();
function initViewText() {
    view.title.textContent = "Wall Rider 9000";
    view.instructions.textContent = "Controlls: Click, Drag, Release";
    view.playButton.textContent = "Play";
    view.continueButton.textContent = "Continue";
    view.goButton.textContent = "Lets Go!";
    view.lossHeading.textContent = "You Loose";
    view.finishHeading.textContent = "Nice!";
    view.winHeading.textContent = "You Win!";
    view.smallTitle.textContent = view.title.textContent;
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[0].textContent = "Tutorial Title";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[1].textContent = "Level 1 Title";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[2].textContent = "Level 2 Title";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[3].textContent = "Level 3 Title";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[4].textContent = "Level 4 Title";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[5].textContent = "Level 5 Title";
    view.levelText.push(document.createElement('p'));
    view.levelText[0].textContent = "tutorial text";
    view.levelText.push(document.createElement('p'));
    view.levelText[1].textContent = "level 1 text";
    view.levelText.push(document.createElement('p'));
    view.levelText[2].textContent = "level 2 text";
    view.levelText.push(document.createElement('p'));
    view.levelText[3].textContent = "level 3 text";
    view.levelText.push(document.createElement('p'));
    view.levelText[4].textContent = "level 4 text";
    view.levelText.push(document.createElement('p'));
    view.levelText[5].textContent = "level 5 text";
}
function markViewElements() {
    view.finishHeading.setAttribute("id", "finishText");
}
export const pages = {
    home: buildStartScreen(),
    loss: buildLossScreen(),
    level: buildLevelPages(),
};
view.continueButton.onclick = () => {
    window.location.reload();
};
export function buildStartScreen() {
    const homepageDiv = document.createElement("div");
    homepageDiv.setAttribute("id", "start-screen-div");
    homepageDiv.appendChild(view.title);
    // to do add a css animation;
    homepageDiv.appendChild(view.playButton);
    // to do: add homepageDiv to body and format css
    return homepageDiv;
}
export function buildLevelPages() {
    const levelPages = [];
    for (let i = 0; i < view.levelText.length; i++) {
        levelPages.push(buildLevelScreen(i));
    }
    return levelPages;
}
export function buildLevelScreen(levelNum) {
    const levelDiv = document.createElement("div");
    levelDiv.setAttribute("id", "level-div");
    levelDiv.appendChild(view.smallTitle);
    levelDiv.appendChild(view.levelTitle[levelNum]);
    levelDiv.appendChild(view.levelText[levelNum]);
    const continueButton = document.createElement("button");
    continueButton.textContent = "Continue";
    levelDiv.appendChild(continueButton);
    //to do: add a graphic?
    return levelDiv;
}
export function buildWinScreen() {
    const winDiv = document.createElement("div");
    winDiv.setAttribute("id", "win-div");
    winDiv.appendChild(view.smallTitle);
    winDiv.appendChild(view.winHeading);
    winDiv.appendChild(view.continueButton);
    //to do: add a graphic?
    return winDiv;
}
export function buildLossScreen() {
    const lossDiv = document.createElement("div");
    lossDiv.setAttribute("id", "loss-div");
    lossDiv.appendChild(view.smallTitle);
    lossDiv.appendChild(view.lossHeading);
    lossDiv.appendChild(view.continueButton);
    //to do: add a graphic?
    return lossDiv;
}
export function displayStartScreen() {
    console.log("displayStartScreen");
    const startScreen = buildStartScreen();
    view.topDiv?.appendChild(startScreen);
    // const topElement = document.getElementById("top-div");
    // if(topElement){
    //     console.log("topElementFound");
    //     topElement.appendChild(startScreen);
    // }
    return view.playButton;
}
export function displayFinishText() {
    // assert(view.topDiv);
    view.topDiv?.appendChild(view.finishHeading);
    // return () => {view.topDiv?.removeChild(view.finishHeading)};
}
export function removeFinishText() {
    view.topDiv?.removeChild(view.finishHeading);
}
export function displayScreen(screen) {
    console.log("display: " + screen.getAttribute("id"));
    view.topDiv?.appendChild(screen);
    return screen.querySelector("button");
}
export function removeStartScreen() {
    const startScreen = document.getElementById("start-screen-div");
    // view.topDiv?.removeChild(startScreen);
    if (startScreen) {
        view.topDiv?.removeChild(startScreen);
    }
}
export function removeScreen(divElement) {
    view.topDiv?.removeChild(divElement);
}
export function updatePlayFunction(playFunc) {
    playFunction = playFunc;
}
//# sourceMappingURL=build-html.js.map