import { startGameLoop } from "../main.js";


(async () => {
  // TODO(@darzu): work around for lack of top-level await in Safari
  try {
    await startGameLoop();
  } catch (e) {
    console.error(e);
  }
})();