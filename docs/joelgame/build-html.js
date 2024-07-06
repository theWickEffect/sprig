const view = {
    title: document.createElement("h1"),
    smallTitle: document.createElement("h2"),
    instructions: document.createElement("p"),
    playButton: document.createElement("button"),
    lossHeading: document.createElement("h3"),
    winHeading: document.createElement("h3"),
    levelText: [],
};
initViewText();
function initViewText() {
    view.title.textContent = "Wall Rider 9000";
    view.instructions.textContent = "Controlls: Click, Drag, Release";
    view.playButton.textContent = "Play";
    view.lossHeading.textContent = "You Loose";
    view.winHeading.textContent = "You Win!";
    view.smallTitle.textContent = view.title.textContent;
    view.levelText.push(document.createElement('p'));
    view.levelText[0].textContent = "level 1 text";
}
export function buildStartScreen() {
    const homepageDiv = document.createElement("div");
    homepageDiv.appendChild(view.title);
    // to do add a css animation;
    homepageDiv.appendChild(view.playButton);
    // to do: add homepageDiv to body and format css
    return homepageDiv;
}
export function buildLevel1Screen() {
    const level1Div = document.createElement("div");
    return level1Div;
}
export function buildLevel2Screen() {
    const level2Div = document.createElement("div");
    return level2Div;
}
// etc
//# sourceMappingURL=build-html.js.map