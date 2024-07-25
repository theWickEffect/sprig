import { ButtonDef } from "../gui/button.js";
import { assert } from "../utils/util.js";
import { game } from "./joel-game.js";

export interface Pages{
    home: HTMLDivElement;
    loss: HTMLDivElement;
    level: HTMLDivElement[];
    win: HTMLDivElement;
}


interface View{
    topDiv: HTMLElement | null;
    title: HTMLHeadingElement;
    smallTitle: HTMLHeadingElement;
    instructions: HTMLParagraphElement;
    playButton: HTMLButtonElement;
    winContinueButton: HTMLButtonElement;
    lossContinueButton: HTMLButtonElement;
    goButton: HTMLButtonElement;
    lossHeading: HTMLHeadingElement;
    winHeading: HTMLHeadingElement;
    finishHeading: HTMLHeadingElement[];
    levelText: HTMLParagraphElement[];
    levelTitle: HTMLHeadingElement[];
}
const view: View = {
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
}
let playFunction: Function = () =>{};
view.playButton.onclick = ()=>{playFunction()};
assert(view.topDiv);
initViewText();
markViewElements();
function initViewText(){
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
    view.finishHeading[0].textContent = "Sick!";
    view.finishHeading.push(document.createElement('h3'));
    view.finishHeading[0].textContent = "Sweet!";
    view.finishHeading.push(document.createElement('h3'));
    view.finishHeading[0].textContent = "Spicy!";
    view.finishHeading.push(document.createElement('h3'));
    view.finishHeading[0].textContent = "Cool!";
    view.finishHeading.push(document.createElement('h3'));
    view.finishHeading[0].textContent = "Done!";
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

function markViewElements(){
    for(let i=0;i<view.finishHeading.length;i++){
        view.finishHeading[i].setAttribute("id","finishText");
    }
    
}

export const pages: Pages = {
    home: buildStartScreen(),
    loss: buildLossScreen(),
    level: buildLevelPages(),
    win: buildWinScreen(),
}

view.winContinueButton.onclick = () => {
    window.location.reload();
}

view.lossContinueButton.onclick = () => {
    window.location.reload();
}
    
export function buildStartScreen(): HTMLDivElement{
    const homepageDiv = document.createElement("div");
    homepageDiv.setAttribute("id", "start-screen-div");
    homepageDiv.appendChild(view.title);
    // to do add a css animation;
    homepageDiv.appendChild(view.playButton);
    // to do: add homepageDiv to body and format css
    return homepageDiv;
}

export function buildLevelPages(): HTMLDivElement[]{
    const levelPages: HTMLDivElement[] = [];
    for(let i=0;i<view.levelText.length;i++){
        levelPages.push(buildLevelScreen(i));
    }
    return levelPages;
}

export function buildLevelScreen(levelNum: number): HTMLDivElement{
    const levelDiv = document.createElement("div");
    levelDiv.setAttribute("id", "level-div")
    levelDiv.appendChild(view.smallTitle);
    levelDiv.appendChild(view.levelTitle[levelNum]);
    levelDiv.appendChild(view.levelText[levelNum]);
    const continueButton = document.createElement("button");
    continueButton.textContent = "Continue";
    levelDiv.appendChild(continueButton);
    //to do: add a graphic?
    return levelDiv;
}

export function buildWinScreen(){
    const winDiv = document.createElement("div");
    winDiv.setAttribute("id", "win-div")
    winDiv.appendChild(view.smallTitle);
    winDiv.appendChild(view.winHeading);
    winDiv.appendChild(view.winContinueButton);
    //to do: add a graphic?
    return winDiv;
}

export function buildLossScreen(): HTMLDivElement{
    const lossDiv = document.createElement("div");
    lossDiv.setAttribute("id", "loss-div")
    lossDiv.appendChild(view.smallTitle);
    lossDiv.appendChild(view.lossHeading);
    lossDiv.appendChild(view.lossContinueButton);
    //to do: add a graphic?
    return lossDiv;
}

export function displayStartScreen(): HTMLButtonElement{
    console.log("displayStartScreen");
    const startScreen = buildStartScreen();
    view.topDiv?.appendChild(startScreen)
    // const topElement = document.getElementById("top-div");
    // if(topElement){
    //     console.log("topElementFound");
    //     topElement.appendChild(startScreen);
    // }
    
    return view.playButton;
}

export function displayFinishText(level: number = game.level){
    // assert(view.topDiv);
    view.topDiv?.appendChild(view.finishHeading[level]);
    // return () => {view.topDiv?.removeChild(view.finishHeading)};
}

export function removeFinishText(level: number = game.level){
    view.topDiv?.removeChild(view.finishHeading[level]);
}

export function displayScreen(screen: HTMLDivElement):HTMLButtonElement | null{
    console.log("display: "+ screen.getAttribute("id"));
    view.topDiv?.appendChild(screen);
    return screen.querySelector("button");
}

export function removeStartScreen(){
    const startScreen = document.getElementById("start-screen-div");
    // view.topDiv?.removeChild(startScreen);
    if(startScreen){
        view.topDiv?.removeChild(startScreen);
    }
}

export function removeScreen(divElement: HTMLDivElement){
    view.topDiv?.removeChild(divElement);
}

export function updatePlayFunction(playFunc: Function){
    playFunction = playFunc;
}

