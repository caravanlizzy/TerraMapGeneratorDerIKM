# Terra Mystica Map Layout Tool

A browser tool to design a Terra Mystica river layout, generate a terrain-color
distribution for it, and fine-tune the result by swapping hexes.

The color-distribution logic is a self-contained JavaScript port of
[ikmMaierBTUCS/Terra-Mystica-Map-Generator](https://github.com/ikmMaierBTUCS/Terra-Mystica-Map-Generator).
It uses the same "GitHub format": offset rows where every second row is one hex
shorter, a `form` flag (0 = top row longer, 1 = top row shorter), `(x, y)` =
`(column, row)` coordinates, and the BGA map-file symbols (`R Y U K B G S I`).
No external/runtime dependencies are required.

## Running

Just open `index.html` in a browser (double-click it, or drag it into a browser
window). Everything runs locally from `file://`; no server or build step is
needed.

## How to use

1. Set **Width**, **Height** and **Form**, or pick a **Preset**
   (Original, Fire & Ice, Fjords, Loon Lakes, Onion, Archipelago).
2. Draw the river layout: click a hex to toggle **land / river**
   (or use *Random rivers*).
3. Click **Generate colors** to distribute the seven terrain colors over the
   land hexes using the ported algorithm.
4. In the colored view, click **exactly two land hexes** to swap them
   (water hexes cannot be swapped; click a selected hex again to deselect).
5. Export the result as **SVG / PNG / JSON**, or copy the **BGA format**.

## Project structure

The code is modular and separates UI from services.

```
index.html                  # markup + wiring of the script modules
styles.css                  # page styles (extracted from index.html)
src/
  services/                 # pure logic, no DOM
    colors.js               # terrain colors, distances, BGA symbols
    hexGeometry.js          # offset-row grid, neighbors, pixel geometry
    terrainMapGenerator.js  # TerrainMapGenerator: color distribution + BGA export
    layoutGenerator.js      # river presets + random river generator
  ui/                       # presentation, depends on services
    mapRenderer.js          # renders hexes to SVG (no game rules)
    app.js                  # controller: state, controls, swap, exports
test/
  index.html                # browser test page (open it to run the suite)
  tests.js                  # service-layer + UI integration assertions
```

All modules attach to a single global `window.TM` namespace and are loaded as
plain scripts (in dependency order), so the tool works both from `file://` and
when served.

## Tests

The tests run in the browser – no Node, npm install, or build step required.
Just open `test/index.html` (double-click it, or drag it into a browser). It
loads the same `src/` scripts as the app and reports `N passed, M failed` on the
page (and in the browser console).
