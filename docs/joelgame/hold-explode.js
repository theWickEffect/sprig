export var HoldMod;
(function (HoldMod) {
    function explode(hold) {
    }
    HoldMod.explode = explode;
    function shake(hold) {
        hold.entity.position[0] += .01 * Math.random() - .005;
        hold.entity.position[1] += .01 * Math.random() - .005;
        hold.entity.position[2] += .01 * Math.random() - .005;
    }
    HoldMod.shake = shake;
})(HoldMod || (HoldMod = {}));
//# sourceMappingURL=hold-explode.js.map