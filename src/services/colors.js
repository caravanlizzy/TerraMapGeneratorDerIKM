/*
 * Color model for the Terra Mystica map generator.
 *
 * Mirrors the color set, distances and BGA symbols used by the reference
 * Python generator (https://github.com/ikmMaierBTUCS/Terra-Mystica-Map-Generator)
 * so that layouts and generated maps use the same format.
 */
(function (TM) {
    'use strict';

    // The seven terrain colors, in the wheel order used by the reference project.
    const TERRAINS = ['red', 'yel', 'bro', 'bla', 'blu', 'grn', 'gry'];

    // Special cell markers (kept identical to the Python implementation).
    const WATER = '~~~';        // a finished water/river hex
    const RIVER = ' ~ ';        // a river hex before colors are generated
    const UNASSIGNED = '???';   // a land hex before colors are generated

    // Display colors used to render the colored preview and exports.
    const DISPLAY_COLORS = {
        red: '#e2373a',
        yel: '#f2e33f',
        bro: '#835C3B',
        bla: '#2b2b2b',
        blu: '#3a6ff2',
        grn: '#4aa03f',
        gry: '#808080',
        '~~~': '#ffffff'
    };

    // BGA (Board Game Arena) map-file symbols.
    const BGA_SYMBOLS = {
        red: 'R', yel: 'Y', bro: 'U', bla: 'K',
        blu: 'B', grn: 'G', gry: 'S', '~~~': 'I'
    };

    function colorIndex(color) {
        const i = TERRAINS.indexOf(color);
        return i === -1 ? 100 : i;
    }

    // Cyclic distance between two terrain colors on the 7-color wheel.
    function colorDistance(color1, color2) {
        if (color1 === RIVER || color1 === WATER || color2 === RIVER || color2 === WATER) return 0;
        if (color1 === UNASSIGNED || color2 === UNASSIGNED) return 1.5;
        const a = colorIndex(color1);
        const b = colorIndex(color2);
        return Math.min(((a - b) % 7 + 7) % 7, ((b - a) % 7 + 7) % 7);
    }

    function bgaSymbol(color) {
        return BGA_SYMBOLS[color] || '';
    }

    TM.colors = {
        TERRAINS, WATER, RIVER, UNASSIGNED,
        DISPLAY_COLORS, BGA_SYMBOLS,
        colorIndex, colorDistance, bgaSymbol
    };
})(window.TM = window.TM || {});
