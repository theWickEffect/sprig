import { assert } from "./utils/util-no-import.js";
export const GAME_LOADER = createGameLoader();
function createGameLoader() {
    const gameRegistry = {};
    let _lastGameStarted = undefined;
    function getAvailableGameNames() {
        return Object.keys(gameRegistry);
    }
    function registerGame(reg) {
        gameRegistry[reg.name] = reg;
    }
    function startGame(name) {
        const reg = gameRegistry[name];
        assert(reg, `Invalid game name "${name}".\n Possible names are:\n${getAvailableGameNames().join("\n")}`);
        _lastGameStarted = name;
        reg.init();
    }
    function getGameName() {
        return _lastGameStarted;
    }
    return {
        registerGame,
        startGame,
        getGameName,
        getAvailableGameNames,
    };
}
//# sourceMappingURL=game-loader.js.map