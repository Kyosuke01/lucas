'use strict';

// Le compagnon de LUCAS : un petit noyau vivant en haut de la barre latérale.
// Il ne sait rien de l'application, qui lui annonce seulement ce qui se passe.
const companion = (() => {
  const root = document.getElementById('companion');
  root.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true">
    <ellipse class="shadow" cx="20" cy="37" rx="9" ry="1.6"/>
    <g class="limbs">
      <path class="leg left" d="M16 43v10h-3"/>
      <path class="leg right" d="M24 43v10h3"/>
      <rect class="torso" x="12.5" y="31" width="15" height="15" rx="6"/>
      <circle class="badge-ring" cx="20" cy="39" r="2.6"/>
      <path class="arm left" d="M13.5 35.5q-5 2-5 8"/>
      <path class="arm right" d="M26.5 35.5q5 2 5 8"/>
    </g>
    <g class="body">
      <g class="antenna"><path d="M20 10 Q20 6 23 4.5"/><circle class="bulb" cx="23.6" cy="4.3" r="2.1"/></g>
      <path class="skin" d="M20 9c8.5 0 13 5.6 13 13.2C33 30 28 34 20 34S7 30 7 22.2C7 14.600 11.500 9 20 9z"/>
      <ellipse class="cheek" cx="11.600" cy="25.500" rx="2.200" ry="1.300"/>
      <ellipse class="cheek" cx="28.400" cy="25.500" rx="2.200" ry="1.300"/>
      <g class="face">
        <g class="eyes open"><ellipse cx="15" cy="20.500" rx="2.100" ry="2.900"/><ellipse cx="25" cy="20.500" rx="2.100" ry="2.900"/></g>
        <g class="eyes joy"><path d="M12.500 21.500q2.500-3.500 5 0M22.500 21.500q2.500-3.500 5 0"/></g>
        <g class="eyes shut"><path d="M12.600 21q2.400 1.800 4.800 0M22.600 21q2.400 1.800 4.800 0"/></g>
        <g class="brows"><path class="brow left" d="M12.5 16.2l5 0"/><path class="brow right" d="M22.5 16.2l5 0"/></g>
        <path class="eyes cross" d="M13 19l4 4m0-4l-4 4M23 19l4 4m0-4l-4 4"/>
        <ellipse class="mouth oh" cx="20" cy="27.4" rx="1.9" ry="2.3"/>
        <path class="mouth grin" d="M16.5 25.5h7q-.5 4.500-3.500 4.500t-3.500-4.500z"/>
        <path class="mouth tongue" d="M21 27.2q.4 3 2.2 1.800q.9-1 0-2.200"/>
        <path class="mouth smile" d="M17.500 26.500q2.500 2 5 0"/>
        <ellipse class="mouth talk" cx="20" cy="27.200" rx="2.300" ry="1.900"/>
        <path class="mouth frown" d="M17.500 28q2.500-2 5 0"/>
      </g>
    </g>
    <g class="orbit"><circle cx="20" cy="2" r="1.700"/></g>
    <g class="zzz"><text x="30" y="14">z</text><text x="34" y="8">z</text></g>
    <g class="prop laptop">
      <path class="screen" d="M10 38h20l-2 13H12z"/><circle class="logo" cx="20" cy="44" r="1.8"/>
      <rect class="base" x="7" y="51" width="26" height="2.6" rx="1"/>
      <path class="reach a" d="M13.5 35.5Q7 42 9.5 50"/><path class="reach b" d="M26.5 35.5Q33 42 30.5 50"/><circle class="hand a" cx="9.5" cy="50" r="2"/><circle class="hand b" cx="30.5" cy="50" r="2"/>
    </g>
    <g class="prop book">
      <path class="reach" d="M13.5 35.5Q6 39 9 46M26.5 35.5Q34 39 31 46"/><path class="pages" d="M9 40q5.5-3 11 0q5.5-3 11 0v10q-5.5-3-11 0q-5.5-3-11 0z"/><path class="spine" d="M20 40v10"/><path class="leaf" d="M20 40q5.5-3 11 0v10q-5.5-3-11 0z"/>
      <circle class="hand" cx="9" cy="46" r="2"/><circle class="hand" cx="31" cy="46" r="2"/>
    </g>
    <g class="prop coffee">
      <path class="steam" d="M31 33q-2-2 0-4t0-4"/><g class="sip"><path class="reach" d="M26.5 35.5Q33 40 31 42"/><path class="mug" d="M27.5 36h7v6.500a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z"/><circle class="hand" cx="30" cy="43" r="2"/></g>
    </g>
    <g class="prop juggle"><circle class="ball one" cx="8" cy="36" r="2.6"/><circle class="ball two" cx="8" cy="36" r="2.6"/><circle class="ball three" cx="8" cy="36" r="2.6"/></g>
    <g class="prop notes"><text x="2" y="20">♪</text><text x="33" y="14">♫</text></g>
    <g class="prop stars"><text x="4" y="10">✦</text><text x="30" y="8">✦</text></g>
    <path class="heart" d="M20 8c-1-3-6-2.500-5 1 .600 2.200 3.200 3.600 5 5 1.800-1.400 4.400-2.800 5-5 1-3.500-4-4-5-1z"/>
  </svg>`;

  const part = (selector) => root.querySelector(selector);
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const svg = root.querySelector('svg');
  const MOODS = ['idle', 'attentive', 'thinking', 'talking', 'happy', 'sad', 'asleep'];
  let activity = 'idle'; // ce que fait LUCAS en ce moment
  let passing; // retour d'une humeur passagère
  let drowsy;

  function show(mood) {
    root.classList.remove(...MOODS);
    root.classList.add(mood);
    // Pendant que LUCAS travaille, lui aussi se met à l'ordinateur.
    if (mood === 'thinking' || mood === 'talking') pastime('laptop');
  }

  // Après deux minutes sans rien, il s'endort.
  function rest() {
    clearTimeout(drowsy);
    drowsy = setTimeout(() => activity === 'idle' && show('asleep'), 120000);
  }

  function become(next) {
    clearTimeout(passing);
    activity = next;
    show(next);
    rest();
  }

  // Humeur de quelques instants, puis retour à l'activité en cours.
  function feel(mood, duration = 1800) {
    clearTimeout(passing);
    show(mood);
    passing = setTimeout(() => show(activity), duration);
    rest();
  }

  function move(selector, frames, options) {
    if (!still.matches) part(selector).animate(frames, options);
  }

  const hop = () => move('.body', [
    { transform: 'translateY(0) scale(1,1)' },
    { transform: 'translateY(1px) scale(1.12,.86)', offset: 0.15 },
    { transform: 'translateY(-7px) scale(.92,1.1)', offset: 0.45 },
    { transform: 'translateY(0) scale(1.08,.92)', offset: 0.75 },
    { transform: 'translateY(0) scale(1,1)' },
  ], { duration: 620, easing: 'ease-out' });

  // Clignements à intervalles irréguliers, parfois doubles.
  function blink() {
    const twice = Math.random() < 0.2;
    move('.eyes.open', [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.08)' }, { transform: 'scaleY(1)' }],
      { duration: 150, iterations: twice ? 2 : 1 });
    setTimeout(blink, 2000 + Math.random() * 4500);
  }

  // Petites manies quand il ne se passe rien.
  function fidget() {
    if (!out && activity === 'idle' && root.classList.contains('idle') && !document.hidden) {
      const gesture = Math.floor(Math.random() * 3);
      if (gesture === 0) hop();
      else if (gesture === 1) {
        move('.face', [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)', offset: 0.25 },
          { transform: 'translateX(3px)', offset: 0.7 }, { transform: 'translateX(0)' }], { duration: 1600 });
      } else {
        move('.antenna', [{ transform: 'rotate(0)' }, { transform: 'rotate(-18deg)' },
          { transform: 'rotate(14deg)' }, { transform: 'rotate(0)' }], { duration: 700 });
      }
    }
    setTimeout(fidget, 6000 + Math.random() * 9000);
  }

  // Les yeux suivent le curseur. L'attribut `transform` est permis par la CSP.
  window.addEventListener('pointermove', (event) => {
    if (root.classList.contains('asleep')) show(activity);
    rest();
    if (still.matches || activity === 'thinking') return;
    const box = root.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    const reach = Math.min(1, Math.hypot(x, y) / 200);
    const angle = Math.atan2(y, x);
    part('.face').setAttribute('transform', `translate(${(Math.cos(angle) * 2 * reach).toFixed(2)} ${(Math.sin(angle) * 1.6 * reach).toFixed(2)})`);
  });

  // ── Sorti de son coin : corps, physique et occupations ──────────────────

  const SCALE = 1.6;
  const WIDTH = 40 * SCALE;
  const HEIGHT = 56 * SCALE; // jusqu'aux pieds
  const GRAVITY = 1900; // px/s²
  // Tout ce qui ressemble à une barre le porte : son bord supérieur est solide.
  const LEDGES = [
    '#composer', '#sidebar .row', '#sidebar .entry', '#sidebar .foot', '.brand span',
    'main input:not([type="file"])', 'main textarea', 'main select', 'main button.primary', 'main button.secondary',
    'main li', '.card', '.drop', '#notice', 'progress', 'summary', '.link',
    '.message.user > span', '.message pre', 'dialog[open]',
  ].join(', ');
  // Pour ceux-ci, la barre visible est le trait du bas.
  const LINES = '.tabs';
  // Jusqu'où il peut dépasser en haut de l'écran, pour atteindre les barres du haut.
  const CEILING = -HEIGHT * 0.75;

  let out = false;
  let state = 'ground'; // 'ground' | 'air' | 'held'
  let x = 0, y = 0, vx = 0, vy = 0;
  let ledge = null; // élément qui le porte, ou null pour le bas de l'écran
  let doing = 'stand';
  let until = 0;
  let goal = 0;
  let frame = 0;
  let last = 0;
  let grip = null;
  let dragged = false;
  const slot = document.createElement('span');
  slot.className = 'companion-slot';

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  function place() {
    root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  function pastime(name, seconds = 8) {
    doing = name;
    until = performance.now() + seconds * 1000;
    root.dataset.doing = name;
  }

  function leave() {
    if (out) return;
    const box = root.getBoundingClientRect();
    out = true;
    x = box.left;
    y = box.top;
    root.before(slot);
    document.body.append(root);
    root.classList.add('out');
    svg.setAttribute('viewBox', '0 0 40 58');
    part('.face').removeAttribute('transform');
    place();
    last = performance.now();
    frame = requestAnimationFrame(step);
  }

  function goHome() {
    if (!out) return;
    out = false;
    cancelAnimationFrame(frame);
    root.classList.remove('out', 'held', 'flying', 'flipped');
    delete root.dataset.doing;
    root.style.transform = '';
    svg.setAttribute('viewBox', '0 0 40 40');
    slot.replaceWith(root);
    hop();
  }

  // Hauteur de la surface d'un élément, ou null s'il n'est pas visible.
  function surface(node) {
    if (!node.isConnected || node.closest('[hidden]') || !node.checkVisibility({ visibilityProperty: true })) return null;
    const box = node.getBoundingClientRect();
    const top = node.matches(LINES) ? box.bottom : box.top;
    if (box.width < 20 || top < HEIGHT + CEILING || top >= innerHeight) return null;
    return { node, top, left: box.left, right: box.right };
  }

  const ledges = () => [...document.querySelectorAll(`${LEDGES}, ${LINES}`)].map(surface).filter(Boolean);

  const over = (box) => x + WIDTH * 0.7 > box.left && x + WIDTH * 0.3 < box.right;

  // Demi-largeur de son corps, plus étroit que son cadre.
  const HALF = 20;

  // Positions extrêmes entre les murs : bords de l'écran et bordure latérale.
  function walls() {
    let low = 0;
    let high = innerWidth - WIDTH;
    const side = document.getElementById('sidebar').getBoundingClientRect();
    if (side.left >= 0 && side.right < innerWidth) {
      if (x + WIDTH / 2 < side.right) high = side.right - HALF - WIDTH / 2;
      else low = side.right + HALF - WIDTH / 2;
    }
    return { low, high };
  }

  // Il se cogne : un petit recul, puis il repart dans l'autre sens.
  function bump(low, high) {
    const leftWall = x <= low + 0.5;
    goal = leftWall ? Math.min(high, low + 80 + Math.random() * 200) : Math.max(low, high - 80 - Math.random() * 200);
    root.classList.toggle('flipped', !leftWall);
    move('.body', [{ transform: 'translateX(0) scale(1,1)' }, { transform: 'translateX(0) scale(.86,1.08)' }, { transform: 'translateX(0) scale(1,1)' }], { duration: 260 });
    // Coincé dans un espace trop étroit : il s'arrête.
    if (Math.abs(goal - x) < 8) pastime('stand', 4);
  }

  function land(speed, on) {
    ledge = on;
    if (speed > 520 && !still.matches) {
      vy = -speed * 0.38;
      vx *= 0.75;
    } else {
      state = 'ground';
      vy = vx = 0;
      pastime('stand', 1);
    }
    move('.body', [{ transform: 'scale(1.18,.8)' }, { transform: 'scale(.95,1.05)' }, { transform: 'scale(1,1)' }], { duration: 280 });
    // Une grosse chute l'étourdit.
    if (speed > 1100) { feel('sad', 1600); pastime('dizzy', 1.8); }
  }

  function fall(dt) {
    const feet = y + HEIGHT;
    const middle = x + WIDTH / 2;
    vy += GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    // La bordure de la barre latérale est un mur, dans les deux sens.
    const side = document.getElementById('sidebar').getBoundingClientRect();
    if (side.left >= 0 && side.right < innerWidth) {
      const wasLeft = middle < side.right;
      const limit = side.right + (wasLeft ? -HALF : HALF) - WIDTH / 2;
      if (wasLeft ? x > limit : x < limit) {
        x = limit;
        vx = -vx * 0.6;
      }
    }
    if (x < 0 || x > innerWidth - WIDTH) {
      x = clamp(x, 0, innerWidth - WIDTH);
      vx = -vx * 0.6;
    }
    if (y < CEILING) {
      y = CEILING;
      vy = Math.abs(vy) * 0.4;
    }
    if (vy <= 0) return;
    const hit = ledges()
      .filter((box) => over(box) && feet <= box.top + 2 && y + HEIGHT >= box.top)
      .sort((a, b) => a.top - b.top)[0];
    if (hit) {
      y = hit.top - HEIGHT;
      land(vy, hit.node);
    } else if (y + HEIGHT >= innerHeight) {
      y = innerHeight - HEIGHT;
      land(vy, null);
    }
  }

  function choose() {
    if (activity !== 'idle') return pastime('laptop');
    if (still.matches) return pastime('stand', 20);
    const options = ['walk', 'walk', 'walk', 'laptop', 'book', 'coffee', 'juggle', 'dance', 'jump', 'stand'];
    const next = options[Math.floor(Math.random() * options.length)];
    if (next === 'jump') {
      state = 'air';
      vy = -650;
      vx = (Math.random() - 0.5) * 420;
      return pastime('stand', 1);
    }
    const { low, high } = walls();
    goal = low + Math.random() * Math.max(0, high - low);
    pastime(next, next === 'walk' ? 6 : 6 + Math.random() * 7);
  }

  function live(dt, now) {
    // Le support a pu bouger, défiler ou disparaître.
    const box = ledge && surface(ledge);
    if (ledge && (!box || !over(box))) {
      ledge = null;
      state = 'air';
      return;
    }
    y = (box ? box.top : innerHeight) - HEIGHT;
    const { low, high } = walls();
    x = clamp(x, low, high);
    if (doing === 'walk') {
      const stride = 55 * dt;
      if (Math.abs(goal - x) <= stride) return choose();
      const direction = Math.sign(goal - x);
      const next = x + direction * stride;
      x = clamp(next, low, high);
      root.classList.toggle('flipped', direction < 0);
      if (next !== x) bump(low, high);
    }
    if (now > until) choose();
  }

  function step(now) {
    const dt = Math.min((now - last) / 1000, 0.032);
    last = now;
    if (state === 'air') fall(dt);
    else if (state === 'ground') live(dt, now);
    root.classList.toggle('flying', state === 'air');
    place();
    frame = requestAnimationFrame(step);
  }

  root.addEventListener('pointerdown', (event) => {
    if (event.button) return;
    const box = root.getBoundingClientRect();
    grip = { id: event.pointerId, dx: event.clientX - box.left, dy: event.clientY - box.top,
      fromX: event.clientX, fromY: event.clientY, x: event.clientX, y: event.clientY, t: event.timeStamp };
    dragged = false;
  });

  window.addEventListener('pointermove', (event) => {
    if (grip?.id !== event.pointerId) return;
    if (!dragged && Math.hypot(event.clientX - grip.fromX, event.clientY - grip.fromY) < 6) return;
    if (!dragged) {
      dragged = true;
      leave();
      state = 'held';
      ledge = null;
      root.classList.add('held');
    }
    const seconds = Math.max(event.timeStamp - grip.t, 8) / 1000;
    // Vitesse lissée, qui servira au lancer.
    vx = vx * 0.4 + ((event.clientX - grip.x) / seconds) * 0.6;
    vy = vy * 0.4 + ((event.clientY - grip.y) / seconds) * 0.6;
    Object.assign(grip, { x: event.clientX, y: event.clientY, t: event.timeStamp });
    x = event.clientX - grip.dx;
    y = event.clientY - grip.dy;
    place();
  });

  function release(event) {
    if (grip?.id !== event.pointerId) return;
    // Immobile avant de lâcher : pas d'élan.
    if (event.timeStamp - grip.t > 90) vx = vy = 0;
    grip = null;
    if (!dragged) return;
    root.classList.remove('held');
    // Reposé sur son emplacement : il rentre chez lui.
    const home = slot.getBoundingClientRect();
    if (home.width && Math.hypot(event.clientX - home.left - 20, event.clientY - home.top - 20) < 55) return goHome();
    vx = clamp(vx, -1600, 1600);
    vy = clamp(vy, -1600, 1600);
    state = 'air';
  }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  root.ondragstart = (event) => event.preventDefault();
  root.ondblclick = goHome;
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') goHome(); });

  root.onclick = () => {
    if (dragged) { dragged = false; return; }
    feel('happy', 1400);
    if (!out) hop();
    move('.heart', [{ opacity: 0, transform: 'translateY(8px) scale(.3)' }, { opacity: 1, transform: 'translateY(-1px) scale(.9)', offset: 0.35 },
      { opacity: 0, transform: 'translateY(-9px) scale(.7)' }], { duration: 1100, easing: 'ease-out' });
  };

  become('idle');
  setTimeout(blink, 1500);
  setTimeout(fidget, 5000);

  return {
    think: () => { part('.face').removeAttribute('transform'); become('thinking'); },
    talk: () => { if (activity !== 'talking') become('talking'); },
    listen: (typing) => { if (activity === 'idle') show(typing ? 'attentive' : 'idle'); rest(); },
    done: (success) => { become('idle'); if (success) { feel('happy'); hop(); } },
    worry: () => {
      feel('sad', 2600);
      move('.body', [{ transform: 'translateX(0)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' },
        { transform: 'translateX(0)' }], { duration: 260, iterations: 2 });
    },
  };
})();
