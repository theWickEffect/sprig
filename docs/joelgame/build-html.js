const view = {
    title: document.createElement("h1"),
    smallTitle: document.createElement("h2"),
    instructions: document.createElement("p"),
    playButton: document.createElement("button"),
    lossHeading: document.createElement("h3"),
    winHeading: document.createElement("h3"),
    levelText: [],
    levelTitle: [],
};
initViewText();
function initViewText() {
    view.title.textContent = "Wall Rider 9000";
    view.instructions.textContent = "Controlls: Click, Drag, Release";
    view.playButton.textContent = "Play";
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
export function buildStartScreen() {
    const homepageDiv = document.createElement("div");
    homepageDiv.setAttribute("id", "start-screen-div");
    homepageDiv.appendChild(view.title);
    // to do add a css animation;
    homepageDiv.appendChild(view.playButton);
    // to do: add homepageDiv to body and format css
    return homepageDiv;
}
export function buildLevelScreen(levelNum) {
    const levelDiv = document.createElement("div");
    levelDiv.appendChild(view.smallTitle);
    levelDiv.appendChild(view.levelTitle[levelNum]);
    levelDiv.appendChild(view.levelText[levelNum]);
    levelDiv.appendChild(view.playButton);
    //to do: add a graphic?
    return levelDiv;
}
export function DisplayStartScreen() {
    const startScreen = buildStartScreen();
    const topElement = document.getElementById("top-div");
    topElement?.insertAdjacentElement("afterend", startScreen);
    return view.playButton;
}
export function removeStartScreen() {
    const startScreen = document.getElementById("start-screen-div");
    if (startScreen) {
        document.removeChild(startScreen);
    }
}
//# sourceMappingURL=build-html.js.map