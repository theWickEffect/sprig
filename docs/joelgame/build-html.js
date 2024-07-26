import { assert } from "../utils/util.js";
import { game } from "./joel-game.js";
export const view = {
    topDiv: document.getElementById("top-div"),
    title: document.createElement("h1"),
    smallTitle: document.createElement("h2"),
    instructions: document.createElement("p"),
    playButton: document.createElement("button"),
    winContinueButton: document.createElement("button"),
    lossContinueButton: document.createElement("button"),
    goButton: document.createElement("button"),
    lossHeading: document.createElement("h3"),
    winHeading: document.createElement("h3"),
    finishHeading: [],
    levelText: [],
    levelTitle: [],
};
let playFunction = () => { };
view.playButton.onclick = () => { playFunction(); };
assert(view.topDiv);
initViewText();
export const pages = {
    home: buildStartScreen(),
    loss: buildLossScreen(),
    level: buildLevelPages(),
    win: buildWinScreen(),
};
markElementIds(view, pages);
function initViewText() {
    view.title.textContent = "Wall Rider 9000";
    view.instructions.textContent = "Controlls: Click, Drag, Release";
    view.playButton.textContent = "Play";
    view.winContinueButton.textContent = "Play Again";
    view.lossContinueButton.textContent = "Play Again";
    view.goButton.textContent = "Lets Go!";
    view.lossHeading.textContent = "You Loose";
    view.winHeading.textContent = "You Win!";
    view.finishHeading.push(document.createElement('h3'));
    view.finishHeading[0].textContent = "Nice!";
    view.finishHeading.push(document.createElement('h3'));
    view.finishHeading[1].textContent = "Sick!";
    view.finishHeading.push(document.createElement('h3'));
    view.finishHeading[2].textContent = "Sweet!";
    view.finishHeading.push(document.createElement('h3'));
    view.finishHeading[3].textContent = "Spicy!";
    view.finishHeading.push(document.createElement('h3'));
    view.finishHeading[4].textContent = "Cool!";
    view.finishHeading.push(document.createElement('h3'));
    view.finishHeading[5].textContent = "Done!";
    view.smallTitle.textContent = view.title.textContent;
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[0].textContent = "Training";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[1].textContent = "The Boulder";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[2].textContent = "Free Solo";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[3].textContent = "Choss";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[4].textContent = "Mega-Choss";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[5].textContent = "The Proj";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[6].textContent = "The Mega-Proj";
    view.levelText.push(document.createElement('p'));
    view.levelText[0].textContent = "Press, Drag, Release. No footwork necessary!";
    view.levelText.push(document.createElement('p'));
    view.levelText[1].textContent = "Lets make it chalenging!";
    view.levelText.push(document.createElement('p'));
    view.levelText[2].textContent = "Ready for some endurance?";
    view.levelText.push(document.createElement('p'));
    view.levelText[3].textContent = "Gray will eventually break. Move Quickly!";
    view.levelText.push(document.createElement('p'));
    view.levelText[4].textContent = "Better not touch the black holds!";
    view.levelText.push(document.createElement('p'));
    view.levelText[5].textContent = "Now for a real challenge!";
    view.levelText.push(document.createElement('p'));
    view.levelText[5].textContent = "Does this even go!?";
}
function markElementIds(view, pages) {
    for (let i = 0; i < view.finishHeading.length; i++) {
        view.finishHeading[i].setAttribute("id", "finish-text");
    }
    // for(let i=0;i<pages.level.length;i++){
    //     pages.level[i].setAttribute("id", "level-div");
    // }
}
view.winContinueButton.onclick = () => {
    window.location.reload();
};
view.lossContinueButton.onclick = () => {
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
    winDiv.appendChild(view.winContinueButton);
    //to do: add a graphic?
    return winDiv;
}
export function buildLossScreen() {
    const lossDiv = document.createElement("div");
    lossDiv.setAttribute("id", "loss-div");
    lossDiv.appendChild(view.smallTitle);
    lossDiv.appendChild(view.lossHeading);
    lossDiv.appendChild(view.lossContinueButton);
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
export function displayFinishText(level = game.level) {
    // assert(view.topDiv);
    view.topDiv?.appendChild(view.finishHeading[level]);
    // return () => {view.topDiv?.removeChild(view.finishHeading)};
}
export function removeFinishText(level = game.level) {
    view.topDiv?.removeChild(view.finishHeading[level]);
}
export function displayScreen(screen) {
    // console.log("display: "+ screen.getAttribute("id"));
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