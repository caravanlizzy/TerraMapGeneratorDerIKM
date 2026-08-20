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

    const LAND_COLOR = '#faedbf'; // default (bright) beige for land hexes

    const state = {
        width: 13,
        height: 9,
        form: 0,
        rivers: new Set(),   // "x,y" of river hexes (edit mode)
        mode: 'edit',        // 'edit' | 'colored'
        map: null,           // TM.TerrainMapGenerator instance (colored mode)
        selected: [],        // [[x,y], ...] land hexes selected for swapping
        qualityReport: null  // last generateAccepted() report (colored mode)
    };

    const key = (x, y) => x + ',' + y;

    /* ---------- rendering ---------- */

    function editCell(x, y) {
        const river = state.rivers.has(key(x, y));
        return {
            fill: river ? '#4aa9e8' : LAND_COLOR,
            stroke: river ? '#0b3c5d' : '#222',
            strokeWidth: 1,
            label: x + ',' + y,
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
            // The map changed, so the shown quality metrics are now stale until
            // the user re-evaluates.
            if (state.qualityReport) state.qualityReport.stale = true;
        }
        renderCurrent();
    }

    function renderCurrent() {
        if (state.mode === 'colored' && state.map) {
            TM.renderer.render(svg, {
                width: state.width, height: state.height, form: state.form,
                cellFor: coloredCell, onClick: onColoredClick
            });
            renderQualityReport(state.qualityReport);
        } else {
            TM.renderer.render(svg, {
                width: state.width, height: state.height, form: state.form,
                cellFor: editCell, onClick: onEditClick
            });
            renderQualityReport(null);
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
        // The BGA format only exists once terrain colors are generated.
        $('copyBga').disabled = !colored;
        // Layout-editing controls are only meaningful in edit mode.
        $('randomRivers').disabled = colored;
        // Re-evaluating only makes sense once a colored map exists.
        $('reevaluate').style.display = colored ? 'inline-block' : 'none';
        // Make the primary action self-describing for the current mode.
        $('generateColors').textContent = colored ? 'Regenerate colors' : 'Generate colors';
        // Clarify what the export buttons currently act on.
        $('exportHint').textContent = colored
            ? 'Exporting the generated terrain map. SVG/PNG capture the current view; JSON and BGA include the colors.'
            : 'Exporting the current layout. Generate colors to also export the terrain map and BGA format.';
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
        state.qualityReport = null;
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
        state.qualityReport = null;
        state.mode = 'edit';
        $('width').value = state.width;
        $('height').value = state.height;
        $('form').value = state.form;
        renderCurrent();
    }

    function readQualityCriteria() {
        const def = TM.DEFAULT_QUALITY_CRITERIA;
        const num = (id, fallback, min) => {
            const v = +$(id).value;
            return Number.isFinite(v) && v >= min ? v : fallback;
        };
        const criteria = {
            maxColorImbalance: num('maxColorImbalance', def.maxColorImbalance, 0),
            maxRiverImbalance: num('maxRiverImbalance', def.maxRiverImbalance, 0),
            maxTries: Math.min(1000, Math.round(num('maxTries', def.maxTries, 1)))
        };
        $('maxColorImbalance').value = criteria.maxColorImbalance;
        $('maxRiverImbalance').value = criteria.maxRiverImbalance;
        $('maxTries').value = criteria.maxTries;
        return criteria;
    }

    function round1(n) { return Math.round(n * 10) / 10; }

    // A metric row: the measured value, the configured limit, and a plain-English
    // explanation of what the number actually means (0 is always "perfectly even").
    function metricRow(label, value, max, explanation) {
        return '<div class="metric">'
            + '<div class="metric-line">'
            + '<span class="metric-name">' + label + '</span>'
            + '<span class="metric-value">' + round1(value) + '</span>'
            + '<span class="metric-max">/ max ' + max + '</span>'
            + '</div>'
            + '<div class="metric-explain">' + explanation + '</div>'
            + '</div>';
    }

    // The two headline imbalance metrics, each with its value and explanation.
    // Shown whenever a map is generated (accepted or best-effort) so the exact
    // imbalance values are always printed for a successful map.
    function metricsHtml(ev, criteria) {
        return '<div class="quality-metrics">'
            + metricRow('Color imbalance', ev.colorImbalance, criteria.maxColorImbalance,
                'How far the most over- or under-represented terrain is from an even '
                + 'share of the land hexes. 0 means every color got the same number of hexes.')
            + metricRow('River imbalance', ev.riverImbalance, criteria.maxRiverImbalance,
                'How much more river access the luckiest terrain has than the average '
                + 'terrain. 0 means every color has equal access to water.')
            + '</div>';
    }

    function renderQualityReport(report) {
        const el = $('qualityReport');
        if (!report) {
            el.style.display = 'none';
            el.innerHTML = '';
            return;
        }
        const ev = report.evaluation;
        const metrics = metricsHtml(ev, report.criteria);
        const staleNote = report.stale
            ? '<div class="quality-stale">Map edited since this report \u2013 press '
                + '<b>Re-evaluate map</b> to refresh the values.</div>'
            : '';

        let html;
        if (report.reevaluated) {
            html = (report.passed
                ? '<div class="quality-head ok">Re-evaluated after edits \u2013 map passes all thresholds.</div>'
                : '<div class="quality-head bad">Re-evaluated after edits \u2013 map fails the thresholds.</div>')
                + metrics;
            if (!report.passed && report.reasons.length) {
                html += '<div class="quality-fails-title">Issues:</div><ul class="quality-fails">'
                    + report.reasons.map(r => '<li>' + r + '</li>').join('')
                    + '</ul>';
            }
            el.className = 'quality-report ' + (report.passed ? 'ok' : 'bad');
            el.innerHTML = staleNote + html;
            el.style.display = 'block';
            return;
        }

        if (report.accepted) {
            html = '<div class="quality-head ok">Accepted map on try '
                + report.tries + ' of ' + report.criteria.maxTries + '.</div>'
                + metrics;
        } else {
            html = '<div class="quality-head bad">No map passed after '
                + report.tries + ' tries \u2013 showing the best attempt (#'
                + (report.best ? report.best.attempt : '?') + ').</div>'
                + metrics;
            const lastFew = report.failures.slice(-5);
            if (lastFew.length) {
                html += '<div class="quality-fails-title">Recent failures:</div><ul class="quality-fails">'
                    + lastFew.map(f => '<li>Try ' + f.attempt + ': ' + f.reasons.join('; ') + '</li>').join('')
                    + '</ul>';
            }
        }
        el.className = 'quality-report ' + (report.accepted ? 'ok' : 'bad');
        el.innerHTML = staleNote + html;
        el.style.display = 'block';
    }

    function generateColors() {
        readDimensions();
        const criteria = readQualityCriteria();
        const rivers = [...state.rivers].map(s => s.split(',').map(Number));
        const map = new TM.TerrainMapGenerator(state.height, state.width, state.form, rivers);
        const report = map.generateAccepted(criteria);
        state.map = map;
        state.qualityReport = report;
        state.selected = [];
        state.mode = 'colored';
        renderCurrent();
    }

    // Re-check the current map (including any manual hex swaps) against the
    // quality thresholds, without generating a new map.
    function reevaluate() {
        if (state.mode !== 'colored' || !state.map) return;
        const criteria = readQualityCriteria();
        const evaluation = state.map.evaluate();
        const check = TM.evaluateQuality(evaluation, criteria);
        state.qualityReport = {
            reevaluated: true,
            passed: check.passed,
            reasons: check.reasons,
            evaluation,
            criteria
        };
        renderCurrent();
    }

    function backToLayout() {
        state.mode = 'edit';
        state.map = null;
        state.selected = [];
        state.qualityReport = null;
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
        $('reevaluate').onclick = reevaluate;

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
