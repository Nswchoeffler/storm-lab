// Storm Lab — side-view storm animation.
// Everything is drawn in a fixed 800×450 "virtual" space, then scaled to fit
// the canvas, so the drawing code never worries about screen size.

const StormCanvas = (() => {
  const VW = 800, VH = 450;
  const GROUND = 380;   // y of the ground line
  const SX = 430;       // x where the main storm grows
  const TOP = 75;       // cloud tops flatten here (the tropopause — the "ceiling" of the weather layer)

  const canvas = document.getElementById('storm-canvas');
  const ctx = canvas.getContext('2d');
  const captionEl = document.getElementById('storm-caption');
  const dotsEl = document.getElementById('stage-dots');

  const STEP_NAMES = ['Heating', 'Clouds', 'Spin', 'Rotation', 'Wall cloud', 'Tornado'];

  let stages = [];      // timeline for the current storm
  let startTime = 0;    // seconds (performance clock) when play started
  let clock = 0;        // latest frame time in seconds
  let scale = 1;
  let ef = 0;           // tornado strength, scales funnel width
  let cloudBase = 270;  // y of cloud base — lower (bigger y) with more moisture
  let lastCaption = null;

  // ---------- small helpers ----------
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const part = (p, a, b) => clamp01((p - a) / (b - a)); // sub-range of a stage
  const rgb = (c, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;
  const mix = (c1, c2, t) => c1.map((v, i) => lerp(v, c2[i], t));

  // Fixed "random" puff layout so clouds look the same every replay.
  function makePuffs(seed, n) {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    return Array.from({ length: n }, (_, k) => ({
      fy: k / (n - 1), dx: rnd() * 2 - 1, r: rnd(), ph: rnd() * 6,
    }));
  }
  const MAIN_PUFFS = makePuffs(7, 28);
  const SIDE_PUFFS = makePuffs(99, 16);

  // ---------- the timeline ----------
  // Each stage animates some scene values (S) from 0 to 1 over `dur` seconds.
  function makeStages(result, v) {
    const r = result.rung;
    const list = [];

    list.push({
      step: 1, dur: 2.5,
      caption: '☀️ The sun heats the ground. Warm, moist air near the surface starts to rise.',
      apply: (S, p) => { S.heat = p; },
    });

    const cloudTarget = r === 0 ? 0.25 : r <= 2 ? 0.9 : 0.7;
    list.push({
      step: 2, dur: 2.7,
      caption: r === 0
        ? '☁️ Rising air cools and makes small puffy clouds… but they can\'t grow any taller.'
        : '☁️ Rising air cools, and its moisture condenses into puffy cumulus clouds that bubble upward.',
      apply: (S, p) => { S.cloud = p * cloudTarget; if (r === 0) S.extra = p * 0.2; },
    });

    if (r === 1) {
      list.push({
        step: 2, dur: 3.5,
        caption: '🌧️ With no wind shear, rain falls straight back down through the updraft and chokes it off. The storm rains itself out.',
        apply: (S, p) => {
          S.anvil = 0.35 * part(p, 0, 0.5);
          S.rain = p < 0.4 ? p / 0.4 : lerp(1, 0.25, part(p, 0.4, 1));
          S.fade = 0.6 * part(p, 0.35, 1);
          S.heat = 1 - 0.7 * part(p, 0.3, 1); // rain-cooled air shuts off the rising warm air
        },
      });
    }

    if (r === 2) {
      list.push({
        step: 2, dur: 3.5,
        caption: '⛈️ Some wind shear lets new storms keep popping up next to old ones — a cluster or line of storms. But none of them rotate.',
        apply: (S, p) => { S.extra = 0.85 * p; S.rain = 0.9 * part(p, 0.3, 1); S.anvil = 0.4 * p; },
      });
    }

    if (r >= 3) {
      list.push({
        step: 3, dur: 3,
        caption: '🌀 Wind shear: the wind gets stronger with height, which rolls the air near the ground into a spinning horizontal tube.',
        apply: (S, p) => { S.roll = p; },
      });
      list.push({
        step: 4, dur: 3.5,
        caption: '⬆️ The storm\'s updraft tips the spinning tube upright. Now the updraft itself rotates — a mesocyclone! The top spreads out into an anvil.',
        apply: (S, p) => {
          S.tilt = part(p, 0, 0.55);
          S.meso = part(p, 0.5, 1);
          S.cloud = lerp(0.7, 1, part(p, 0.2, 0.8));
          S.anvil = part(p, 0.4, 1);
          S.rain = 0.6 * part(p, 0.6, 1);
        },
      });
    }

    // A supercell that had enough low-level spin gets as far as the wall
    // cloud, even if no tornado forms (the "unlucky" or high-base cases).
    const reachesWall = r >= 4 || (r === 3 && v.spin >= 15);
    if (reachesWall) {
      list.push({
        step: 5, dur: 2.8,
        caption: '⬇️ A wall cloud lowers beneath the rotation. Cooler "rear-flank downdraft" air sinks behind the storm and wraps around it.',
        apply: (S, p) => { S.wall = part(p, 0, 0.7); S.rfd = part(p, 0.3, 1); },
      });
    }

    if (r >= 4) {
      list.push({
        step: 6, dur: 3.5,
        caption: '🌪️ A funnel reaches down from the wall cloud and touches the ground — tornado! Debris swirls where it touches down.',
        apply: (S, p) => { S.funnel = part(p, 0, 0.7); S.debris = part(p, 0.65, 1); },
      });
    }

    // Final "hold" stage: scene keeps moving but stops progressing.
    list.push({ step: list[list.length - 1].step, dur: Infinity, caption: endCaption(result, v, reachesWall) });
    return list;
  }

  function endCaption(result, v, reachesWall) {
    switch (result.rung) {
      case 0: return '☁️ Just a few fair-weather clouds today. No storm.';
      case 1: return '🌦️ An ordinary thunderstorm — it rained itself out.';
      case 2: return '⛈️ A cluster of storms. Heavy rain and gusty winds, but no rotation.';
      case 3: return reachesWall
        ? (v.moisture < 60
          ? '🌀 The storm spins, but the cloud base is too high — no tornado.'
          : '🌀 The wall cloud spins… but no tornado this time. Most supercells never make one.')
        : '🌀 A rotating supercell! But the spin stays up in the cloud — no tornado.';
      case 4: return `🌪️ Tornado! Estimated EF${result.ef}. In real life: get to a basement or small interior room.`;
      default: return `🌪️ A violent EF${result.ef} tornado${result.ef >= 4 ? ' — a huge "wedge"' : ''}. ` +
        'In real life: take shelter underground if you can.';
    }
  }

  // Work out every scene value at time t (seconds since play started).
  function stateAt(t) {
    const S = { heat: 0, cloud: 0, extra: 0, rain: 0, fade: 0, anvil: 0, roll: 0,
                tilt: 0, meso: 0, wall: 0, rfd: 0, funnel: 0, debris: 0 };
    let elapsed = 0, current = null;
    for (const st of stages) {
      current = st;
      if (st.apply) st.apply(S, ease(clamp01((t - elapsed) / st.dur)));
      if (t < elapsed + st.dur) break;
      elapsed += st.dur;
    }
    return { S, current };
  }

  // ---------- drawing pieces ----------

  function drawSky(dark) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, rgb(mix([59, 110, 165], [18, 23, 33], dark)));
    g.addColorStop(1, rgb(mix([156, 195, 228], [58, 70, 86], dark)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, GROUND);
  }

  function drawSun(dark, time) {
    const a = 1 - dark * 0.85;
    ctx.save();
    ctx.translate(95, 75);
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ffd95a';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const ang = i * Math.PI / 6 + time * 0.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * 42, Math.sin(ang) * 42);
      ctx.lineTo(Math.cos(ang) * 54, Math.sin(ang) * 54);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGround(S) {
    // Warm glow just above the ground while the sun heats it.
    if (S.heat > 0) {
      const g = ctx.createLinearGradient(0, GROUND - 60, 0, GROUND);
      g.addColorStop(0, 'rgba(244,162,89,0)');
      g.addColorStop(1, `rgba(244,162,89,${0.3 * S.heat})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, GROUND - 60, VW, 60);
    }
    ctx.fillStyle = '#2f4a24';
    ctx.fillRect(0, GROUND, VW, VH - GROUND);
    ctx.fillStyle = '#3d5c2e';
    ctx.fillRect(0, GROUND, VW, 5);

    // A few houses and trees for scale.
    for (const x of [120, 160, 640, 690]) {
      ctx.fillStyle = '#8a7a66';
      ctx.fillRect(x, GROUND - 14, 22, 14);
      ctx.fillStyle = '#5a3d2b';
      ctx.beginPath();
      ctx.moveTo(x - 3, GROUND - 14);
      ctx.lineTo(x + 11, GROUND - 24);
      ctx.lineTo(x + 25, GROUND - 14);
      ctx.fill();
    }
    ctx.fillStyle = '#1f3a1a';
    for (const x of [60, 240, 300, 560, 760]) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND);
      ctx.lineTo(x + 8, GROUND - 26);
      ctx.lineTo(x + 16, GROUND);
      ctx.fill();
    }
  }

  function arrowHead(x, y, ang, size) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(ang - 0.5) * size, y - Math.sin(ang - 0.5) * size);
    ctx.lineTo(x - Math.cos(ang + 0.5) * size, y - Math.sin(ang + 0.5) * size);
    ctx.closePath();
    ctx.fill();
  }

  // Wavy arrows of warm (orange) and moist (teal) air rising from the ground.
  // Once a cloud exists, they drift toward it — that's the updraft feeding it.
  function drawRisingAir(S, time) {
    if (S.heat <= 0) return;
    const pull = Math.min(1, S.cloud * 1.3) * 0.6;
    for (let i = 0; i < 9; i++) {
      const x0 = 70 + i * 85;
      const rise = (time * 45 + i * 47) % 170;
      const y = GROUND - 8 - rise;
      const x = x0 + (SX - x0) * (rise / 170) * pull;
      const color = i % 2 ? [244, 162, 89] : [95, 210, 200];
      ctx.strokeStyle = ctx.fillStyle = rgb(color, S.heat * (1 - rise / 170) * 0.9);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let k = 0; k <= 22; k += 2) {
        const px = x + Math.sin((k + time * 20) / 4) * 3;
        k === 0 ? ctx.moveTo(px, y + 22 - k) : ctx.lineTo(px, y + 22 - k);
      }
      ctx.stroke();
      arrowHead(x, y - 4, -Math.PI / 2, 7);
    }
  }

  // A cumulus tower: stacked puffs, flat base, lighter at the top.
  function drawTower(cx, growth, puffs, dark, time) {
    if (growth <= 0.01) return;
    const h = growth * (cloudBase - TOP - 10);
    const w = 40 + growth * 70;
    const baseCol = mix([180, 185, 195], [72, 80, 94], dark);
    const topCol = mix([250, 250, 252], [160, 168, 180], dark);
    const size = 0.5 + growth * 0.5;

    ctx.fillStyle = rgb(baseCol);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + i * w / 3.5, cloudBase - 18 * size, 22 * size, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of puffs) {
      const y = cloudBase - 15 - p.fy * h;
      const x = cx + p.dx * w * (1 - p.fy * 0.45);
      const r = (22 + p.r * 16) * size + Math.sin(time * 1.2 + p.ph) * 1.5;
      ctx.fillStyle = rgb(mix(baseCol, topCol, p.fy));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Anvil: when the updraft hits the tropopause it spreads out sideways,
  // mostly downwind (to the right here).
  function drawAnvil(S, dark) {
    if (S.anvil <= 0) return;
    const left = SX - 70 - S.anvil * 60;
    const right = SX + 70 + S.anvil * 270;
    ctx.save();
    ctx.globalAlpha = 1 - S.fade;
    ctx.fillStyle = rgb(mix([240, 242, 246], [150, 158, 172], dark));
    ctx.beginPath();
    ctx.moveTo(left, TOP + 22);
    ctx.quadraticCurveTo(left - 10, TOP - 2, left + 35, TOP - 8);
    ctx.lineTo(right - 25, TOP - 4);
    ctx.quadraticCurveTo(right + 18, TOP + 6, right - 30, TOP + 18);
    ctx.lineTo(SX + 60, TOP + 30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawRain(cx, halfW, amount, time) {
    if (amount <= 0) return;
    const g = ctx.createLinearGradient(0, cloudBase, 0, GROUND);
    g.addColorStop(0, `rgba(120,140,165,${0.35 * amount})`);
    g.addColorStop(1, `rgba(120,140,165,${0.12 * amount})`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - halfW, cloudBase - 5, halfW * 2, GROUND - cloudBase + 5);

    ctx.strokeStyle = `rgba(190,215,240,${0.7 * amount})`;
    ctx.lineWidth = 1.5;
    const fall = GROUND - cloudBase;
    for (let i = 0; i < 30; i++) {
      const x = cx - halfW + ((i * 37) % (halfW * 2));
      const y = cloudBase + ((time * 320 + i * 53) % fall);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 14);
      ctx.stroke();
    }
  }

  // Wind arrows that get longer with height = wind shear.
  function drawShearArrows(S) {
    const a = S.roll * (1 - S.meso);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = ctx.fillStyle = '#e6edf5';
    ctx.lineWidth = 3;
    const rows = [[GROUND - 20, 22], [GROUND - 80, 48], [GROUND - 140, 74], [GROUND - 200, 100]];
    for (const [y, len] of rows) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(24 + len, y);
      ctx.stroke();
      arrowHead(24 + len + 6, y, 0, 10);
    }
    ctx.restore();
    label('strong wind aloft', 24, GROUND - 216, a, 'left');
    label('light wind near ground', 24, GROUND - 32, a, 'left');
  }

  // The spinning horizontal tube. As the updraft lifts its middle, the tube
  // bends up into an arch — that's the "tilting" step.
  function drawRoll(S, time) {
    const a = S.roll * (1 - S.meso);
    if (a <= 0) return;
    const cy = GROUND - 40;
    const x0 = lerp(170, 290, S.tilt), x2 = lerp(690, 570, S.tilt);
    const cyCtrl = cy - S.tilt * 2 * (cy - (cloudBase - 40));
    const pt = t => {
      const u = 1 - t;
      return [u * u * x0 + 2 * u * t * SX + t * t * x2, u * u * cy + 2 * u * t * cyCtrl + t * t * cy];
    };

    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(170,215,255,0.25)';
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.quadraticCurveTo(SX, cyCtrl, x2, cy);
    ctx.stroke();

    // Dots circling around the tube show it spinning.
    for (let j = 0; j <= 30; j++) {
      const t = j / 30;
      const [x, y] = pt(t);
      const [xn, yn] = pt(Math.min(1, t + 0.01));
      const [xp, yp] = pt(Math.max(0, t - 0.01));
      let nx = -(yn - yp), ny = xn - xp;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      const ang = time * 4 + j * 0.9;
      const off = Math.sin(ang) * 13;
      const front = (Math.cos(ang) + 1) / 2;
      ctx.fillStyle = `rgba(220,240,255,${0.3 + 0.7 * front})`;
      ctx.beginPath();
      ctx.arc(x + nx * off, y + ny * off, 2 + front * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const [lx, ly] = pt(0.5);
    label('spinning tube of air', lx, ly - 26, a * (1 - S.tilt));
  }

  // Mesocyclone: rotating rings inside the updraft ("x-ray view").
  function drawMeso(S, time) {
    if (S.meso <= 0) return;
    ctx.save();
    ctx.globalAlpha = S.meso * 0.85;
    ctx.strokeStyle = '#cfe8ff';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -time * 40;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(SX - 10, cloudBase - 30 - k * 38, 50 - k * 4, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    label('mesocyclone', SX + 130, cloudBase - 110, S.meso, 'left');
    label('(rotating updraft)', SX + 130, cloudBase - 94, S.meso, 'left');
    label('anvil', SX + 250, TOP - 14, S.anvil * S.meso);
  }

  function wallBottom(S) { return cloudBase - 5 + S.wall * 45; }

  function drawWallCloud(S, dark, time) {
    if (S.wall <= 0) return;
    const x0 = SX - 70, x1 = SX + 50, y0 = cloudBase - 12, y1 = wallBottom(S);
    ctx.save();
    ctx.fillStyle = rgb(mix([120, 128, 140], [58, 64, 76], dark));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + 10, y1 - 8);
    ctx.quadraticCurveTo((x0 + x1) / 2, y1 + 6, x1 - 10, y1 - 8);
    ctx.lineTo(x1, y0);
    ctx.closePath();
    ctx.fill();
    // Streaks sliding sideways show the wall cloud turning.
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + 10, y1 - 8);
    ctx.quadraticCurveTo((x0 + x1) / 2, y1 + 6, x1 - 10, y1 - 8);
    ctx.lineTo(x1, y0);
    ctx.clip();
    ctx.strokeStyle = 'rgba(200,210,225,0.25)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const x = x0 + ((k * 24 + time * 35) % (x1 - x0 + 30)) - 15;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + 18, y1 + 6);
      ctx.stroke();
    }
    ctx.restore();
    label('wall cloud', SX - 130, y1 - 10, S.wall * (1 - S.funnel));
  }

  // Rear-flank downdraft: cool air sinking behind the storm and wrapping
  // around the wall cloud.
  function drawRFD(S, time) {
    if (S.rfd <= 0) return;
    ctx.save();
    ctx.globalAlpha = S.rfd;
    ctx.strokeStyle = ctx.fillStyle = '#7fb8ff';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -time * 45;
    for (const dx of [0, 34]) {
      ctx.beginPath();
      ctx.moveTo(SX - 200 + dx, cloudBase - 50);
      ctx.quadraticCurveTo(SX - 190 + dx, GROUND - 12, SX - 70 + dx * 0.5, GROUND - 14);
      ctx.quadraticCurveTo(SX - 10, GROUND - 16, SX + 5, GROUND - 48);
      ctx.stroke();
      ctx.setLineDash([]);
      arrowHead(SX + 7, GROUND - 52, -1.2, 11);
      ctx.setLineDash([12, 8]);
    }
    ctx.restore();
    label('rear-flank downdraft', SX - 205, cloudBase - 62, S.rfd * (1 - S.debris));
  }

  function drawFunnel(S, time) {
    if (S.funnel <= 0) return;
    const top = wallBottom(S) - 6;
    const len = S.funnel * (GROUND - top);
    const topHalf = 14 + ef * 7;
    // Before touchdown the tip is narrow; after, it widens (a wedge for EF4–5).
    const botHalf = lerp(2, 3 + ef * 6, S.debris);
    const sway = Math.sin(time * 1.3) * 6 * S.funnel;
    const cx = SX - 10;

    ctx.save();
    const g = ctx.createLinearGradient(cx - topHalf, 0, cx + topHalf, 0);
    g.addColorStop(0, 'rgba(95,92,90,0.95)');
    g.addColorStop(0.5, 'rgba(150,145,140,0.95)');
    g.addColorStop(1, 'rgba(85,82,80,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - topHalf, top);
    ctx.quadraticCurveTo(cx - botHalf * 1.2 + sway * 0.5, top + len * 0.6, cx - botHalf + sway, top + len);
    ctx.lineTo(cx + botHalf + sway, top + len);
    ctx.quadraticCurveTo(cx + botHalf * 1.2 + sway * 0.5, top + len * 0.6, cx + topHalf, top);
    ctx.closePath();
    ctx.fill();
    ctx.clip();

    // Curved bands moving across the funnel show it spinning.
    ctx.strokeStyle = 'rgba(210,205,200,0.35)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 14; k++) {
      const y = top + ((k * 22 + time * 90) % Math.max(len, 1));
      const f = len > 0 ? (y - top) / len : 0;
      const half = lerp(topHalf, botHalf, f) + 4;
      const x = cx + sway * f;
      ctx.beginPath();
      ctx.ellipse(x, y, half, 4, 0, 0, Math.PI);
      ctx.stroke();
    }
    ctx.restore();

    if (S.debris > 0) drawDebris(S, cx + sway, time);
    label(`tornado (EF${ef})`, cx + topHalf + 55, top + len * 0.5, S.debris);
  }

  function drawDebris(S, cx, time) {
    const R = 22 + ef * 14;
    ctx.save();
    ctx.globalAlpha = S.debris;
    ctx.fillStyle = 'rgba(120,95,70,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, GROUND - 10, R * 1.1, 16 + ef * 3, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 45; k++) {
      const ang = time * 5 + k * 1.7;
      const rad = R * (0.35 + ((k * 7) % 10) / 15);
      const h = (k * 13 + time * 50) % (22 + ef * 10);
      const x = cx + Math.cos(ang) * rad;
      const y = GROUND - 6 - h + Math.sin(ang) * rad * 0.2;
      ctx.fillStyle = k % 3 ? '#6b4f36' : '#9a8266';
      ctx.fillRect(x, y, 3, 3);
    }
    ctx.restore();
  }

  // Small text labels so the learner can name what they see.
  function label(text, x, y, alpha, align = 'center') {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = align;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(13,19,33,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ---------- main loop ----------

  function draw(S, time) {
    const dark = clamp01(S.cloud * 0.45 + S.extra * 0.3 + S.meso * 0.3 + S.wall * 0.15 - S.fade * 0.4);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawSky(dark);
    drawSun(dark, time);
    drawRisingAir(S, time);
    drawGround(S);
    drawShearArrows(S);
    drawRoll(S, time);

    // Side towers: tiny fair-weather puffs, or neighbors in a storm cluster.
    drawTower(SX - 230, S.extra, SIDE_PUFFS, dark, time);
    drawTower(SX + 210, S.extra * 0.8, SIDE_PUFFS, dark, time + 2);
    if (S.extra > 0.5 && S.rain > 0) {
      drawRain(SX - 230, 50, S.rain * 0.8, time);
      drawRain(SX + 210, 40, S.rain * 0.6, time);
    }

    // A dying storm (fade) collapses rather than growing.
    drawTower(SX, S.cloud * (1 - S.fade * 0.6), MAIN_PUFFS, dark, time);
    drawAnvil(S, dark);
    // In a supercell the heavy rain falls ahead of the updraft (to the right),
    // leaving the rotating part rain-free — that's where tornadoes form.
    drawRain(lerp(SX, SX + 130, S.meso), 60, S.rain, time);
    drawMeso(S, time);
    drawWallCloud(S, dark, time);
    drawRFD(S, time);
    drawFunnel(S, time);
  }

  function setCaption(current) {
    const text = current ? current.caption : 'Pick your ingredients and press "Grow the storm!"';
    if (text === lastCaption) return;
    lastCaption = text;
    captionEl.textContent = text;
    const step = current ? current.step : 0;
    const maxStep = stages.length ? stages[stages.length - 1].step : 0;
    dotsEl.querySelectorAll('.dot').forEach((dot, i) => {
      dot.classList.toggle('done', i + 1 <= step);
      dot.classList.toggle('unreached', stages.length > 0 && i + 1 > maxStep);
    });
  }

  function frame(now) {
    clock = now / 1000;
    const { S, current } = stages.length
      ? stateAt(clock - startTime)
      : { S: stateAt(0).S, current: null };
    draw(S, clock);
    setCaption(current);
    requestAnimationFrame(frame);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * VH / VW * dpr);
    scale = canvas.width / VW;
  }

  function buildDots() {
    STEP_NAMES.forEach((name, i) => {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.innerHTML = `<b>${i + 1}</b><small>${name}</small>`;
      dotsEl.appendChild(dot);
    });
  }

  buildDots();
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);

  return {
    // Start the animation for a storm result + the slider values behind it.
    play(result, values) {
      ef = result.ef ?? 0;
      // More moisture → air saturates sooner as it rises → lower cloud base.
      cloudBase = lerp(215, 300, clamp01((values.moisture - 50) / 25));
      stages = makeStages(result, values);
      startTime = clock;
      lastCaption = null;
    },
    replay() { startTime = clock; lastCaption = null; },
    skip() {
      const total = stages.slice(0, -1).reduce((sum, st) => sum + st.dur, 0);
      startTime = clock - total;
    },
    get hasStorm() { return stages.length > 0; },
  };
})();
