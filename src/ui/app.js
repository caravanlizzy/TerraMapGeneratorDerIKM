/*
 * Application controller: wires the DOM controls to the services and renderer.
 *
 * Two modes:
 *   - 'edit'    : draw the river layout (click toggles land/river).
 *   - 'colored' : terrain colors have been generated; click exactly two land
 *                 hexes to swap them.
 */
(function (TM) {
    'use strict';

    const { WATER, DISPLAY_COLORS } = TM.colors;

    const svg = document.getElementById('map');
    const $ = (id) => document.getElementById(id);

    const LAND_COLOR = '#f5e6b0'; // default (bright) beige for land hexes

    const state = {
        width: 13,
        height: 9,
        form: 0,
        rivers: new Set(),   // "x,y" of river hexes (edit mode)
        mode: 'edit',        // 'edit' | 'colored'
        map: null,           // TM.TerrainMapGenerator instance (colored mode)
        selected: []         // [[x,y], ...] land hexes selected for swapping
    };

    const key = (x, y) => x + ',' + y;

    /* ---------- rendering ---------- */

    function editCell(x, y) {
        const river = state.rivers.has(key(x, y));
        return {
            fill: river ? '#4aa9e8' : LAND_COLOR,
            stroke: river ? '#0b3c5d' : '#1b5e20',
            strokeWidth: 1,
            label: (x + 1) + ',' + (y + 1),
            labelColor: river ? '#fff' : '#222'
        };
    }

    function coloredCell(x, y) {
        const c = state.map.get(x, y);
        const selected = state.selected.some(s => s[0] === x && s[1] === y);
        return {
            fill: DISPLAY_COLORS[c] || '#ccc',
            selected: selected
        };
    }

    function onEditClick(x, y) {
        const k = key(x, y);
        if (state.rivers.has(k)) state.rivers.delete(k);
        else state.rivers.add(k);
        renderCurrent();
    }

    function onColoredClick(x, y) {
        const c = state.map.get(x, y);
        if (c === WATER) return; // only land hexes can be swapped

        const idx = state.selected.findIndex(s => s[0] === x && s[1] === y);
        if (idx >= 0) {
            state.selected.splice(idx, 1); // click again to deselect
            renderCurrent();
            return;
        }

        state.selected.push([x, y]);
        if (state.selected.length === 2) {
            const [a, b] = state.selected;
            const ca = state.map.get(a[0], a[1]);
            const cb = state.map.get(b[0], b[1]);
            state.map.set(a[0], a[1], cb);
            state.map.set(b[0], b[1], ca);
            state.selected = [];
        }
        renderCurrent();
    }

    function renderCurrent() {
        if (state.mode === 'colored' && state.map) {
            TM.renderer.render(svg, {
                width: state.width, height: state.height, form: state.form,
                cellFor: coloredCell, onClick: onColoredClick
            });
        } else {
            TM.renderer.render(svg, {
                width: state.width, height: state.height, form: state.form,
                cellFor: editCell, onClick: onEditClick
            });
        }
        updateStats();
        updateModeUi();
    }

    /* ---------- stats & mode UI ---------- */

    function totalHexes() {
        return TM.layout.totalHexes(state.width, state.height, state.form);
    }

    function updateStats() {
        const total = totalHexes();
        const rivers = state.rivers.size;
        $('statW').textContent = state.width;
        $('statH').textContent = state.height;
        $('statForm').textContent = state.form;
        $('statTotal').textContent = total;
        $('statLand').textContent = total - rivers;
        $('statRiver').textContent = rivers;
        $('landSwatch').style.background = LAND_COLOR;
    }

    function updateModeUi() {
        const colored = state.mode === 'colored';
        $('editHint').style.display = colored ? 'none' : 'block';
        $('swapHint').style.display = colored ? 'block' : 'none';
        $('backToLayout').style.display = colored ? 'inline-block' : 'none';
        $('copyBga').disabled = !colored;
        // Layout-editing controls are only meaningful in edit mode.
        $('randomRivers').disabled = colored;
        if (colored) {
            const sel = state.selected.length;
            $('swapStatus').textContent = sel === 0
                ? 'Click two land hexes to swap them.'
                : 'One hex selected \u2013 click a second land hex to swap.';
        }
    }

    /* ---------- actions ---------- */

    function readDimensions() {
        state.width = Math.max(1, Math.min(40, +$('width').value || 13));
        state.height = Math.max(1, Math.min(40, +$('height').value || 9));
        state.form = +$('form').value === 1 ? 1 : 0;
        $('width').value = state.width;
        $('height').value = state.height;
    }

    function generateMap() {
        readDimensions();
        state.rivers.clear();
        state.map = null;
        state.selected = [];
        state.mode = 'edit';
        renderCurrent();
    }

    function applyLayout(layout) {
        state.width = layout.width;
        state.height = layout.height;
        state.form = layout.form;
        state.rivers = new Set(layout.rivers.map(r => key(r[0], r[1])));
        state.map = null;
        state.selected = [];
        state.mode = 'edit';
        $('width').value = state.width;
        $('height').value = state.height;
        $('form').value = state.form;
        renderCurrent();
    }

    function generateColors() {
        readDimensions();
        const rivers = [...state.rivers].map(s => s.split(',').map(Number));
        const map = new TM.TerrainMapGenerator(state.height, state.width, state.form, rivers);
        map.generate();
        state.map = map;
        state.selected = [];
        state.mode = 'colored';
        renderCurrent();
    }

    function backToLayout() {
        state.mode = 'edit';
        state.map = null;
        state.selected = [];
        renderCurrent();
    }

    /* ---------- export helpers ---------- */

    function download(name, data, type) {
        const blob = new Blob([data], { type });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    function exportedSvg() {
        const clone = svg.cloneNode(true);
        clone.querySelectorAll('.label').forEach(e => e.textContent = '');
        clone.querySelectorAll('.hex').forEach(e => {
            e.setAttribute('stroke', '#333');
            e.setAttribute('stroke-width', '1');
        });
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
    }

    function mapData() {
        const data = {
            width: state.width,
            height: state.height,
            form: state.form,
            riverCoordinates: [...state.rivers].map(s => s.split(',').map(Number))
        };
        if (state.mode === 'colored' && state.map) {
            data.colors = state.map.toGrid();
            data.bga = state.map.bgaFormat();
        }
        return data;
    }

    function feedback(button, text) {
        const old = button.textContent;
        button.textContent = text;
        setTimeout(() => (button.textContent = old), 900);
    }

    function exportPng() {
        const src = exportedSvg();
        const blob = new Blob([src], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            const scale = 2;
            c.width = svg.viewBox.baseVal.width * scale;
            c.height = svg.viewBox.baseVal.height * scale;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            c.toBlob(b => download('terra-mystica-map.png', b, 'image/png'));
        };
        img.src = url;
    }

    /* ---------- wire up controls ---------- */

    function init() {
        // Populate the preset dropdown.
        const presetSelect = $('preset');
        Object.keys(TM.layout.PRESET_LABELS).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = TM.layout.PRESET_LABELS[name];
            presetSelect.appendChild(opt);
        });

        $('newMap').onclick = generateMap;
        $('generateColors').onclick = generateColors;
        $('backToLayout').onclick = backToLayout;

        $('preset').onchange = (e) => {
            const name = e.target.value;
            if (!name) return;
            const layout = TM.layout.getPreset(name);
            if (layout) applyLayout(layout);
            e.target.value = '';
        };

        $('form').onchange = () => { readDimensions(); renderCurrent(); };

        $('randomRivers').onclick = () => {
            readDimensions();
            const layout = TM.layout.randomizeRivers(state.width, state.height, state.form);
            applyLayout(layout);
        };

        $('exportSvg').onclick = () => download('terra-mystica-map.svg', exportedSvg(), 'image/svg+xml');
        $('exportPng').onclick = exportPng;
        $('exportJson').onclick = () => download('terra-mystica-map.json', JSON.stringify(mapData(), null, 2), 'application/json');
        $('copyJson').onclick = async () => {
            await navigator.clipboard.writeText(JSON.stringify(mapData()));
            feedback($('copyJson'), 'Copied!');
        };
        $('copyBga').onclick = async () => {
            if (state.mode !== 'colored' || !state.map) return;
            await navigator.clipboard.writeText(state.map.bgaFormat());
            feedback($('copyBga'), 'Copied!');
        };

        // Initial render.
        readDimensions();
        renderCurrent();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(window.TM = window.TM || {});
