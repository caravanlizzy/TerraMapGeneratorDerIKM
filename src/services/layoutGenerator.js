/*
 * Layout generation service: well-known river presets (copied from the
 * reference project) and a random river-layout generator.
 *
 * A layout is: { width, height, form, rivers } where `rivers` is an array of
 * [x, y] coordinates (column, row), matching the "GitHub format".
 */
(function (TM) {
    'use strict';

    const { rowWidth } = TM.geometry;

    // Well-known maps, taken verbatim from the reference Python source.
    const PRESETS = {
        original: {
            width: 13, height: 9, form: 0,
            rivers: [[1, 1], [2, 1], [5, 1], [6, 1], [9, 1], [10, 1], [0, 2], [1, 2], [3, 2], [5, 2], [7, 2], [9, 2], [11, 2], [12, 2], [3, 3], [4, 3], [7, 3], [9, 3], [8, 4], [9, 4], [2, 5], [3, 5], [6, 5], [7, 5], [8, 5], [0, 6], [1, 6], [2, 6], [4, 6], [6, 6], [8, 6], [3, 7], [4, 7], [5, 7], [8, 7], [9, 8]]
        },
        fi: {
            width: 13, height: 9, form: 1,
            rivers: [[1, 0], [5, 0], [2, 1], [6, 1], [7, 1], [8, 1], [2, 2], [3, 2], [4, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [5, 3], [9, 3], [0, 4], [1, 4], [3, 4], [4, 4], [9, 4], [2, 5], [3, 5], [5, 5], [6, 5], [7, 5], [10, 5], [1, 6], [7, 6], [10, 6], [2, 7], [7, 7], [10, 7], [2, 8], [7, 8], [10, 8]]
        },
        fjords: {
            width: 13, height: 9, form: 0,
            rivers: [[2, 0], [2, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [3, 2], [4, 2], [6, 2], [11, 2], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [11, 3], [12, 3], [3, 4], [6, 4], [11, 4], [2, 5], [6, 5], [10, 5], [2, 6], [7, 6], [10, 6], [1, 7], [7, 7], [8, 7], [9, 7], [1, 8], [2, 8], [7, 8]]
        },
        loon: {
            width: 13, height: 9, form: 1,
            rivers: [[8, 0], [9, 0], [3, 1], [4, 1], [7, 1], [10, 1], [1, 2], [2, 2], [6, 2], [10, 2], [3, 3], [7, 3], [8, 3], [10, 3], [2, 4], [5, 4], [6, 4], [8, 4], [1, 5], [4, 5], [6, 5], [8, 5], [1, 6], [2, 6], [3, 6], [9, 6], [10, 6], [3, 7], [7, 7], [8, 7], [11, 7], [2, 8], [4, 8], [5, 8], [6, 8]]
        },
        onion: {
            width: 13, height: 9, form: 0,
            rivers: [[3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [2, 2], [3, 2], [9, 2], [10, 2], [2, 3], [6, 3], [9, 3], [3, 4], [5, 4], [6, 4], [7, 4], [9, 4], [10, 4], [11, 4], [12, 4], [1, 5], [2, 5], [6, 5], [10, 5], [2, 6], [3, 6], [4, 6], [9, 6], [10, 6], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7]]
        },
        archipelago: {
            width: 13, height: 9, form: 0,
            rivers: [[6, 0], [10, 0], [6, 1], [7, 1], [9, 1], [6, 2], [8, 2], [9, 2], [10, 2], [11, 2], [0, 3], [4, 3], [5, 3], [3, 3], [8, 3], [11, 3], [1, 4], [3, 4], [5, 4], [6, 4], [9, 4], [1, 5], [2, 5], [5, 5], [6, 5], [7, 5], [8, 5], [11, 5], [6, 6], [9, 6], [10, 6], [11, 6], [6, 7], [8, 7], [6, 8], [9, 8]]
        }
    };

    const PRESET_LABELS = {
        original: 'Original',
        fi: 'Fire & Ice',
        fjords: 'Fjords',
        loon: 'Loon Lakes',
        onion: 'Onion',
        archipelago: 'Archipelago'
    };

    function getPreset(name) {
        const p = PRESETS[name];
        if (!p) return null;
        // Return a deep copy so callers can mutate freely.
        return { width: p.width, height: p.height, form: p.form, rivers: p.rivers.map(r => [r[0], r[1]]) };
    }

    // Total number of hexes for a layout (rows have variable width).
    function totalHexes(width, height, form) {
        let total = 0;
        for (let y = 0; y < height; y++) total += rowWidth(width, y, form);
        return total;
    }

    /**
     * Generate a random river layout.
     * Rivers are grown as a few short random walks so they look river-like
     * rather than random noise.
     *
     * @param {number} width
     * @param {number} height
     * @param {number} form
     * @param {number} ratio fraction of hexes that should become rivers (0..1)
     */
    function randomizeRivers(width, height, form, ratio) {
        ratio = typeof ratio === 'number' ? ratio : 0.28;
        const target = Math.round(totalHexes(width, height, form) * ratio);
        const rivers = new Set();

        const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const inBounds = (x, y) => !TM.geometry.outOfBounds(x, y, width, height, form);

        let safety = 0;
        while (rivers.size < target && safety++ < target * 50 + 1000) {
            // Start a new short river somewhere on the map.
            let y = randInt(0, height - 1);
            let x = randInt(0, rowWidth(width, y, form) - 1);
            const walkLength = randInt(2, 5);
            for (let step = 0; step < walkLength && rivers.size < target; step++) {
                if (inBounds(x, y)) rivers.add(x + ',' + y);
                const dir = randInt(0, 5);
                const [nx, ny] = TM.geometry.nextHex(x, y, dir, form);
                if (!inBounds(nx, ny)) break;
                x = nx; y = ny;
            }
        }

        return {
            width, height, form,
            rivers: [...rivers].map(s => s.split(',').map(Number))
        };
    }

    TM.layout = {
        PRESETS, PRESET_LABELS,
        getPreset, randomizeRivers, totalHexes
    };
})(window.TM = window.TM || {});
