import { ButtonDef } from "../gui/button.js";
import { assert } from "../utils/util.js";

interface View{
    topDiv: HTMLElement | null;
    title: HTMLHeadingElement;
    smallTitle: HTMLHeadingElement;
    instructions: HTMLParagraphElement;
    playButton: HTMLButtonElement;
    continueButton: HTMLButtonElement;
    goButton: HTMLButtonElement;
    lossHeading: HTMLHeadingElement;
    winHeading: HTMLHeadingElement;
    levelText: HTMLParagraphElement[];
    levelTitle: HTMLHeadingElement[];
}
const view: View = {
    topDiv: document.getElementById("top-div"),
    title: document.createElement("h1"),
    smallTitle: document.createElement("h2"),
    instructions: document.createElement("p"),
    playButton: document.createElement("button"),
    continueButton: document.createElement("button"),
    goButton: document.createElement("button"),
    lossHeading: document.createElement("h3"),
    winHeading: document.createElement("h3"),
    levelText: [],
    levelTitle: [],
}
let playFunction: Function = () =>{};
view.playButton.onclick = ()=>{playFunction()};
assert(view.topDiv);
initViewText();
function initViewText(){
    view.title.textContent = "Wall Rider 9000";
    view.instructions.textContent = "Controlls: Click, Drag, Release";
    view.playButton.textContent = "Play";
    view.continueButton.textContent = "Continue";
    view.goButton.textContent = "Lets Go!";
    view.lossHeading.textContent = "You Loose";
    view.winHeading.textContent = "You Win!";
    view.smallTitle.textContent = view.title.textContent;
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[0].textContent = "Tutorial Title";
    view.levelTitle.push(document.createElement('h4'));
    view.levelTitle[0].textContent = "Level 1 Title";
    view.levelText.push(document.createElement('p'));
    view.levelText[0].textContent = "tutorial text";
    view.levelText.push(document.createElement('p'));
    view.levelText[1].textContent = "level 1 text";

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

export function buildLevelScreen(levelNum: number): HTMLDivElement{
    const levelDiv = document.createElement("div");
    levelDiv.setAttribute("id", "level-div")
    levelDiv.appendChild(view.smallTitle);
    levelDiv.appendChild(view.levelTitle[levelNum]);
    levelDiv.appendChild(view.levelText[levelNum]);
    levelDiv.appendChild(view.goButton);
    //to do: add a graphic?
    return levelDiv;
}

export function buildWinScreen(){
    const winDiv = document.createElement("div");
    winDiv.setAttribute("id", "win-div")
    winDiv.appendChild(view.smallTitle);
    winDiv.appendChild(view.winHeading);
    winDiv.appendChild(view.continueButton);
    //to do: add a graphic?
    return winDiv;
}

export function buildLossScreen(){
    const lossDiv = document.createElement("div");
    lossDiv.setAttribute("id", "loss-div")
    lossDiv.appendChild(view.smallTitle);
    lossDiv.appendChild(view.lossHeading);
    lossDiv.appendChild(view.continueButton);
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

export function updatePlayFunction(playFunc: Function){
    playFunction = playFunc;
}

