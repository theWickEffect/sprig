import { LifeControll } from "./joel-game.js";

const hearts = document.createElement("h6");
hearts.setAttribute("id","hearts");

// export let lives = 3;
//to do import lifeControll interface for lives;

// updateHearts();
displayHearts();

export function updateHearts(lc: LifeControll){
    console.log("updateHearts")
    let heartString = "";
    for(let i=0;i<lc.hearts;i++){
        heartString += " ❤️";
    }
    hearts.textContent = heartString;
}

export function breakHeart(lc: LifeControll){
    lc.hearts--;
    if(hearts.textContent){
        hearts.textContent = hearts.textContent.substring(0, hearts.textContent.length - 2) + " 💔";
    }
}

export function killHeart(){
    if(hearts.textContent){
        hearts.textContent = hearts.textContent.substring(0, hearts.textContent.length-2);
    }
}

function displayHearts(){
    console.log("displayHearts");
    const heartsDiv = document.getElementById("hearts-div");
    heartsDiv?.appendChild(hearts);
}