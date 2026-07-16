# Load Limit — Bridge Engineering Lab

> An open-source, browser-based structural engineering simulator that models 2D truss bridge behavior under dynamic vehicular loading.

**[▶ Play Live](https://notivanly.github.io/BridgeGame/)** · **[Engineering Docs](https://notivanly.github.io/BridgeGame/about.html)** · **[Leave Feedback](https://notivanly.github.io/BridgeGame/feedback.html)**

---

## Overview

Load Limit lets users design bridge structures using real engineering materials (wood, steel, concrete, cable, carbon fiber), then stress-test them with increasingly heavy vehicles — from a 15kg bicycle to a 200,000kg train. The simulation uses **Position-Based Dynamics** with Verlet integration and iterative constraint relaxation to model realistic structural deformation and failure.

The goal is to make structural engineering concepts — load paths, tension vs compression, truss geometry, resonance, material selection — accessible and intuitive without requiring any engineering prerequisites.

---

## Features

### Physics Engine
- **Position-Based Dynamics** (Verlet integration, 60fps)
- Iterative constraint relaxation (8 passes/frame)
- Sag-based failure detection with material-specific thresholds
- Tension/compression tracking per beam member
- Resonance accumulation model (Tacoma Narrows-style)
- Foundation cracking under overload
- Wind, earthquake, and rain stress events

### Materials
| Material | Cost/m | Strength | Notes |
|---|---|---|---|
| Wood | $14 | ★★☆☆☆ | Cheap, brittle |
| Concrete | $68 | ★★★☆☆ | Heavy, moderate |
| Steel | $135 | ★★★★★ | Standard structural |
| Cable | $45 | ★★★☆☆ | Tension only |
| Carbon Fiber | $400 | ★★★★★ | Ultra-light, expensive |

### Vehicles
Bicycle (15kg) → Sedan (1,400kg) → Van → Truck → Bus → Semi (18,000kg) → Tank (60,000kg) → Train (200,000kg)

### Engineering Tools
- Force diagram overlay (tension/compression arrows)
- Beam inspector (stress %, mode, cost per segment)
- Engineering report generator (printable PDF)
- Stress data CSV export
- Design comparison table
- Bridge templates (Pratt, Warren, Arch, Suspension)

### Levels
1. **Narrow Gorge** — 16m span, $120k budget
2. **River Crossing** — 24m span, $300k budget
3. **Grand Canyon** — 28m span with mid-span pier, $500k budget
4. **City Bridge** — Repair a damaged bridge with pre-built locked sections
5. **Quake Zone** — Auto-earthquakes every 30 seconds during testing

---

## Simulation Methodology

### Verlet Integration
```
x(t+Δt) = x(t) + (x(t) − x(t−Δt)) · damping + F · Δt²
damping = 0.96, Δt = 1/60s, gravity = 0.2 px/frame²
```

### Constraint Relaxation
Each beam is a distance constraint between two joints. Per-frame:
```
correction = (|p_B − p_A| − L₀) / |p_B − p_A| × 0.5
p_A += correction × (p_B − p_A)  [if free]
p_B -= correction × (p_B − p_A)  [if free]
```

### Failure Criterion
```
sag = max(y_joint(t) − y_joint(settled))
failure if: sag × resonanceFactor > material.sagLimit
resonanceFactor = 1 + R × 0.6
```

### Load Distribution
```
proximity_i = 1 − |x_joint − x_vehicle| / (vehicle_width × 0.75)
F_i = F_vehicle × (proximity_i / Σ proximity_j)
```

See **[full methodology](about.html)** for equations, limitations, and references.

---

## Getting Started

```bash
git clone https://github.com/notivanly/BridgeGame
cd BridgeGame
# Open index.html in any modern browser — no build step needed
```

Or just visit the **[live site](https://notivanly.github.io/BridgeGame/)**.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+Z` | Undo |
| `S` | Toggle symmetry mode |
| `M` | Toggle slow motion |
| `N` | Toggle night mode |
| `D` | Delete mode |
| `R` | Replay playback |
| `?` | Keyboard shortcuts |
| `Esc` | Reset zoom / dismiss |

---

## Changelog

See **[changelog.html](changelog.html)** for full version history.

---

## Educational Use

Load Limit is designed to accompany structural engineering education at the high school and introductory college level. The guided lessons cover:
1. Why simple beams fail at mid-span
2. Why triangles are the foundation of strong structures
3. Material selection and cost-efficiency
4. Tension vs compression identification

Teachers: feel free to use this tool freely. **[Leave feedback](feedback.html)** or open an issue on GitHub.

---

## Limitations

- 2D planar analysis only (no out-of-plane effects)
- Simplified material model (no fatigue, plastic deformation, or creep)
- Approximated joint masses from beam geometry
- Linear load distribution (not true FEA)
- No soil-structure interaction

---

## Author

Built by **notivanly** as an independent engineering project.

**[Play the game](https://notivanly.github.io/BridgeGame/)** · **[Read the docs](https://notivanly.github.io/BridgeGame/about.html)** · **[Leave feedback](https://notivanly.github.io/BridgeGame/feedback.html)**
