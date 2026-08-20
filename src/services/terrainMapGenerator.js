/*
 * TerrainMapGenerator - JavaScript port of the reference Terra Mystica color
 * distribution algorithm (https://github.com/ikmMaierBTUCS/Terra-Mystica-Map-Generator).
 *
 * Given a river layout it fills every land hex with one of the seven terrain
 * colors using the same "share score" / "work distance" spiral walk as the
 * original Python code. All console output from the original is removed.
 *
 * The public entry point is `generate()`, which reads as a high-level recipe:
 *
 *     initializeGrid()          -> mark river hexes, leave land hexes unassigned
 *     placeRandomStartHex()     -> seed a first colored hex
 *     colorFirstNeighbor()      -> take the first step of the spiral
 *     spiralFillMap()           -> walk in a spiral, coloring hexes as we go
 *     resolveRemainingHexes()   -> safety net so the whole map is fully colored
 *
 * The color chosen for each land hex comes from `pickColor()`, which weights the
 * seven terrains by `shareScore()` (how balanced/reachable a color is), which in
 * turn relies on `workDistance()` / `pathCost()` (how expensive it is to reach a
 * color from the current hex).
 */
(function (TM) {
    'use strict';

    const { TERRAINS, WATER, RIVER, UNASSIGNED, colorDistance, bgaSymbol } = TM.colors;
    const { rowWidth, outOfBounds, nextHex } = TM.geometry;

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Cost of a path of transit colors. Direct port of Python path_cost.
    function pathCost(transit) {
        const dest = transit[transit.length - 1];

        const hasRun = (len) => {
            let run = 0;
            for (let i = 0; i < transit.length; i++) {
                run = transit[i] === WATER ? run + 1 : 0;
                if (run >= len) return true;
            }
            return false;
        };

        let work;
        if (hasRun(4)) work = dest === 'blu' ? 308 : 350;
        else if (hasRun(3)) work = dest === 'blu' ? 154 : 210;
        else if (hasRun(2)) work = dest === 'blu' ? 70 : 126;
        else if (hasRun(1)) work = dest === 'blu' ? 14 : 42;
        else work = 0;

        for (let tcn = 0; tcn < transit.length; tcn++) {
            const current = transit[tcn];
            let trans = 42 * colorDistance(dest, current);
            if (dest === 'red') {
                if (current !== 'red' && current !== WATER && current !== RIVER) {
                    trans = (trans + 70) / 2;
                }
            }
            if (dest === 'yel') {
                if (current !== 'yel' && current !== 'red' && current !== 'bro'
                    && current !== WATER && current !== RIVER
                    && (tcn === 0 || (transit[tcn - 1] !== WATER && transit[tcn - 1] !== RIVER))) {
                    trans = (trans + 77) / 2;
                }
            }
            if (dest === 'bla') trans = 5 * trans / 6;
            if (dest === 'gry') trans = transit.length === 2 ? 9 * trans / 7 : 5 * trans / 7;
            work += trans;
        }
        return work;
    }

    class TerrainMapGenerator {
        /**
         * @param {number} height number of rows
         * @param {number} width  number of hexes in the longer rows
         * @param {number} form   0 => top row longer, 1 => top row shorter
         * @param {Array}  rivers list of river coordinates ([x, y] pairs or "x,y" strings)
         */
        constructor(height, width, form, rivers) {
            this.height = height;
            this.width = width;
            this.form = form;
            this.rivers = new Set((rivers || []).map(r => Array.isArray(r) ? r[0] + ',' + r[1] : String(r)));
            this.map = {}; // "x,y" -> color string
        }

        key(x, y) { return x + ',' + y; }
        get(x, y) { return this.map[this.key(x, y)]; }
        set(x, y, c) { this.map[this.key(x, y)] = c; }

        outOfBounds(x, y) { return outOfBounds(x, y, this.width, this.height, this.form); }
        nextHex(x, y, dir) { return nextHex(x, y, dir, this.form); }

        // Number of hexes of a given color currently on the map.
        stock(color) {
            let n = 0;
            for (const k in this.map) if (this.map[k] === color) n++;
            return n;
        }

        // True if any of the six neighbors of `hexf` already has `color`.
        hasNeighborOfColor(hexf, color) {
            for (let dir = 0; dir < 6; dir++) {
                const [nx, ny] = this.nextHex(hexf[0], hexf[1], dir);
                if (!this.outOfBounds(nx, ny) && this.get(nx, ny) === color) return true;
            }
            return false;
        }

        // Cheapest path cost (up to length 4) from `hexf` to any hex of `color`.
        // Explores spiral-ish paths and keeps the minimum pathCost seen.
        cheapestReachCost(hexf, color, maximal) {
            let work = maximal;
            for (let pathLength = 2; pathLength <= 4; pathLength++) {
                if (work < 42 * pathLength) break;
                const path = new Array(pathLength).fill(-1);
                for (let initDir = 0; initDir < 6; initDir++) {
                    path[0] = initDir;
                    const steerCount = Math.pow(3, pathLength - 1);
                    for (let steers = 0; steers < steerCount; steers++) {
                        for (let step = 1; step < pathLength; step++) {
                            path[step] = ((((Math.floor(steers / Math.pow(3, step - 1)) % 3) - 1 + path[step - 1]) % 6) + 6) % 6;
                        }
                        let hx = hexf[0], hy = hexf[1];
                        let legal = true;
                        const transit = [];
                        for (let d = 0; d < path.length; d++) {
                            [hx, hy] = this.nextHex(hx, hy, path[d]);
                            if (this.outOfBounds(hx, hy)) { legal = false; break; }
                            const c = this.get(hx, hy);
                            transit.push(c === RIVER ? WATER : c);
                        }
                        if (legal && transit[transit.length - 1] === color) {
                            const pw = pathCost(transit);
                            if (pw < work) work = pw;
                        }
                    }
                }
            }
            return work;
        }

        // Measure of work required to reach the nearest hex of `color`.
        workDistance(hexf, color) {
            const maximal = 210;
            if (this.stock(color) === 0) return maximal;
            if (this.hasNeighborOfColor(hexf, color)) return 0;
            return this.cheapestReachCost(hexf, color, maximal);
        }

        shareScore(hexf, color) {
            let averageStock = 0;
            for (const c of TERRAINS) averageStock += this.stock(c);
            averageStock = averageStock / 7;
            const quantityValue = 4 + this.stock(color) - averageStock;
            if (quantityValue <= 0) return 0;
            return Math.floor(this.workDistance(hexf, color) / quantityValue);
        }

        // Weighted random pick of a terrain color for `hexf`.
        // power = 1 for the first step, 2 for all further steps (matches Python).
        pickColor(hexf, power) {
            const acc = [];
            let total = 0;
            for (const color of TERRAINS) {
                let score = this.shareScore(hexf, color);
                if (power === 2) score = score * score;
                if (score < 0) score = 0;
                total += score;
                acc.push(total);
            }
            if (total <= 0) return TERRAINS[randInt(0, TERRAINS.length - 1)];
            const dice = randInt(0, total - 1);
            for (let i = 0; i < TERRAINS.length; i++) {
                if (dice < acc[i]) return TERRAINS[i];
            }
            return TERRAINS[TERRAINS.length - 1];
        }

        hasUnfinished() {
            for (const k in this.map) {
                if (this.map[k] === UNASSIGNED || this.map[k] === RIVER) return true;
            }
            return false;
        }

        /* ---------------- createMap, broken into readable steps ---------------- */

        // Step 1: rivers -> RIVER marker, every other hex -> UNASSIGNED.
        initializeGrid() {
            this.map = {};
            for (let row = 0; row < this.height; row++) {
                for (let col = 0; col < rowWidth(this.width, row, this.form); col++) {
                    this.set(col, row, this.rivers.has(this.key(col, row)) ? RIVER : UNASSIGNED);
                }
            }
        }

        // Step 2: pick a random hex and color it (water if it is a river). Returns it.
        placeRandomStartHex() {
            const startY = randInt(0, this.height - 1);
            const startX = randInt(0, rowWidth(this.width, startY, this.form) - 1);
            const cur = [startX, startY];
            if (this.get(cur[0], cur[1]) !== RIVER) {
                this.set(cur[0], cur[1], TERRAINS[randInt(0, 6)]);
            } else {
                this.set(cur[0], cur[1], WATER);
            }
            return cur;
        }

        // Step 3: take a random first step from `start`, color the hex we land on,
        // and set up the direction the spiral will continue with.
        // Returns { cur, dir } used to seed the spiral walk.
        colorFirstNeighbor(start) {
            let dir = randInt(0, 5);
            const cur = this.nextHex(start[0], start[1], dir);
            if (this.outOfBounds(cur[0], cur[1])) {
                // pass
            } else if (this.get(cur[0], cur[1]) === RIVER) {
                this.set(cur[0], cur[1], WATER);
            } else {
                this.set(cur[0], cur[1], this.pickColor(cur, 1));
            }
            dir = (dir + 2) % 6;
            return { cur, dir };
        }

        // Rotate `dir` clockwise until it points at an open (unassigned/river) hex
        // or we have tried all six directions. Returns the chosen direction.
        steerToNextOpenHex(cur, dir) {
            let rotations = 0;
            while (rotations < 6) {
                const [nx, ny] = this.nextHex(cur[0], cur[1], dir);
                if (this.outOfBounds(nx, ny)) break;
                const c = this.get(nx, ny);
                if (c === UNASSIGNED || c === RIVER) break;
                dir = ((dir - 1) % 6 + 6) % 6;
                rotations++;
            }
            return dir;
        }

        // Color `cur` if it is still open: river -> water, unassigned -> picked color.
        colorHexIfOpen(cur) {
            if (this.outOfBounds(cur[0], cur[1])) {
                // pass
            } else if (this.get(cur[0], cur[1]) === RIVER) {
                this.set(cur[0], cur[1], WATER);
            } else if (this.get(cur[0], cur[1]) === UNASSIGNED) {
                this.set(cur[0], cur[1], this.pickColor(cur, 2));
            }
        }

        // Step 4: walk in a spiral, coloring each hex, until nothing is unfinished.
        spiralFillMap(cur, dir) {
            const limit = this.width * this.height * 50 + 1000;
            let guard = 0;
            while (this.hasUnfinished() && guard++ < limit) {
                dir = this.steerToNextOpenHex(cur, dir);
                cur = this.nextHex(cur[0], cur[1], dir);
                this.colorHexIfOpen(cur);
                dir = (dir + 1) % 6;
            }
        }

        // Step 5: safety fallback so any layout ends up fully colored.
        resolveRemainingHexes() {
            for (const k in this.map) {
                if (this.map[k] === RIVER) {
                    this.map[k] = WATER;
                } else if (this.map[k] === UNASSIGNED) {
                    const [x, y] = k.split(',').map(Number);
                    this.map[k] = this.pickColor([x, y], 2);
                }
            }
        }

        // Fill the whole map with colors. Port of Python create_map (without prints).
        generate() {
            this.initializeGrid();
            const start = this.placeRandomStartHex();
            const { cur, dir } = this.colorFirstNeighbor(start);
            this.spiralFillMap(cur, dir);
            this.resolveRemainingHexes();
            return this.map;
        }

        // BGA map-file format string. Port of Python bga_format.
        bgaFormat() {
            const rows = [];
            for (let row = 0; row < this.height; row++) {
                const cells = [];
                for (let col = 0; col < rowWidth(this.width, row, this.form); col++) {
                    cells.push(bgaSymbol(this.get(col, row)));
                }
                rows.push(cells.join(','));
            }
            return rows.join('\n');
        }

        // Plain 2D array of colors, row by row (variable-length rows).
        toGrid() {
            const grid = [];
            for (let row = 0; row < this.height; row++) {
                const line = [];
                for (let col = 0; col < rowWidth(this.width, row, this.form); col++) {
                    line.push(this.get(col, row));
                }
                grid.push(line);
            }
            return grid;
        }
    }

    TM.TerrainMapGenerator = TerrainMapGenerator;
    TM.pathCost = pathCost;
})(window.TM = window.TM || {});
