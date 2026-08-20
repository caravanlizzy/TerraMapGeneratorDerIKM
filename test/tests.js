/*
 * Browser test suite for the Terra Mystica Map Layout Tool.
 *
 * Runs entirely in the browser (no Node / build step). Open test/index.html to
 * execute it. It loads the same service + UI scripts the app uses and runs:
 *   1. Service-layer assertions (geometry, presets, color generation, distance).
 *   2. A UI integration flow (render, generate colors, swap two land hexes).
 * Results are rendered into the page and also logged to the console.
 */
function runTests() {
    'use strict';

    const TM = window.TM;

    let passed = 0, failed = 0;
    const log = [];
    function assert(cond, msg) {
        if (cond) {
            passed++;
            log.push({ ok: true, msg });
        } else {
            failed++;
            log.push({ ok: false, msg });
            console.error('  FAIL: ' + msg);
        }
    }

    /* ---------------- service layer ---------------- */

    (function testGeometry() {
        const { rowWidth, nextHex, outOfBounds } = TM.geometry;
        // form 0: even rows longer.
        assert(rowWidth(13, 0, 0) === 13, 'row 0 (form 0) has full width');
        assert(rowWidth(13, 1, 0) === 12, 'row 1 (form 0) is one shorter');
        // form 1: top row shorter.
        assert(rowWidth(13, 0, 1) === 12, 'row 0 (form 1) is one shorter');

        // Adjacency symmetry: if B is neighbor of A in some direction,
        // then A must be a neighbor of B in some direction.
        const W = 13, H = 9, F = 0;
        let symmetric = true;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < rowWidth(W, y, F); x++) {
                for (let d = 0; d < 6; d++) {
                    const [nx, ny] = nextHex(x, y, d, F);
                    if (outOfBounds(nx, ny, W, H, F)) continue;
                    let back = false;
                    for (let d2 = 0; d2 < 6; d2++) {
                        const [bx, by] = nextHex(nx, ny, d2, F);
                        if (bx === x && by === y) { back = true; break; }
                    }
                    if (!back) symmetric = false;
                }
            }
        }
        assert(symmetric, 'hex adjacency is symmetric');
    })();

    (function testPresets() {
        for (const name of Object.keys(TM.layout.PRESETS)) {
            const p = TM.layout.getPreset(name);
            const seen = new Set();
            for (const [x, y] of p.rivers) seen.add(x + ',' + y);
            assert(seen.size === p.rivers.length, 'preset "' + name + '" has no duplicate rivers');
            assert(p.width > 0 && p.height > 0, 'preset "' + name + '" has positive dimensions');
        }
        // NOTE: some reference presets (fi, fjords) include a few river coordinates
        // that land on the shorter rows. As in the original Python generator, such
        // out-of-bounds coordinates are simply ignored when the map is built.
    })();

    function validColoredMap(map) {
        const { rowWidth } = TM.geometry;
        const valid = new Set([...TM.colors.TERRAINS, TM.colors.WATER]);
        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < rowWidth(map.width, y, map.form); x++) {
                const c = map.get(x, y);
                if (!valid.has(c)) return { ok: false, reason: 'invalid color "' + c + '" at ' + x + ',' + y };
            }
        }
        return { ok: true };
    }

    (function testColorGeneration() {
        // Every preset must produce a fully colored, valid map.
        for (const name of Object.keys(TM.layout.PRESETS)) {
            const p = TM.layout.getPreset(name);
            const map = new TM.TerrainMapGenerator(p.height, p.width, p.form, p.rivers);
            map.generate();
            const res = validColoredMap(map);
            assert(res.ok, 'preset "' + name + '" -> valid full map' + (res.ok ? '' : ' (' + res.reason + ')'));

            // In-bounds river hexes must become water (out-of-bounds ones are ignored).
            let riversAreWater = true;
            for (const [x, y] of p.rivers) {
                if (TM.geometry.outOfBounds(x, y, p.width, p.height, p.form)) continue;
                if (map.get(x, y) !== TM.colors.WATER) riversAreWater = false;
            }
            assert(riversAreWater, 'preset "' + name + '" -> in-bounds river hexes are water');

            // BGA format must have the right number of rows and symbols.
            const rows = map.bgaFormat().split('\n');
            assert(rows.length === p.height, 'preset "' + name + '" -> BGA has ' + p.height + ' rows');
            let bgaOk = true;
            for (let y = 0; y < p.height; y++) {
                const cells = rows[y].split(',');
                if (cells.length !== TM.geometry.rowWidth(p.width, y, p.form)) bgaOk = false;
                for (const s of cells) if (!/^[RYUKBGSI]$/.test(s)) bgaOk = false;
            }
            assert(bgaOk, 'preset "' + name + '" -> BGA symbols well-formed');
        }
    })();

    (function testRandomLayouts() {
        // Random layouts (including tricky sizes) must always yield valid maps.
        const cases = [
            [13, 9, 0], [13, 9, 1], [5, 5, 0], [1, 1, 0], [2, 3, 1], [20, 4, 0]
        ];
        for (const [w, h, f] of cases) {
            for (let iter = 0; iter < 5; iter++) {
                const layout = TM.layout.randomizeRivers(w, h, f);
                const map = new TM.TerrainMapGenerator(h, w, f, layout.rivers);
                map.generate();
                const res = validColoredMap(map);
                assert(res.ok, 'random ' + w + 'x' + h + ' form ' + f + ' -> valid full map' + (res.ok ? '' : ' (' + res.reason + ')'));
            }
        }
    })();

    (function testColorDistance() {
        const { colorDistance } = TM.colors;
        assert(colorDistance('red', 'red') === 0, 'distance red-red = 0');
        assert(colorDistance('red', 'yel') === 1, 'distance red-yel = 1');
        assert(colorDistance('red', 'gry') === 1, 'distance red-gry = 1 (wraps around)');
        assert(colorDistance('red', 'bla') === 3, 'distance red-bla = 3');
    })();

    /* ---------------- UI integration ---------------- */

    const svg = document.getElementById('map');
    const WATER_FILL = TM.colors.DISPLAY_COLORS['~~~'];

    function polygons() {
        return Array.from(svg.querySelectorAll('polygon'));
    }
    function getHex(x, y) {
        return polygons().find(p => p.dataset.x == x && p.dataset.y == y);
    }
    function click(el) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    function $(id) { return document.getElementById(id); }

    (function testUi() {
        // 1. Initial edit render draws one polygon per hex.
        const expectedTotal = TM.layout.totalHexes(13, 9, 0);
        assert(polygons().length === expectedTotal,
            'edit mode renders all ' + expectedTotal + ' hexes (got ' + polygons().length + ')');

        // 2. Load the "original" preset and generate colors.
        const preset = $('preset');
        preset.value = 'original';
        preset.onchange({ target: preset });
        click($('generateColors'));
        assert(polygons().length === expectedTotal, 'colored mode renders all hexes');

        // Every hex must now be filled with a display color.
        const colored = polygons();
        const validFills = new Set(Object.values(TM.colors.DISPLAY_COLORS));
        assert(colored.every(p => validFills.has(p.getAttribute('fill'))), 'every colored hex has a valid fill');

        // 3. Swap two land hexes with different colors.
        const land = colored.filter(p => p.getAttribute('fill') !== WATER_FILL);
        assert(land.length >= 2, 'there are at least two land hexes to swap');

        let a = null, b = null;
        for (let i = 0; i < land.length && !b; i++) {
            for (let j = i + 1; j < land.length; j++) {
                if (land[i].getAttribute('fill') !== land[j].getAttribute('fill')) {
                    a = land[i]; b = land[j]; break;
                }
            }
        }
        assert(a && b, 'found two land hexes with different colors');

        if (a && b) {
            const ax = a.dataset.x, ay = a.dataset.y, bx = b.dataset.x, by = b.dataset.y;
            const fa = a.getAttribute('fill'), fb = b.getAttribute('fill');

            click(getHex(ax, ay)); // select first
            click(getHex(bx, by)); // select second -> triggers swap + re-render

            assert(getHex(ax, ay).getAttribute('fill') === fb, 'first hex now has the second hex color');
            assert(getHex(bx, by).getAttribute('fill') === fa, 'second hex now has the first hex color');
        }

        // 4. Water hexes are not swappable: selecting a water hex then a land hex must not swap.
        const water = polygons().find(p => p.getAttribute('fill') === WATER_FILL);
        if (water) {
            const wx = water.dataset.x, wy = water.dataset.y;
            const someLand = polygons().find(p => p.getAttribute('fill') !== WATER_FILL);
            const lx = someLand.dataset.x, ly = someLand.dataset.y;
            const beforeWater = getHex(wx, wy).getAttribute('fill');
            const beforeLand = getHex(lx, ly).getAttribute('fill');
            click(getHex(wx, wy)); // ignored (water)
            click(getHex(lx, ly)); // only one real selection now
            assert(getHex(wx, wy).getAttribute('fill') === beforeWater, 'water hex unchanged after click');
            assert(getHex(lx, ly).getAttribute('fill') === beforeLand, 'land hex not swapped with water');
        }
    })();

    /* ---------------- report ---------------- */

    console.log('\n' + passed + ' passed, ' + failed + ' failed');

    const summary = document.getElementById('summary');
    if (summary) {
        summary.className = failed === 0 ? 'ok' : 'bad';
        summary.textContent = passed + ' passed, ' + failed + ' failed';
    }
    const results = document.getElementById('results');
    if (results) {
        results.innerHTML = log
            .map(r => '<div class="' + (r.ok ? 'pass' : 'fail') + '">'
                + (r.ok ? 'PASS' : 'FAIL') + ': ' + r.msg + '</div>')
            .join('');
    }
}

// Run after the app controller has initialized (it wires up on DOMContentLoaded).
if (document.readyState === 'complete') {
    runTests();
} else {
    window.addEventListener('load', runTests);
}
