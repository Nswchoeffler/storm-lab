// Storm Lab — sliders and (later) storm logic + live weather.

// The five tornado ingredients. Thresholds follow the rules of thumb in
// CLAUDE.md — real forecasters use many more factors, but these are the
// big ones. Each `levels` entry is [upper limit, plain-English label].
const INGREDIENTS = [
  {
    id: 'moisture',
    icon: '💧',
    name: 'Moisture',
    measure: 'Surface dew point',
    unit: '°F',
    min: 30, max: 80, step: 1, value: 60,
    levels: [[55, 'dry'], [62, 'OK moisture'], [68, 'good moisture'], [Infinity, 'juicy!']],
    tip: 'Dew point is the temperature air must cool to before clouds form. ' +
         'A high dew point means lots of water vapor — and when it condenses ' +
         'it releases heat that powers the storm. It also keeps cloud bases low, ' +
         'which tornadoes like.',
  },
  {
    id: 'cape',
    icon: '🔥',
    name: 'Instability ("fuel")',
    measure: 'CAPE',
    unit: 'J/kg',
    min: 0, max: 5000, step: 10, value: 1500,
    levels: [[500, 'weak fuel'], [1500, 'moderate fuel'], [3000, 'strong fuel'], [Infinity, 'extreme fuel']],
    tip: 'CAPE (Convective Available Potential Energy) measures how strongly a ' +
         'bubble of warm air will shoot upward once it gets going — like a ' +
         'hot-air balloon. More CAPE = faster, taller updrafts.',
  },
  {
    id: 'shear',
    icon: '🌀',
    name: 'Wind shear',
    measure: '0–6 km bulk shear',
    unit: 'kt',
    min: 0, max: 80, step: 1, value: 30,
    levels: [[25, 'no rotation'], [35, 'marginal'], [50, 'supercells possible'], [Infinity, 'strong shear']],
    tip: 'Wind shear means the wind changes speed or direction as you go up. ' +
         'It tilts storms so rain doesn\'t fall into the updraft and kill it, ' +
         'and it\'s what lets a storm start to rotate. Measured from the ground ' +
         'to about 6 km (4 miles) up.',
  },
  {
    id: 'spin',
    icon: '🌪️',
    name: 'Low-level spin',
    measure: '0–1.5 km shear',
    unit: 'kt',
    min: 0, max: 50, step: 1, value: 12,
    levels: [[15, 'low'], [25, 'moderate'], [Infinity, 'high tornado potential']],
    tip: 'Shear close to the ground (the lowest mile or so). It creates a ' +
         'horizontal rolling tube of air that a storm\'s updraft can tip upright. ' +
         'Strong low-level spin is one of the best clues for tornadoes. ' +
         '(Simplified: forecasters often use a related measure called helicity.)',
  },
  {
    id: 'lift',
    icon: '⬆️',
    name: 'Lift vs. cap',
    measure: 'Trigger strength',
    unit: '',
    min: 0, max: 100, step: 1, value: 50,
    levels: [[25, 'capped — nothing starts'], [50, 'weak trigger'], [75, 'good trigger'], [Infinity, 'strong front/dryline']],
    tip: 'Storms need a push to get started. A "cap" is a warm layer aloft that ' +
         'acts like a lid. Fronts, drylines and hills force air upward to break ' +
         'through it. (Simplified: this 0–100 scale is made up for the toy, ' +
         'not a real measurement.)',
  },
];

// Pick the label (and its color level 0–3) for a value.
function describe(ing, value) {
  const i = ing.levels.findIndex(([limit]) => value < limit);
  // Scale the color index to 0–3 so 3-level ingredients still reach "red".
  const lvl = Math.round(i * 3 / (ing.levels.length - 1));
  return { text: ing.levels[i][1], lvl };
}

function formatValue(ing, value) {
  const num = value.toLocaleString('en-US');
  return ing.unit ? `${num} ${ing.unit}` : num;
}

function buildSliders() {
  const container = document.getElementById('sliders');

  for (const ing of INGREDIENTS) {
    const row = document.createElement('div');
    row.className = 'ingredient';
    row.innerHTML = `
      <div class="ingredient-head">
        <label class="ingredient-name" for="${ing.id}">${ing.icon} ${ing.name}</label>
        <button type="button" class="info" aria-label="What is ${ing.name}?">ⓘ
          <span class="tip" role="tooltip">${ing.tip}</span>
        </button>
        <span class="ingredient-measure">${ing.measure}</span>
        <span class="readout">
          <span class="value"></span>
          <span class="label"></span>
        </span>
      </div>
      <div class="track-wrap">
        <span class="real-marker" hidden>▼</span>
        <input type="range" id="${ing.id}"
               min="${ing.min}" max="${ing.max}" step="${ing.step}" value="${ing.value}">
      </div>
      <div class="scale">
        <span>${formatValue(ing, ing.min)}</span>
        <span>${formatValue(ing, ing.max)}</span>
      </div>`;
    container.appendChild(row);

    const slider = row.querySelector('input');
    const valueEl = row.querySelector('.value');
    const labelEl = row.querySelector('.label');

    const update = () => {
      const v = Number(slider.value);
      const d = describe(ing, v);
      valueEl.textContent = formatValue(ing, v);
      labelEl.textContent = d.text;
      labelEl.className = `label lvl-${d.lvl}`;
    };
    slider.addEventListener('input', update);
    update();
  }
}

// Read all current slider values as { moisture: 60, cape: 1500, ... }.
function getValues() {
  const values = {};
  for (const ing of INGREDIENTS) {
    values[ing.id] = Number(document.getElementById(ing.id).value);
  }
  return values;
}

// ---------------------------------------------------------------------------
// Storm logic: the "outcome ladder" from CLAUDE.md.
// We climb rung by rung; the first ingredient that falls short stops the
// storm there and becomes the "limiting factor".
// ---------------------------------------------------------------------------

// Simplification: we have no temperature slider, so we can't compute the real
// cloud-base height (LCL). Instead we treat a dew point below 60 °F as "cloud
// base too high" — dry air near the ground means clouds form higher up, and
// high-based storms rarely make tornadoes.
const LOW_CLOUD_BASE_DEWPOINT = 60;

// EF scale: estimated 3-second gust wind speeds (mph).
const EF_WINDS = ['65–85 mph', '86–110 mph', '111–135 mph', '136–165 mph', '166–200 mph', 'over 200 mph'];

const OUTCOMES = [
  {
    title: '☀️ Clear skies / fair-weather clouds',
    real: 'Most days in Oklahoma look like this — even in spring, all the ' +
          'ingredients rarely line up at once.',
  },
  {
    title: '🌦️ Ordinary thunderstorm',
    real: 'This is what a typical July afternoon storm looks like in Oklahoma: ' +
          'it bubbles up, rains hard for about 30 minutes, then fizzles out.',
  },
  {
    title: '⛈️ Multicell cluster / squall line',
    real: 'Lines of storms like this are common in Oklahoma. They can still bring ' +
          'damaging straight-line winds and hail, even without a tornado.',
  },
  {
    title: '🌀 Supercell (rotating storm) — no tornado',
    real: 'Most supercells never produce a tornado — they still bring giant hail ' +
          'and fierce winds. Storm chasers see many of these for every tornado.',
  },
  {
    title: '🌪️ Tornadic supercell',
    real: 'Oklahoma averages roughly 60 tornadoes a year, and most are on the ' +
          'weaker end (EF0–EF1). Even a "weak" tornado can destroy a mobile home.',
  },
  {
    title: '🌪️🌪️ Violent tornado',
    real: 'Only a few percent of tornadoes reach EF3 or stronger, but they cause ' +
          'most tornado deaths. The Moore tornadoes of May 3, 1999 and ' +
          'May 20, 2013 formed in an atmosphere like this.',
  },
];

// Things that helped, shown as bullet points. Each checks whether an
// ingredient is at a "good" level.
const HELPERS = [
  [v => v.moisture >= 62, v => `💧 Plenty of moisture (dew point ${v.moisture} °F) to feed the clouds.`],
  [v => v.cape >= 1500, v => `🔥 Strong fuel (${v.cape.toLocaleString('en-US')} J/kg) for a powerful updraft.`],
  [v => v.shear >= 35, v => `🌀 Enough wind shear (${v.shear} kt) for the storm to rotate.`],
  [v => v.spin >= 15, v => `🌪️ Spin near the ground (${v.spin} kt) that the updraft can tip upright.`],
  [v => v.lift >= 50, () => '⬆️ A good trigger to push air up through the cap.'],
];

// Decide what storm the ingredients make. `rand` is a function returning 0–1
// (pass a fixed one for testing).
function evaluateStorm(v, rand = Math.random) {
  const result = { rung: 0, ef: null, limit: '', chance: null };

  // Rung 0: can a storm even start?
  if (v.lift < 25) {
    result.limit = 'The cap won! A warm layer of air aloft acted like a lid, and ' +
      'nothing was strong enough to push air through it. Try more lift.';
  } else if (v.moisture < 50) {
    result.limit = 'The air is too dry. Without enough water vapor, rising air ' +
      'can\'t build big clouds. Try more moisture.';
  } else if (v.cape < 250) {
    result.limit = 'Not enough fuel. Rising air quickly runs out of energy and ' +
      'only makes small, puffy clouds. Try more instability.';
  }
  if (result.limit) return finish(result, v);

  // Rung 1: storm grows, but does it organize?
  result.rung = 1;
  if (v.shear < 25) {
    result.limit = 'Not enough wind shear. The storm grew straight up, so its own ' +
      'rain fell back into the updraft and choked it off. Try more wind shear.';
    return finish(result, v);
  }

  // Rung 2: organized, but not rotating.
  result.rung = 2;
  if (v.shear < 35) {
    result.limit = 'Some wind shear helped storms organize into a group, but not ' +
      'enough for a single storm to rotate. Supercells usually need 35+ kt.';
    return finish(result, v);
  }
  if (v.cape < 1000) {
    result.limit = 'Good wind shear, but not enough fuel. The updrafts were too weak ' +
      'to become a long-lived rotating storm. Try more instability.';
    return finish(result, v);
  }

  // Rung 3: a supercell! Will it make a tornado?
  result.rung = 3;
  if (v.spin < 15) {
    result.limit = 'A rotating storm formed, but there wasn\'t enough spin near ' +
      'the ground. The rotation stayed up in the cloud. Try more low-level spin.';
    return finish(result, v);
  }
  if (v.moisture < LOW_CLOUD_BASE_DEWPOINT) {
    result.limit = 'A rotating storm formed, but the air near the ground was too ' +
      'dry, so the cloud base sat high up. Tornadoes are much more likely when ' +
      'cloud bases are low. Try more moisture.';
    return finish(result, v);
  }

  // All ingredients are present — but real tornadoes are uncertain.
  // Better ingredients raise the odds; they never reach 100%.
  let chance = 0.45;
  if (v.spin >= 25) chance += 0.15;
  if (v.moisture >= 65) chance += 0.10;
  if (v.shear >= 50) chance += 0.10;
  if (v.cape >= 2500) chance += 0.05;
  result.chance = chance;

  if (rand() >= chance) {
    result.limit = 'Every ingredient was there… but this time the storm ' +
      'didn\'t make a tornado. Real scientists are still researching why some ' +
      'supercells produce tornadoes and others don\'t. Grow it again!';
    return finish(result, v);
  }

  const violent = v.cape >= 2500 && v.shear >= 50 && v.spin >= 25 &&
                  v.moisture >= 65 && v.lift >= 50;

  if (violent && rand() < 0.7) {
    result.rung = 5;
    result.ef = 3;
    if (v.spin >= 35 && v.cape >= 3500) result.ef = 4;
    if (v.spin >= 40 && v.shear >= 60 && v.cape >= 4000 && rand() < 0.5) result.ef = 5;
    result.limit = 'Nothing held this storm back. Big fuel, strong shear, lots ' +
      'of low-level spin and a low cloud base all worked together.';
  } else {
    result.rung = 4;
    // Low-level spin is the best single clue for tornado strength.
    result.ef = v.spin >= 25 ? 2 : v.spin >= 20 ? 1 : 0;
    result.limit = violent
      ? 'The ingredients were there for a violent tornado, but this one stayed ' +
        'weaker. Even on the worst days, most tornadoes aren\'t the strongest kind.'
      : weakestTornadoIngredient(v);
  }
  return finish(result, v);
}

// For weaker tornadoes: which ingredient kept it from being violent?
function weakestTornadoIngredient(v) {
  if (v.spin < 25) return 'A tornado formed! More low-level spin would make a stronger one.';
  if (v.cape < 2500) return 'A tornado formed! More fuel (instability) would make a stronger one.';
  if (v.shear < 50) return 'A tornado formed! Stronger wind shear would make a stronger one.';
  if (v.moisture < 65) return 'A tornado formed! More moisture (a lower cloud base) would make a stronger one.';
  return 'A tornado formed! A stronger trigger (more lift) would help it get even stronger.';
}

function finish(result, v) {
  result.title = OUTCOMES[result.rung].title;
  result.real = OUTCOMES[result.rung].real;
  result.helped = HELPERS.filter(([test]) => test(v)).map(([, say]) => say(v));
  return result;
}

// ---------------------------------------------------------------------------
// Showing the result
// ---------------------------------------------------------------------------

function showResult(r) {
  const card = document.getElementById('result');
  card.hidden = false;
  card.className = `panel result rung-${r.rung}`;

  card.querySelector('.result-title').textContent = r.title;
  card.querySelector('.result-ef').textContent = r.ef === null ? ''
    : `Estimated strength: EF${r.ef} (winds ${EF_WINDS[r.ef]})`;

  const list = card.querySelector('.result-helped');
  list.innerHTML = '';
  const helped = r.helped.length ? r.helped : ['Nothing was at a strong level yet.'];
  for (const text of helped) {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  }

  card.querySelector('.result-limit').innerHTML =
    `<strong>${r.rung >= 4 ? '📈 What limited it:' : '🚧 Limiting factor:'}</strong> ${r.limit}`;

  card.querySelector('.result-chance').textContent = r.chance === null ? ''
    : `🎲 With these ingredients, about ${Math.round(r.chance * 10)} in 10 storms ` +
      'like this would make a tornado. Real life is uncertain too — most ' +
      'supercells never produce one.';

  card.querySelector('.result-real span').textContent = r.real;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS = {
  // Dry, stable high-pressure day.
  calm:    { moisture: 45, cape: 100,  shear: 15, spin: 5,  lift: 30 },
  // Hot, humid, but light winds all the way up — classic summer storm.
  popup:   { moisture: 68, cape: 2500, shear: 12, spin: 5,  lift: 60 },
  // Spring setup: Gulf moisture, big CAPE, strong jet stream, dryline trigger.
  classic: { moisture: 68, cape: 3000, shear: 55, spin: 30, lift: 70 },
};

// Famous Oklahoma tornado days. Values are APPROXIMATE — rounded from that
// day's soundings/analyses and squeezed onto our simplified sliders.
const FAMOUS = {
  moore1999: {
    title: '🌪️ May 3, 1999 — Bridge Creek–Moore',
    values: { moisture: 67, cape: 4500, shear: 60, spin: 40, lift: 60 },
    story: 'That morning, forecasters expected only a modest chance of storms. By ' +
      'afternoon, huge fuel and strong winds aloft came together, and more than 70 ' +
      'tornadoes touched down in Oklahoma and Kansas. The worst crossed Bridge Creek, ' +
      'Moore and south Oklahoma City, killing 36 people. A mobile Doppler radar ' +
      'measured winds near 300 mph inside it, among the fastest ever recorded. ' +
      'It was rated F5, the top of the older Fujita scale.',
  },
  moore2013: {
    title: '🌪️ May 20, 2013 — Moore',
    values: { moisture: 68, cape: 4000, shear: 50, spin: 26, lift: 70 },
    story: 'A supercell formed along a front and dryline southwest of Oklahoma City. ' +
      'Its tornado grew to about 1.3 miles wide and tracked 14 miles through ' +
      'Newcastle and Moore, the same area hit in 1999. It was rated EF5 (over ' +
      '200 mph). 24 people died, including 7 children at Plaza Towers Elementary. ' +
      'After this, Oklahoma pushed to add storm shelters in schools. One puzzle: ' +
      'low-level spin that day was only moderate, so this toy rates it weaker ' +
      'than EF5. Simple rules of thumb miss things, which is why real ' +
      'forecasting is hard.',
  },
  elreno2013: {
    title: '🌪️ May 31, 2013 — El Reno',
    values: { moisture: 72, cape: 5000, shear: 55, spin: 35, lift: 75 },
    story: 'The widest tornado ever recorded: 2.6 miles across. It grew wider in ' +
      'seconds and made sudden turns, trapping chasers on the roads. Eight people ' +
      'died, including three experienced tornado researchers. Mobile radar measured ' +
      'winds near 300 mph, but it was rated only EF3, because the EF scale rates ' +
      'damage, and it mostly crossed open fields where there was little to damage.',
  },
};

function setValues(values) {
  for (const [id, value] of Object.entries(values)) {
    const slider = document.getElementById(id);
    slider.value = value;
    slider.dispatchEvent(new Event('input')); // refresh the label
  }
}

// ---------------------------------------------------------------------------
// Challenge mode: goals that make you think about HOW the ingredients work
// together, instead of just pushing every slider to the max.
// ---------------------------------------------------------------------------

const CHALLENGES = [
  {
    id: 'rainout',
    name: '🌧️ Rain it out',
    goal: 'Make an ordinary thunderstorm that rains itself out — while using at least 3,000 J/kg of fuel.',
    hint: 'Fuel makes a storm tall. What makes it organize and last?',
    check: (r, v) => r.rung === 1 && v.cape >= 3000,
    win: () => 'Huge fuel, but no shear: the storm shot straight up, then its own rain ' +
      'fell back into the updraft and killed it. That\'s why hot July afternoons in ' +
      'Oklahoma bring downpours, not tornadoes.',
  },
  {
    id: 'lid',
    name: '🧢 Put a lid on it',
    goal: 'Keep the sky completely clear, even with 3,000+ J/kg of fuel and a 65 °F+ dew point.',
    hint: 'Something can stop a storm from ever starting, no matter how much fuel there is.',
    check: (r, v) => r.rung === 0 && v.cape >= 3000 && v.moisture >= 65,
    win: () => 'Forecasters call this a "loaded gun": tons of fuel trapped under the cap. ' +
      'If a front or dryline breaks the cap later in the day, storms can explode. Strong ' +
      'caps are a big reason some "tornado days" end with nothing happening.',
  },
  {
    id: 'notornado',
    name: '🌀 Spin, but no tornado',
    goal: 'Make a rotating supercell that does NOT produce a tornado.',
    hint: 'Get the storm rotating first (shear + fuel), then hold back one of the ' +
      'ingredients near the ground.',
    check: r => r.rung === 3,
    win: r => (r.chance === null ? '' : 'Every ingredient was there and it still didn\'t ' +
      'happen — just like real life! ') + 'Most supercells never make a tornado. Storm ' +
      'chasers see many of them for every one that does, but they still bring giant ' +
      'hail and damaging winds.',
  },
  {
    id: 'lean',
    name: '🪶 Tornado on a diet',
    goal: 'Make any tornado using as little fuel (CAPE) as you can. Try to beat your record!',
    hint: 'Keep the other ingredients strong and lower the fuel bit by bit. Tornadoes are ' +
      'never certain, so you may need a few tries at each level.',
    check: r => r.rung >= 4,
    score: v => v.cape, // lower is better
    win: (r, v) => `A tornado on just ${v.cape.toLocaleString('en-US')} J/kg of fuel! ` +
      'In real life tornadoes can form with even less when the wind shear is very strong. ' +
      'These "high-shear, low-CAPE" tornadoes are common in the Southeast U.S. in winter, ' +
      'and they\'re hard to forecast because they are often hidden in rain and darkness. ' +
      '(This toy\'s rules stop at 1,000 J/kg.)',
  },
  {
    id: 'ef5',
    name: '🏆 The big one',
    goal: 'Make an EF5 tornado — the strongest rating there is.',
    hint: 'Push every ingredient near the top, especially low-level spin. Even then it ' +
      'takes luck, so keep growing!',
    check: r => r.ef === 5,
    win: () => 'Only about 60 tornadoes in the U.S. have been rated F5 or EF5 since 1950. ' +
      'Moore, Oklahoma was hit by two of them, in 1999 and 2013.',
  },
];

// Progress is saved in this browser only. If saving is blocked (private
// window, etc.) the challenges still work, they just won't be remembered.
const SAVE_KEY = 'stormlab-challenges';
let progress = { done: {}, best: {} };
try {
  progress = { ...progress, ...JSON.parse(localStorage.getItem(SAVE_KEY)) };
} catch { /* start fresh */ }
function saveProgress() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch { /* not saved */ }
}

let activeChallenge = null;
let usedPreset = false; // presets don't count — you have to build it yourself

function buildChallenges() {
  const list = document.getElementById('challenge-list');
  for (const ch of CHALLENGES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'challenge-btn';
    btn.dataset.id = ch.id;
    btn.addEventListener('click', () => startChallenge(ch));
    list.appendChild(btn);
  }
  document.getElementById('challenge-quit').addEventListener('click', () => startChallenge(null));
  refreshChallenges();
}

function refreshChallenges() {
  for (const btn of document.querySelectorAll('.challenge-btn')) {
    const ch = CHALLENGES.find(c => c.id === btn.dataset.id);
    const done = progress.done[ch.id];
    btn.textContent = `${done ? '✅ ' : ''}${ch.name}`;
    btn.classList.toggle('done', !!done);
    btn.classList.toggle('active', ch === activeChallenge);
  }
  const count = CHALLENGES.filter(c => progress.done[c.id]).length;
  document.getElementById('challenge-count').textContent = `(${count} of ${CHALLENGES.length} complete)`;

  const box = document.getElementById('challenge-goal');
  box.hidden = !activeChallenge;
  if (!activeChallenge) return;
  const ch = activeChallenge;
  box.querySelector('h3').textContent = ch.name;
  box.querySelector('.goal-text').textContent = `🎯 Goal: ${ch.goal}`;
  box.querySelector('.goal-hint').textContent = `💡 Hint: ${ch.hint}`;
  const best = progress.best[ch.id];
  box.querySelector('.goal-best').textContent = best === undefined ? ''
    : `🏅 Your record: ${best.toLocaleString('en-US')} J/kg`;
}

function startChallenge(ch) {
  activeChallenge = ch;
  refreshChallenges();
}

// After each storm: did it meet the active challenge's goal?
function checkChallenge(r, v) {
  const el = document.querySelector('.result-challenge');
  el.className = 'result-challenge';
  el.textContent = '';
  const ch = activeChallenge;
  if (!ch) return;

  if (usedPreset) {
    el.classList.add('miss');
    el.textContent = `🎯 ${ch.name}: presets don't count. Move the sliders yourself, then grow the storm!`;
    return;
  }
  if (!ch.check(r, v)) {
    el.classList.add('miss');
    el.textContent = `🎯 Not yet. You made: ${r.title.replace(/^\S+\s/, '')}. 💡 ${ch.hint}`;
    return;
  }

  let record = '';
  if (ch.score) {
    const score = ch.score(v);
    const best = progress.best[ch.id];
    if (best === undefined || score < best) {
      progress.best[ch.id] = score;
      record = best === undefined ? '' : ' 🏅 New record!';
    } else {
      record = ` (Your record is still ${best.toLocaleString('en-US')} J/kg. Can you go lower?)`;
    }
  }
  progress.done[ch.id] = true;
  saveProgress();
  refreshChallenges();
  el.classList.add('win');
  el.textContent = `🎉 Challenge complete: ${ch.name}!${record} ${ch.win(r, v)}`;
}

function grow() {
  const values = getValues();
  const result = evaluateStorm(values);
  showResult(result);
  checkChallenge(result, values);
  StormCanvas.play(result, values);
  document.getElementById('replay').disabled = false;
  document.getElementById('skip').disabled = false;

  // On small screens the animation may be off-screen — bring it into view.
  const scene = document.getElementById('scene');
  const box = scene.getBoundingClientRect();
  if (box.top < 0 || box.bottom > window.innerHeight) {
    scene.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---------------------------------------------------------------------------
// Live Oklahoma weather (Open-Meteo — free, no key, works from a local file)
// ---------------------------------------------------------------------------

const CITIES = [
  ['Oklahoma City', 35.47, -97.52],
  ['Norman', 35.22, -97.44],
  ['Moore', 35.34, -97.49],
  ['Tulsa', 36.15, -95.99],
  ['Lawton', 34.60, -98.39],
  ['Woodward', 36.43, -99.39],
  ['Enid', 36.40, -97.88],
  ['Ardmore', 34.17, -97.14],
];

const WEATHER_FIELDS = [
  'temperature_2m', 'dew_point_2m', 'cape', 'lifted_index', 'convective_inhibition',
  'wind_speed_10m', 'wind_direction_10m', 'wind_speed_850hPa', 'wind_direction_850hPa',
  'wind_speed_500hPa', 'wind_direction_500hPa',
];

let weather = null; // { city, hours: [...] } once loaded
let currentHour = null;

function weatherUrl(lat, lon) {
  return 'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=${WEATHER_FIELDS.join(',')}` +
    '&wind_speed_unit=kn&temperature_unit=fahrenheit' +
    '&timezone=America%2FChicago&forecast_days=3';
}

// Wind comes as speed + the direction it blows FROM. Turn it into east-west (u)
// and north-south (v) parts so we can subtract two winds.
function windVector(speed, dirDeg) {
  const rad = dirDeg * Math.PI / 180;
  return { u: -speed * Math.sin(rad), v: -speed * Math.cos(rad) };
}

// Shear = how different the wind is between two heights (speed AND direction).
function shearBetween(spd1, dir1, spd2, dir2) {
  if ([spd1, dir1, spd2, dir2].some(x => x === null || x === undefined)) return null;
  const a = windVector(spd1, dir1), b = windVector(spd2, dir2);
  return Math.hypot(b.u - a.u, b.v - a.v);
}

// CIN (convective inhibition) measures how strong the cap is. 0 CIN → lift ~70;
// 200+ → ~10. The real data can't tell us whether a front or dryline is nearby,
// so this is only a starting point.
function liftFromCIN(cin) {
  if (cin === null || cin === undefined) return null;
  return Math.round(70 - 60 * Math.min(Math.abs(cin), 200) / 200);
}

// Cloud-base height (LCL) rule of thumb: about 125 m for every °C that the
// temperature is above the dew point.
function cloudBaseMeters(tempF, dewF) {
  if (tempF === null || dewF === null) return null;
  return 125 * Math.max(0, tempF - dewF) * 5 / 9;
}

// Turn one hour of raw data into slider values (null = not available).
function hourToValues(h) {
  return {
    moisture: h.dew_point_2m,
    cape: h.cape,
    shear: shearBetween(h.wind_speed_10m, h.wind_direction_10m, h.wind_speed_500hPa, h.wind_direction_500hPa),
    spin: shearBetween(h.wind_speed_10m, h.wind_direction_10m, h.wind_speed_850hPa, h.wind_direction_850hPa),
    lift: liftFromCIN(h.convective_inhibition),
  };
}

// "2026-09-25T17:00" is already Oklahoma local time — format it without
// letting the viewer's own time zone shift it.
function timeParts(iso) {
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const hour = Number(time.slice(0, 2));
  const day = new Date(Date.UTC(y, m - 1, d));
  return {
    date,
    weekday: day.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    dayLabel: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    hourLabel: `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`,
  };
}

function dayWord(date, todayDate) {
  const diff = Math.round((Date.parse(date) - Date.parse(todayDate)) / 86400000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : null;
}

async function loadWeather() {
  const [name, lat, lon] = CITIES[document.getElementById('city').value];
  const status = document.getElementById('weather-status');
  const button = document.getElementById('load-weather');
  status.className = 'weather-status';
  status.textContent = `Fetching the forecast for ${name}…`;
  button.disabled = true;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(weatherUrl(lat, lon), { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    // Oklahoma's current local hour, e.g. "2026-09-25T09", to skip past hours.
    const nowKey = new Date(Date.now() + data.utc_offset_seconds * 1000).toISOString().slice(0, 13);
    const hours = data.hourly.time.map((time, i) => {
      const h = { time };
      for (const f of WEATHER_FIELDS) h[f] = data.hourly[f]?.[i] ?? null;
      h.values = hourToValues(h);
      // Storminess score: fuel × shear (the two biggest supercell ingredients).
      h.score = (h.values.cape ?? 0) * (h.values.shear ?? 0);
      return h;
    }).filter(h => h.time.slice(0, 13) >= nowKey);

    if (!hours.length) throw new Error('no upcoming hours in the data');

    weather = { city: name, today: nowKey.slice(0, 10), hours };
    status.textContent = '';
    fillHourPicker();
    document.getElementById('weather-loaded').hidden = false;
  } catch (err) {
    console.error('Weather load failed:', err);
    status.className = 'weather-status error';
    status.textContent = '⚠️ Couldn\'t get the weather right now. Check your internet ' +
      'connection and try again. (The sliders and presets still work offline!)';
  } finally {
    button.disabled = false;
  }
}

function fillHourPicker() {
  const select = document.getElementById('hour');
  select.innerHTML = '';
  let best = 0;
  weather.hours.forEach((h, i) => { if (h.score > weather.hours[best].score) best = i; });

  let group = null;
  weather.hours.forEach((h, i) => {
    const t = timeParts(h.time);
    if (!group || group.dataset.date !== t.date) {
      group = document.createElement('optgroup');
      group.dataset.date = t.date;
      const word = dayWord(t.date, weather.today);
      group.label = word ? `${word} (${t.dayLabel})` : t.dayLabel;
      select.appendChild(group);
    }
    const v = h.values;
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${i === best && h.score > 0 ? '⭐ ' : ''}${t.weekday.slice(0, 3)} ${t.hourLabel} — ` +
      `fuel ${v.cape === null ? '?' : Math.round(v.cape).toLocaleString('en-US')} J/kg, ` +
      `shear ${v.shear === null ? '?' : Math.round(v.shear)} kt`;
    group.appendChild(opt);
  });

  select.value = best;
  applyHour(best);
}

function clampTo(ing, value) {
  return Math.min(ing.max, Math.max(ing.min, value));
}

// Put the chosen hour's real values onto the sliders and markers.
function applyHour(index) {
  currentHour = weather.hours[index];
  const real = currentHour.values;
  const toSet = {};
  for (const ing of INGREDIENTS) {
    const marker = document.getElementById(ing.id).parentElement.querySelector('.real-marker');
    const value = real[ing.id];
    if (value === null) {
      marker.hidden = true;
      continue;
    }
    toSet[ing.id] = clampTo(ing, value);
    // Position the ▼ over where the slider thumb would sit (the thumb is
    // 28px wide, so its centre travels from 14px to width−14px).
    const pct = (clampTo(ing, value) - ing.min) / (ing.max - ing.min);
    marker.style.left = `calc(${pct * 100}% + ${(0.5 - pct) * 28}px)`;
    marker.title = `Real value: ${formatValue(ing, Math.round(value))}`;
    marker.hidden = false;
  }
  setValues(toSet);
  usedPreset = false; // real weather is a fair starting point for challenges
  updateWeatherText();
}

function updateWeatherText() {
  if (!currentHour) return;
  const h = currentHour;
  const real = h.values;
  const t = timeParts(h.time);
  const when = dayWord(t.date, weather.today) ?? t.weekday;

  // "Most likely" outcome for the real values (no dice: tornado only if the
  // odds are better than even). Missing values fall back to the slider.
  const values = { ...getValues() };
  for (const [k, v] of Object.entries(real)) if (v !== null) values[k] = v;
  const likely = evaluateStorm(values, () => 0.5);
  const ing = id => INGREDIENTS.find(i => i.id === id);
  const fuel = real.cape === null ? 'fuel not available' : describe(ing('cape'), real.cape).text;
  const shear = real.shear === null ? 'shear not available'
    : `${Math.round(real.shear)} kt of shear (${describe(ing('shear'), real.shear).text})`;
  const outcome = [
    'clear skies — no storms', 'an ordinary thunderstorm', 'a cluster or line of storms',
    'a rotating supercell (but no tornado)', 'a tornadic supercell', 'a violent tornado',
  ][likely.rung];

  let ending = 'What would you need to change to build a tornado?';
  if (likely.rung >= 3) ending = 'That\'s a dangerous setup — for real warnings, check weather.gov!';
  document.getElementById('weather-summary').textContent =
    `${when} in ${weather.city} at ${t.hourLabel}: ${fuel}, ${shear} → most likely ` +
    `${outcome}. ${ending}`;

  // Extra facts, including the cloud base, which follows the moisture slider.
  const facts = [];
  const dew = Number(document.getElementById('moisture').value);
  const base = cloudBaseMeters(h.temperature_2m, dew);
  if (base !== null) {
    const verdict = base < 1000 ? 'low — good for tornadoes'
      : base < 1500 ? 'medium' : 'high — tornadoes less likely';
    facts.push(`☁️ Cloud base ≈ ${Math.round(base / 10) * 10} m ` +
      `(${Math.round(base * 3.281 / 100) * 100} ft) — ${verdict}. ` +
      `Uses the real temperature (${Math.round(h.temperature_2m)} °F) and your moisture slider.`);
  }
  if (h.convective_inhibition !== null) {
    facts.push(`⬆️ Lift is based on the cap strength (CIN ${Math.round(h.convective_inhibition)} J/kg). ` +
      'The real atmosphere doesn\'t tell us if a front is nearby — slide Lift up to add a trigger.');
  }
  const missing = INGREDIENTS.filter(i => real[i.id] === null).map(i => i.name);
  if (missing.length) facts.push(`❔ Not available for this hour: ${missing.join(', ')} (slider left as it was).`);
  const clipped = INGREDIENTS.filter(i => real[i.id] !== null && clampTo(i, real[i.id]) !== real[i.id]);
  for (const i of clipped) facts.push(`📏 Real ${i.name} (${formatValue(i, Math.round(real[i.id]))}) is off the slider's scale.`);
  facts.push('▼ The small blue arrows above the sliders mark the real values, so you can see how far you\'ve moved from reality.');

  const list = document.getElementById('weather-facts');
  list.innerHTML = '';
  for (const text of facts) {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  }
}

function setupWeather() {
  const citySelect = document.getElementById('city');
  CITIES.forEach(([name], i) => citySelect.add(new Option(name, i)));
  document.getElementById('load-weather').addEventListener('click', loadWeather);
  document.getElementById('hour').addEventListener('change', e => applyHour(Number(e.target.value)));
  document.getElementById('reset-real').addEventListener('click', () => {
    applyHour(weather.hours.indexOf(currentHour));
  });
  // The cloud-base readout follows the moisture slider.
  document.getElementById('moisture').addEventListener('input', updateWeatherText);
}

buildSliders();
buildChallenges();
setupWeather();

document.getElementById('grow').addEventListener('click', grow);
document.getElementById('replay').addEventListener('click', () => StormCanvas.replay());
document.getElementById('skip').addEventListener('click', () => StormCanvas.skip());

const story = document.getElementById('story');

for (const btn of document.querySelectorAll('.preset')) {
  btn.addEventListener('click', () => {
    const day = FAMOUS[btn.dataset.famous];
    if (day) {
      story.querySelector('.story-title').textContent = day.title;
      story.querySelector('.story-text').textContent = day.story;
    }
    story.hidden = !day;
    setValues(day ? day.values : PRESETS[btn.dataset.preset]);
    usedPreset = true;
    grow();
  });
}

// Moving a slider makes the old result out of date. (Only real drags reach
// here: setValues' synthetic events don't bubble.)
document.getElementById('sliders').addEventListener('input', () => {
  usedPreset = false;
  document.getElementById('result').classList.add('stale');
});
