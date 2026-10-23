# Storm Lab — Roadmap

Read `CLAUDE.md` first. Do one phase at a time; after each, tell the user how to
open the page and what to try. Check boxes as you go.

## Phase 1 — The page and sliders (~30 min)
- [x] Create `index.html`, `style.css`, `app.js` with a dark stormy theme
- [x] Header: "Storm Lab — Can you build a tornado?"
- [x] Five sliders (moisture, instability, wind shear, low-level spin, lift) with
      live value + plain-English label (e.g. "2,400 J/kg — strong fuel")
- [x] Each slider has a ⓘ tooltip explaining the ingredient in one or two sentences
- [x] Footer disclaimer (not a forecast; use the NWS for real warnings)
- **Test:** double-click `index.html`, move sliders, labels update.

## Phase 2 — Storm logic + explanations (~30 min)
- [x] "Grow the storm!" button
- [x] Implement the outcome ladder from `CLAUDE.md`
- [x] Results card: outcome title, EF estimate, "why" explanation, limiting factor,
      real-world note
- [x] Preset buttons: "Calm day", "Summer pop-up storm", "Classic tornado day"
- **Test:** each preset gives a different, sensible result.

## Phase 3 — Animated storm (~1–1.5 hr)
- [x] Canvas side-view scene: ground, sky, sun
- [x] Six animated stages with captions (see `CLAUDE.md`)
- [x] Animation stops at the stage matching the outcome
- [x] Tornado width/intensity scales with EF estimate
- [x] Replay and Skip buttons
- **Test:** "Classic tornado day" shows the full sequence; "Calm day" shows only clouds.

## Phase 4 — Live Oklahoma weather (~45 min)
- [x] City dropdown (Oklahoma cities list in `CLAUDE.md`)
- [x] "Load real weather" button → fetch Open-Meteo, next 3 days hourly
- [x] Time picker (hour-by-hour) + auto-highlight the "most stormy" hour
      (highest CAPE × shear)
- [x] Compute shear, low-level spin, lift, cloud base; set sliders from them
- [x] Show a small ▼ marker on each slider for the real value, so the user sees
      how far they moved from reality
- [x] Summary line: "Today in Norman at 5 PM: moderate fuel, weak shear → most
      likely an ordinary thunderstorm. What would you need to change?"
- [x] Friendly error message if offline / fetch fails
- **Test:** load OKC; values look plausible; then drag sliders to build a tornado.

## Phase 5 — Learn more panel + polish (~30 min)
- [x] Collapsible "How tornadoes form" section: 6 short steps matching the animation
- [x] Glossary: CAPE, dew point, wind shear, supercell, mesocyclone, wall cloud,
      rear-flank downdraft, EF scale, Tornado Alley
- [x] EF scale table (EF0–EF5 wind speeds and typical damage)
- [x] Mobile layout check
- **Test:** everything readable on a phone-width window.

## Stretch goals (pick any, later)
- [x] **Famous Oklahoma days** presets with approximate values and a short story:
      May 3, 1999 (Bridge Creek–Moore), May 20, 2013 (Moore), May 31, 2013
      (El Reno — widest tornado on record). Label values as "approximate."
- [x] **Challenge mode:** "Make a supercell with no tornado," "Build an EF5 with
      the least fuel possible"
- [ ] **Quiz:** 5 questions after playing
- [ ] **Sound:** wind/rain/thunder that builds with the storm (Web Audio, toggle off by default)
- [ ] **Tornado map:** plot historical Oklahoma tornadoes from the free NOAA SPC
      dataset (spc.noaa.gov/wcm) on a Leaflet map
- [ ] **Free hosting:** publish on GitHub Pages so it can be shared with a link
