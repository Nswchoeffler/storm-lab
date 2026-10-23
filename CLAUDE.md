# Storm Lab — CLAUDE.md

## What this is
A fun, single-afternoon learning project: a web page where the user mixes the
ingredients of a tornado with sliders and watches an animated storm grow (or
fizzle). It can load **real live weather for Oklahoma** so the sliders start
from today's actual atmosphere, then the user tweaks them to "build a tornado."

The goal is **learning**, not forecasting. Every result must explain *why* it
happened in plain English.

## About the user
- Not a programmer. Curious about tornadoes and wants to learn how they form.
- Explain what you're doing in plain language as you go (1–2 sentences per step,
  no jargon without a definition).
- After each roadmap phase, tell them exactly how to try it (e.g. "double-click
  `index.html`") and what they should see.
- Don't ask them technical questions they can't answer; pick sensible defaults.

## Hard constraints
- **Free, no accounts, no API keys, no installs.** No Node, npm, build tools,
  frameworks, or servers. The user runs it by double-clicking `index.html`.
- Plain **HTML + CSS + vanilla JavaScript**. Files:
  - `index.html` — page structure
  - `style.css` — styling (dark, stormy theme)
  - `app.js` — sliders, storm logic, weather fetch
  - `storm-canvas.js` — the animation (optional split if app.js gets big)
- No external libraries unless truly needed; if so, load from a CDN
  (cdnjs / jsdelivr) — never require a download step.
- Must work when opened as a local file (`file://`). Open-Meteo allows this (CORS OK).
- Keep it small and readable. Comment the science, not the obvious code.
- Show a small footer disclaimer: "Educational toy — not a forecast. For real
  warnings use the National Weather Service."

## Weather data: Open-Meteo (free, no key)
Verified working. Example request for Oklahoma City:

```
https://api.open-meteo.com/v1/forecast?latitude=35.47&longitude=-97.52
  &hourly=temperature_2m,dew_point_2m,cape,lifted_index,convective_inhibition,
          wind_speed_10m,wind_direction_10m,wind_speed_850hPa,wind_direction_850hPa,
          wind_speed_500hPa,wind_direction_500hPa
  &wind_speed_unit=kn&temperature_unit=fahrenheit
  &timezone=America%2FChicago&forecast_days=3
```
(Remove the line breaks/spaces when building the URL.)

Response shape: `data.hourly.time[]` plus one array per field, same index.
Some values can be `null` — handle gracefully (fall back to slider default and
say "not available").

Oklahoma locations (dropdown):
| City | Lat | Lon |
|---|---|---|
| Oklahoma City | 35.47 | -97.52 |
| Norman | 35.22 | -97.44 |
| Moore | 35.34 | -97.49 |
| Tulsa | 36.15 | -95.99 |
| Lawton | 34.60 | -98.39 |
| Woodward | 36.43 | -99.39 |
| Enid | 36.40 | -97.88 |
| Ardmore | 34.17 | -97.14 |

## The science model (simplified, but based on real rules of thumb)
Five sliders. Each shows its real value **and** a plain-English label.

| Slider | Real measure | Range | Rough meaning |
|---|---|---|---|
| 💧 Moisture | Surface dew point (°F) | 30–80 | <55 dry · 55–62 OK · 62–68 good · 68+ juicy |
| 🔥 Instability ("fuel") | CAPE (J/kg) | 0–5000 | <500 weak · 500–1500 moderate · 1500–3000 strong · 3000+ extreme |
| 🌀 Wind shear (makes storms rotate) | 0–6 km bulk shear (knots) | 0–80 | <25 no rotation · 25–35 marginal · 35–50 supercells · 50+ strong |
| 🌪️ Low-level spin | 0–1.5 km shear (knots) | 0–50 | <15 low · 15–25 moderate · 25+ high tornado potential |
| ⬆️ Lift vs. cap | Trigger strength (0–100) | 0–100 | low = capped, nothing starts · high = front/dryline forces air up |

### Mapping live weather → sliders
- Moisture = `dew_point_2m`
- Instability = `cape`
- Wind shear = magnitude of vector difference between 10 m wind and 500 hPa wind
  (500 hPa ≈ 5.5 km — close enough to 0–6 km for teaching)
- Low-level spin = vector difference between 10 m wind and 850 hPa wind
  (850 hPa ≈ 1.5 km)
- Lift = derived from `convective_inhibition` (CIN): 0 CIN → ~70, CIN 200+ → ~10.
  Explain: "The real atmosphere doesn't tell us if a front is nearby — slide this
  up to add a trigger."
- Convert direction+speed to u/v components: `u = -spd*sin(dir)`, `v = -spd*cos(dir)` (dir in radians).
- Also compute cloud-base height: `LCL ≈ 125 m × (T − Td in °C)`. Low cloud base
  (<1000 m) favors tornadoes — show it as an info readout.

### Outcome ladder (check in order; first failing ingredient is the "limiting factor")
0. **Clear skies / fair-weather clouds**: lift too low (capped) OR moisture < 50 OR CAPE < 250
1. **Ordinary thunderstorm** (pops up, rains out in ~30 min): shear < 25 kt
2. **Multicell cluster / squall line**: shear 25–35 kt, or CAPE < 1000
3. **Supercell (rotating storm), no tornado**: shear ≥ 35 and CAPE ≥ 1000, but
   low-level spin < 15 OR cloud base high (dew point too low)
4. **Tornadic supercell — weak/moderate tornado (EF0–EF2)**
5. **Violent tornado (EF3–EF5)**: all ingredients strong (e.g. CAPE ≥ 2500,
   shear ≥ 50, low-level spin ≥ 25, dew point ≥ 65, lift ≥ 50)

Add a little randomness at the top rungs (tornado vs. no tornado is genuinely
uncertain in real life — most supercells never produce one). Tell the user this.

Every outcome shows:
- A title + EF estimate if applicable
- "Why": which ingredients helped, and the limiting factor ("Great fuel and
  moisture, but not enough shear — the storm couldn't start rotating.")
- A one-line "real world" note (e.g. "This is what a typical July afternoon
  storm looks like in Oklahoma.")

## Animation (canvas, side view)
Simple shapes, stormy colors, ~10–15 seconds, staged with captions:
1. Sun heats the ground, warm moist air (little arrows) rises
2. Cumulus cloud bubbles grow
3. Horizontal spinning "roll" of air near the ground (shear) — draw a rotating tube
4. Updraft tilts the roll upright → rotating updraft (mesocyclone), anvil top spreads
5. Wall cloud lowers; rear-flank downdraft (cooler air arrows wrapping around)
6. Funnel descends and touches down (debris swirl at ground) — width by EF rating

The animation stops at the stage matching the outcome (e.g. an ordinary storm
stops at 2 and rains out). Include a Replay button and a Skip button.

## Style
Dark stormy-sky theme, big friendly sliders, readable on a laptop and phone.
Emoji icons are fine. No clutter.

## Working agreement
- Follow `ROADMAP.md` phase by phase. Finish and have the user test each phase
  before starting the next. Check off items in ROADMAP.md as you complete them.
- Keep science claims accurate; when simplifying, say so in a tooltip.
