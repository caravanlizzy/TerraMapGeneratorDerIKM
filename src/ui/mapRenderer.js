/*
 * SVG map renderer. Pure UI: it knows nothing about game rules and simply
 * draws hexes described by a `cellFor(x, y)` callback.
 *
 * cellFor(x, y) must return:
 *   { fill, stroke?, strokeWidth?, selected?, label?, labelColor?,
 *     borderEdges?, borderColor?, borderWidth? }
 *
 * borderEdges is a list of edge indices (0..5) to emphasize with a thicker
 * line (used to highlight the water/land boundary). Edge i connects hex
 * vertex i and vertex i+1.
 */
(function (TM) {
    'use strict';

    const NS = 'http://www.w3.org/2000/svg';
    const { center, hexPoints, hexVertices, canvasSize, rowWidth } = TM.geometry;

    function render(svg, opts) {
        const { width, height, form, cellFor, onClick, defs } = opts;
        const size = canvasSize(width, height, form);

        svg.setAttribute('width', size.width);
        svg.setAttribute('height', size.height);
        svg.setAttribute('viewBox', '0 0 ' + size.width + ' ' + size.height);
        svg.innerHTML = '';

        if (defs) {
            const d = document.createElementNS(NS, 'defs');
            d.innerHTML = defs;
            svg.appendChild(d);
        }

        // Emphasized edges are collected and drawn last so they always sit on
        // top of neighboring hex fills.
        const overlay = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < rowWidth(width, y, form); x++) {
                const { cx, cy } = center(x, y, form);
                const info = cellFor(x, y) || {};

                const g = document.createElementNS(NS, 'g');
                const p = document.createElementNS(NS, 'polygon');
                p.setAttribute('points', hexPoints(cx, cy));
                p.setAttribute('fill', info.fill || '#ccc');
                p.setAttribute('stroke', info.selected ? '#ff9800' : (info.stroke || '#333'));
                p.setAttribute('stroke-width', info.selected ? 4 : (info.strokeWidth || 1));
                p.setAttribute('class', 'hex');
                p.dataset.x = x;
                p.dataset.y = y;
                if (onClick) p.addEventListener('click', () => onClick(x, y));
                g.appendChild(p);

                if (info.borderEdges && info.borderEdges.length) {
                    const verts = hexVertices(cx, cy);
                    info.borderEdges.forEach(ei => {
                        const a = verts[ei];
                        const b = verts[(ei + 1) % 6];
                        overlay.push({ a, b, color: info.borderColor || '#0b3c5d', width: info.borderWidth || 5 });
                    });
                }

                if (info.label) {
                    const t = document.createElementNS(NS, 'text');
                    t.setAttribute('x', cx);
                    t.setAttribute('y', cy);
                    t.setAttribute('class', 'label');
                    t.setAttribute('fill', info.labelColor || '#222');
                    t.textContent = info.label;
                    g.appendChild(t);
                }

                svg.appendChild(g);
            }
        }

        overlay.forEach(e => {
            const line = document.createElementNS(NS, 'line');
            line.setAttribute('x1', e.a[0].toFixed(2));
            line.setAttribute('y1', e.a[1].toFixed(2));
            line.setAttribute('x2', e.b[0].toFixed(2));
            line.setAttribute('y2', e.b[1].toFixed(2));
            line.setAttribute('stroke', e.color);
            line.setAttribute('stroke-width', e.width);
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('class', 'river-border');
            svg.appendChild(line);
        });

        return size;
    }

    TM.renderer = { render };
})(window.TM = window.TM || {});
