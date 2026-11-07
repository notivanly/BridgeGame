# Load Limit | Bridge Engineering Lab (3D)

Design a bridge across a gorge, then test it in 3D with real vehicles, from a bicycle to a 200 tonne train. Beams have a cost, a strength and a way to fail: they turn amber, then red, then snap.

Everything lives in one file, `index.html`. No build step, no dependencies, no folders.

## Put it on GitHub Pages

1. Open your `BridgeGame` repository on GitHub.
2. Choose **Add file > Upload files** and drag in `index.html`. It replaces your current `index.html` because the name is the same.
3. Commit. After about a minute, hard-refresh your page (Ctrl+Shift+R).

Your old files (`landing.html`, `about.html`, scripts and stylesheets) are no longer linked. You can leave them or delete them.

## How it works in 3D

You draw one side of the bridge on the side view. The game builds a real 3D structure from it: two parallel trusses, floor beams across the deck, and diagonal bracing in each side panel. Switch to the 3D view and drag to orbit the camera.

That makes 3D effects real:

- **Wind** pushes sideways. With full bracing the structure barely moves; with deck-only or no bracing it sways metres.
- **Lanes**: put a heavy vehicle in the left or right lane and one truss carries more of the load (torsion).
- **Bracing level** and **deck width** change the cost and the lateral stability.

## Playing

- **Materials**: Wood, Steel, Concrete, Cable (tension only, pre-tensioned), Carbon Fiber, with the original per-metre prices.
- **Build**: drag from an anchor (red triangle) to draw beams. Tools: Delete, Junction screw, Symmetry, Grid snap, Copy left half, Undo, Reset. Templates: Simple beam, Pratt, Warren, Arch, Suspension.
- **Test**: press Test, then spawn any of 11 vehicles. Auto-spawn, slow motion, 0.5x to 2x time, Force Diagram (blue tension, orange compression).
- **Disasters**: Wind burst, Earthquake, Rain storm.
- **Judging**: Success needs a clean crossing and a sag under 1.5 m. A crossing with broken beams is Damaged, a fall is Collapsed, and a sag over 1.5 m is Too flexible.
- **Challenges** (with budgets and best scores), **4 lessons**, a **quiz**, **achievements**, an **engineering report** with a safety factor, **CSV export**, **save and compare designs**, and a how-to-play tour.

## The engineering

- Every beam is a pin-jointed bar carrying axial force `F = (EA/L) x elongation`.
- Compression capacity is the smaller of the yield load and the **Euler buckling load** `pi^2 E I / L^2`, so long thin beams buckle first. A tube (steel, carbon) is far stiffer than a solid section (wood, concrete).
- **Static analysis** is the 3D direct stiffness method (`K u = F`), used for the report. **The test** is a dynamic simulation with real masses, moving vehicle loads, and progressive collapse when a bar's capacity is exceeded.
- Cables only pull, and are pre-tensioned.

I checked the engine against exact results: a 3D tripod's leg forces to nine digits, global equilibrium (reactions equal the weight), the dynamic simulation settling onto the static solution to 0.1 %, Euler buckling loads, mechanism detection, and the wind sway comparison (1.7 cm with full bracing, about 4 m without).

## Honest limits

- Stiffness is scaled to 1/50 of real so sag is visible. Strengths are realistic.
- Vehicles are moving point loads. Wind, rain and earthquakes are simplified.
- Static analysis is unavailable for designs with slack cables (a linear solver cannot handle tension-only members that start slack). The test still works.
- Pin-jointed bars have no bending stiffness, so a plain chain of beams acts like a rope. The 1.5 m sag limit is why that does not win.
- Not intended for structural design or safety decisions.

## Tweak it

- Materials, vehicles and templates: the `MATERIALS`, `VEHICLES` and `TEMPLATES` objects at the top of the first `<script>`.
- Challenges: the `CH` array in the second `<script>`.
- Sag limit: search for `1.5` in `checkResult`.
- Source link in the header: the `pill` link.
