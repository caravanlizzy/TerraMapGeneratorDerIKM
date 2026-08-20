/*
 * Hex-grid geometry for the "GitHub format" used by the reference generator.
 *
 * The map is a set of offset rows (pointy-top hexes). Row `y` contains
 * `width - ((y + form) % 2)` hexes, so rows alternate between the full width
 * and one hex shorter. `form = 0` => the top row is the longer one,
 * `form = 1` => the top row is the shorter one.
 *
 * Coordinates are (x, y) = (column, row), zero-based, matching the Python code.
 */
(function (TM) {
    'use strict';

    // Number of hexes in a given row.
    function rowWidth(width, y, form) {
        return width - ((y + form) % 2);
    }

    function outOfBounds(x, y, width, height, form) {
        if (y < 0 || y >= height) return true;
        if (x < 0 || x >= rowWidth(width, y, form)) return true;
        return false;
    }

    // Neighbor of (x, y) in one of the 6 directions. Direct port of Python next_hex.
    function nextHex(x, y, dir, form) {
        const even = ((y + form) % 2) === 0;
        switch (dir) {
            case 0: return even ? [x, y + 1] : [x + 1, y + 1];       // down-right
            case 1: return [x + 1, y];                               // right
            case 2: return even ? [x, y - 1] : [x + 1, y - 1];       // up-right
            case 3: return even ? [x - 1, y - 1] : [x, y - 1];       // up-left
            case 4: return [x - 1, y];                               // left
            case 5: return even ? [x - 1, y + 1] : [x, y + 1];       // down-left
            default: return [x, y];
        }
    }

    // Pointy-top rendering constants.
    const R = 34;                          // circumradius of a hex
    const HEX_W = Math.sqrt(3) * R;        // hex width (flat-to-flat horizontally)
    const HEX_H = 2 * R;                   // hex height (point-to-point)
    const ROW_STEP = 1.5 * R;              // vertical distance between rows
    const MARGIN = 24;

    // Pixel center of hex (x, y).
    function center(x, y, form) {
        const shift = ((y + form) % 2) === 1 ? HEX_W / 2 : 0; // shorter rows shifted right
        return {
            cx: MARGIN + HEX_W / 2 + shift + x * HEX_W,
            cy: MARGIN + R + y * ROW_STEP
        };
    }

    // The 6 vertices of a pointy-top hex centered at (cx, cy), as [x, y] pairs.
    // Vertex i is at angle (60*i - 90) degrees; edge i connects vertex i and i+1.
    function hexVertices(cx, cy) {
        const pts = [];
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 180 * (60 * i - 90);
            pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
        }
        return pts;
    }

    // SVG polygon points for a pointy-top hex centered at (cx, cy).
    function hexPoints(cx, cy) {
        return hexVertices(cx, cy)
            .map(([px, py]) => px.toFixed(2) + ',' + py.toFixed(2))
            .join(' ');
    }

    function canvasSize(width, height, form) {
        return {
            width: Math.ceil(MARGIN * 2 + width * HEX_W),
            height: Math.ceil(MARGIN * 2 + HEX_H + (height - 1) * ROW_STEP)
        };
    }

    TM.geometry = {
        rowWidth, outOfBounds, nextHex,
        center, hexPoints, hexVertices, canvasSize,
        R, HEX_W, HEX_H, ROW_STEP, MARGIN
    };
})(window.TM = window.TM || {});
