# flake8: noqa: E501
# ruff: noqa: E501
HTML = r"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LUCAS Suite Pro</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#020617; --surface:rgba(255,255,255,0.03); --surface2:rgba(255,255,255,0.06);
  --border:rgba(255,255,255,0.08); --border2:rgba(255,255,255,0.15);
  --text:#f8fafc; --muted:#94a3b8; --gray:#64748b;
  --accent:#3b82f6; --accent2:#a855f7;
  --success:#10b981; --error:#ef4444; --warning:#f59e0b;
  --radius:24px; --glass:blur(30px) saturate(180%);
  --t:400ms cubic-bezier(0.23,1,0.32,1);
}
html,body{height:100%; background:var(--bg); color:var(--text);
  font-family:'Inter',sans-serif; font-size:14px;
  -webkit-font-smoothing:antialiased; overflow:hidden}
#app{height:100vh; display:grid; grid-template-columns:260px 1fr}
body::before{content:''; position:fixed; top:0; left:0; width:100%; height:100%;
  background:radial-gradient(circle at 0% 0%,rgba(59,130,246,.1),transparent 45%),
             radial-gradient(circle at 100% 100%,rgba(168,85,247,.1),transparent 45%);
  pointer-events:none; z-index:-1}

/* ── SIDEBAR ── */
#sidebar{background:rgba(0,0,0,.5); backdrop-filter:blur(50px);
  border-right:1px solid var(--border); display:flex; flex-direction:column;
  padding:45px 24px 24px; gap:12px; z-index:100}
.logo{display:flex; align-items:center; gap:16px; padding:0 12px 35px; margin-bottom:12px}
.logo-mark{width:45px; height:45px; background:linear-gradient(135deg,var(--accent),var(--accent2));
  border-radius:15px; display:flex; align-items:center; justify-content:center;
  font-size:24px; font-weight:900; color:#fff; box-shadow:0 0 35px rgba(59,130,246,.5)}
.logo-name{font-size:22px; font-weight:900; letter-spacing:-.03em}
.logo-sub{font-size:10px; color:var(--muted); letter-spacing:.25em; text-transform:uppercase; font-weight:800}
.nav{display:flex; align-items:center; gap:15px; padding:15px 20px; border-radius:18px;
  color:var(--muted); font-size:15px; font-weight:700; cursor:pointer;
  transition:all var(--t); position:relative; border:1px solid transparent}
.nav:hover{background:rgba(255,255,255,.05); color:var(--text)}
.nav.active{color:var(--text); background:rgba(59,130,246,.1); border-color:rgba(59,130,246,.3)}
.nav.active::after{content:''; position:absolute; right:12px; width:6px; height:6px;
  background:var(--accent); border-radius:50%; box-shadow:0 0 12px var(--accent)}

/* ── MAIN ── */
#main{display:flex; flex-direction:column; overflow:hidden; position:relative}
.header{height:100px; min-height:100px; display:flex; align-items:center;
  justify-content:space-between; padding:0 50px;
  background:rgba(2,6,23,.4); backdrop-filter:blur(30px);
  border-bottom:1px solid var(--border); z-index:90}
.h-path{font-size:13px; font-weight:900; color:var(--muted); text-transform:uppercase; letter-spacing:.15em}
.h-divider{width:1px; height:24px; background:var(--border); margin:0 15px}
#content{flex:1; overflow-y:auto; padding:50px 60px 80px}
.screen{display:none; animation:fadeUp .8s cubic-bezier(.16,1,.3,1)}
.screen.active{display:block}
@keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.glass{background:var(--surface); backdrop-filter:var(--glass); -webkit-backdrop-filter:var(--glass); border:1px solid var(--border)}

/* ── ACCUEIL ── */
.acards{display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; margin-bottom:30px}
.acard{padding:28px; border-radius:var(--radius); border:1px solid var(--border); transition:all var(--t); cursor:pointer}
.acard:hover{transform:translateY(-6px); background:rgba(255,255,255,.06); border-color:var(--accent)}
.ai{font-size:32px; margin-bottom:16px; display:block}
.at{font-size:18px; font-weight:850}

/* ── MODEL PICKER ── */
.picker-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:12px; margin-bottom:20px}
.pick-card{padding:16px 20px; border-radius:16px; border:1.5px solid var(--border);
  cursor:pointer; transition:all .2s; background:rgba(255,255,255,.02); position:relative}
.pick-card:hover{background:rgba(255,255,255,.05); border-color:rgba(59,130,246,.4)}
.pick-card.selected{background:rgba(59,130,246,.08); border-color:var(--accent)}
.pick-card.selected::after{content:'✓'; position:absolute; top:10px; right:14px; color:var(--accent); font-weight:900; font-size:14px}
.pick-name{font-size:14px; font-weight:800; margin-bottom:3px}
.pick-sub{font-size:12px; color:var(--muted); margin-bottom:6px}
.pick-badge{display:inline-block; font-size:10px; font-weight:700; padding:2px 8px; border-radius:999px;
  background:rgba(59,130,246,.15); color:var(--accent); border:1px solid rgba(59,130,246,.2)}
.pick-card.skip-card{border-style:dashed}
.pick-card.skip-card .pick-name{color:var(--muted)}

/* ── MODELS PAGE ── */
.mcards{display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:24px}
.mcard {
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1); /* Zoom fluide */
  position: relative;
  overflow: hidden;
  /* Effet Glassmorphism */
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.mcard::before {
  content: "";
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: radial-gradient(
    800px circle at var(--mouse-x) var(--mouse-y),
    rgba(255, 255, 255, 0.08),
    transparent 40%
  );
  z-index: 1;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.5s;
}
.mcard:hover::before {
  opacity: 1;
}

.mcard:hover {
  transform: scale(1.03); /* Le zoom léger */
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 20px 40px rgba(0,0,0,0.3);
}
.mcard-top, .mcard-bottom {
  position: relative;
  z-index: 2;
}
.mcard-top{
  padding:32px 28px 24px; display:flex; flex-direction:column; gap:14px; flex:1;
}
.mcard-bottom{
  padding:18px 28px; border-top:1px solid var(--border);
  display:flex; align-items:center; justify-content:space-between;
  background:rgba(0,0,0,.25);
}
.m-icon{width:56px; height:56px; background:rgba(255,255,255,.04); border-radius:16px;
  display:flex; align-items:center; justify-content:center; font-size:28px}
.mt{font-size:11px; font-weight:800; color:var(--accent); text-transform:uppercase; letter-spacing:.1em}
.mn{font-size:22px; font-weight:900; letter-spacing:-.04em}
.mdesc{font-size:13px; color:var(--muted); line-height:1.65; flex-grow:1}
.mram{font-size:11px; font-weight:700; color:var(--warning); display:flex; align-items:center;
  gap:6px; background:rgba(245,158,11,.08); padding:8px 14px; border-radius:10px; width:fit-content}

/* ── ABOUT ── */
.about-grid{display:grid; grid-template-columns:repeat(2,1fr); gap:20px; margin-bottom:20px}
.about-card{padding:30px; border-radius:var(--radius); border:1px solid var(--border); background:rgba(255,255,255,.04)}
.about-label{font-size:11px; font-weight:850; color:var(--muted); text-transform:uppercase; letter-spacing:.1em; margin-bottom:12px; display:block}
.about-value{font-size:16px; font-weight:750; color:var(--text)}
.github-banner{
  display:flex; align-items:center; justify-content:space-between;
  padding:32px 40px; border-radius:var(--radius);
  background:linear-gradient(135deg,rgba(59,130,246,.1),rgba(168,85,247,.1));
  border:1px solid rgba(59,130,246,.3);
  text-decoration:none; color:var(--text); transition:all var(--t); cursor:pointer;
}
.github-banner:hover{
  background:linear-gradient(135deg,rgba(59,130,246,.18),rgba(168,85,247,.18));
  border-color:rgba(59,130,246,.6); transform:translateY(-4px);
  box-shadow:0 12px 40px rgba(59,130,246,.15);
}
.github-banner-left{display:flex; align-items:center; gap:24px}
.github-banner-title{font-size:20px; font-weight:900; letter-spacing:-.02em; margin-bottom:4px}
.github-banner-sub{font-size:13px; color:var(--muted)}
.github-banner-arrow{font-size:28px; font-weight:900; color:var(--accent); transition:transform var(--t)}
.github-banner:hover .github-banner-arrow{transform:translateX(6px)}

/* ── SHARED ── */
.sl{font-size:11px; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:.1em; margin-bottom:15px}
.sv{font-size:17px; font-weight:800; display:flex; align-items:center; gap:10px}
.led{width:10px; height:10px; border-radius:50%; display:inline-block}
.led-ok{background:var(--success); box-shadow:0 0 12px var(--success)}
.led-err{background:var(--error); box-shadow:0 0 12px var(--error)}
.cw{background:rgba(0,0,0,.6); border:1px solid var(--border); border-radius:20px; padding:22px; overflow:hidden}
.log{font-family:'JetBrains Mono'; font-size:12px; color:var(--muted); line-height:1.8; overflow-y:auto; height:100%; white-space:pre-wrap; word-wrap:break-word}
.btn-primary{background:linear-gradient(135deg,#2563eb,#7c3aed); color:#fff; border:none;
  padding:16px 32px; border-radius:16px; font-weight:800; font-size:14px;
  cursor:pointer; transition:all var(--t); width:100%}
.btn-primary:hover{opacity:.9; transform:translateY(-2px)}
.btn-primary:disabled{opacity:.4; cursor:not-allowed; transform:none}
.btn-sm{background:rgba(59,130,246,.1); color:var(--accent); border:1px solid rgba(59,130,246,.25);
  padding:9px 18px; border-radius:12px; font-weight:700; font-size:13px; cursor:pointer; transition:all var(--t)}
.btn-sm:hover{background:rgba(59,130,246,.2)}
.btn-danger{background:rgba(239,68,68,.1); color:var(--error); border:1px solid rgba(239,68,68,.25);
  padding:9px 18px; border-radius:12px; font-weight:700; font-size:13px; cursor:pointer; transition:all var(--t)}
.btn-danger:hover{background:rgba(239,68,68,.2)}
.spinner{width:18px; height:18px; border:3px solid rgba(255,255,255,.1);
  border-top-color:var(--accent); border-radius:50%; animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
::-webkit-scrollbar{width:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07); border-radius:3px}

/* ── MODALE ── */
.modal{display:none; position:fixed; top:0; left:0; width:100%; height:100%;
  background:rgba(2,6,23,.8); backdrop-filter:blur(10px); z-index:1000;
  align-items:center; justify-content:center; animation:fadeIn .3s}
.modal.active{display:flex}
.modal-content{background:linear-gradient(135deg,rgba(16,185,129,.05),rgba(59,130,246,.05));
  border:1px solid rgba(16,185,129,.3); border-radius:var(--radius); padding:50px;
  max-width:600px; width:90%; max-height:90vh; overflow-y:auto;
  box-shadow:0 25px 60px rgba(0,0,0,.4); position:relative}
.modal-close{position:absolute; top:24px; right:24px; font-size:28px; cursor:pointer;
  color:var(--muted); transition:color var(--t)}
.modal-close:hover{color:var(--text)}
.modal-title{font-size:28px; font-weight:900; color:var(--success); margin-bottom:20px}
.modal-subtitle{color:var(--muted); font-size:14px; margin-bottom:30px; line-height:1.6}
@keyframes fadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
</style>
</head>
<body>
<div id="app">

<!-- ══ SIDEBAR ══ -->
<aside id="sidebar">
  <div class="logo">
    <div class="logo-mark">L</div>
    <div><div class="logo-name">LUCAS</div><div class="logo-sub">Suite Pro</div></div>
  </div>
  <div class="nav active" data-s="welcome" onclick="showScreen('welcome')">🏠 Accueil</div>
  <div class="nav" data-s="models" onclick="showScreen('models')">🧠 Modèles</div>
  <div class="nav" data-s="about" onclick="showScreen('about')">ℹ️ À propos</div>
  <div style="margin-top:auto;padding:22px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:20px">
    <div class="sl">Système RAM</div>
    <div class="sv" id="h-ram"><div class="spinner"></div></div>
  </div>
</aside>

<!-- ══ MAIN ══ -->
<div id="main">
  <header class="header">
    <div class="h-path" id="titlebar">ACCUEIL</div>
    <div style="display:flex;align-items:center">
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800"><span class="led" id="led-docker"></span>Docker</div>
      <div class="h-divider"></div>
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800"><span class="led" id="led-ollama"></span>Ollama</div>
      <div class="h-divider"></div>
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800"><span class="led" id="led-web"></span>WebUI</div>
      <div id="h-clock" style="font-family:'JetBrains Mono';font-weight:800;margin-left:25px;color:var(--accent)">00:00:00</div>
    </div>
  </header>

  <div id="content">

    <!-- ══ ACCUEIL ══ -->
    <div class="screen active" id="screen-welcome">
      <div class="hero glass" style="padding:60px;border-radius:32px;margin-bottom:45px">
        <div id="greeting" style="font-size:48px;font-weight:900;letter-spacing:-.03em;margin-bottom:12px">Chargement...</div>
        <div style="font-size:17px;color:var(--muted)">L'intelligence artificielle souveraine, locale et privée.</div>
      </div>



      <!-- Contrôles -->
      <div id="control-section" style="display:none;margin-top:40px">
        <div class="sl">Tableau de Bord</div>
        <div class="acards">
          <div class="acard glass" onclick="doStart()"><span class="ai">🚀</span><div class="at">Démarrer</div></div>
          <div class="acard glass" onclick="doStop()"><span class="ai">🛑</span><div class="at">Arrêter</div></div>
          <div class="acard glass" onclick="doOpenUI()"><span class="ai">🌍</span><div class="at">Ouvrir</div></div>
        </div>
        <div id="control-log-box" style="display:none;margin-top:24px">
          <div class="cw" style="height:200px"><div class="log" id="log-control"></div></div>
        </div>
      </div>

      <!-- Installation -->
      <div id="install-section" style="display:none;margin-top:10px">
        <div class="sl" style="margin-bottom:16px">
          Choisir un modèle à installer
          <span style="color:var(--gray);font-weight:600;text-transform:none;letter-spacing:0"> — optionnel, vous pourrez en ajouter plus tard</span>
        </div>
        <div class="picker-grid" id="picker-grid"></div>
        <button class="btn-primary" id="btn-install" onclick="doBeginInstall()" style="margin-top:8px">INSTALLER LUCAS</button>
        <div id="install-progress" style="display:none;margin-top:28px">
          <div class="cw" style="height:240px"><div class="log" id="log-install"></div></div>
        </div>
      </div>
    </div>

    <!-- ══ MODÈLES ══ -->
    <div class="screen" id="screen-models">
      <div style="margin-bottom:40px">
        <h1 style="font-size:36px;font-weight:900;letter-spacing:-.03em">Laboratoire d'Intelligence</h1>
        <p style="color:var(--muted);font-size:15px;margin-top:10px">Gérez les modèles disponibles dans votre instance LUCAS.</p>
      </div>
      <div id="models-log-box" style="display:none;margin-bottom:24px">
        <div class="sl">Installation en cours...</div>
        <div class="cw" style="height:300px"><div class="log" id="log-models"></div></div>
      </div>
      <div class="mcards" id="models-container"></div>
    </div>

    <!-- ══ À PROPOS ══ -->
    <div class="screen" id="screen-about">
      <div style="margin-bottom:40px">
        <h1 style="font-size:36px;font-weight:900;letter-spacing:-.03em">À Propos</h1>
        <p style="color:var(--muted);font-size:15px;margin-top:10px">Détails techniques et souveraineté numérique.</p>
      </div>
      <div class="about-grid">
        <div class="about-card"><span class="about-label">Version LUCAS</span><div class="about-value" id="about-version">—</div></div>
        <div class="about-card"><span class="about-label">Modèles Installés</span><div class="about-value" id="about-models">—</div></div>
        <div class="about-card"><span class="about-label">Espace Utilisé</span><div class="about-value" id="about-space">—</div></div>
        <div class="about-card"><span class="about-label">RAM Totale</span><div class="about-value" id="about-ram">—</div></div>
        <div class="about-card"><span class="about-label">Python</span><div class="about-value" id="about-python">—</div></div>
        <div class="about-card"><span class="about-label">Docker</span><div class="about-value" id="about-docker">—</div></div>
        <div class="about-card"><span class="about-label">Ollama</span><div class="about-value" id="about-ollama">—</div></div>
        <div class="about-card"><span class="about-label">Open WebUI</span><div class="about-value" id="about-webui">—</div></div>
        <div class="about-card"><span class="about-label">Confidentialité</span><div class="about-value">100% Local / Zero Tracking</div></div>
        <div class="about-card"><span class="about-label">Auteur</span><div class="about-value">Kyosuke01</div></div>
        <div class="about-card"><span class="about-label">Licence</span><div class="about-value">MIT Open Source</div></div>
        <div class="about-card"><span class="about-label">Cœur Système</span><div class="about-value">Docker & Ollama</div></div>
      </div>

      <!-- Bannière GitHub pleine largeur cliquable -->
      <a href="https://github.com/Kyosuke01/lucas" target="_blank" rel="noopener noreferrer" class="github-banner">
        <div class="github-banner-left">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
          <div>
            <div class="github-banner-title">Kyosuke01 / lucas</div>
            <div class="github-banner-sub">Voir le code source · Contribuer · Signaler un bug</div>
          </div>
        </div>
        <div class="github-banner-arrow">→</div>
      </a>
    </div>

  </div>
</div>
</div>


<script>
const API = 'http://127.0.0.1:__PORT__';
let savedPass = '';

// ── Catalogue (4 modèles, profils du plan LUCAS) ─────────────────────────────
const MODELS = [
  {
    icon: '💎', name: 'Gemma 2 2B',   source: 'gemma2:2b',    target: 'gemma2:2b',
    profile: '🟢 LUCAS Lite',   ram: '4–6 Go RAM',
    desc: 'Ultra-léger, idéal pour les petites configs. Réactif, parfait pour le chat simple et les ordres courts.'
  },
  {
    icon: '🦙', name: 'Llama 3.1 8B', source: 'llama3.1:8b',  target: 'llama3.1:8b',
    profile: '🔵 LUCAS Standard', ram: '8–12 Go RAM',
    desc: 'Le meilleur équilibre qualité/vitesse. Chat quotidien, code, routines locales. Recommandé pour la majorité.'
  },
  {
    icon: '⚡', name: 'Mistral 7B',   source: 'mistral:7b',    target: 'mistral:7b',
    profile: '🔵 LUCAS Standard', ram: '8–10 Go RAM',
    desc: 'Rapide et efficace pour les commandes courtes. Excellent pour les automatisations locales.'
  }
];

// ── Horloge ───────────────────────────────────────────────────────────────────
setInterval(() => { document.getElementById('h-clock').textContent = new Date().toLocaleTimeString(); }, 1000);

// ── Navigation ────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  document.querySelectorAll('.nav').forEach(n => n.classList.remove('active'));
  const btn = document.querySelector('[data-s="' + id + '"]');
  if (btn) btn.classList.add('active');
  document.getElementById('titlebar').textContent = id.toUpperCase();
  if (id === 'models') loadModels();
  if (id === 'about') loadAbout();
}

// ── Load About Data ──────────────────────────────────────────────────────────
function loadAbout() {
  fetch(API + '/api/about')
    .then(r => r.json())
    .then(data => {
      document.getElementById('about-version').textContent = data.version || '—';
      document.getElementById('about-models').textContent = (data.models_count || 0) + ' modèle' + (data.models_count !== 1 ? 's' : '');
      document.getElementById('about-space').textContent = data.models_space || '—';
      document.getElementById('about-ram').textContent = data.ram_total || '—';
      document.getElementById('about-python').textContent = data.python || '—';
      document.getElementById('about-docker').textContent = data.docker || '—';
      document.getElementById('about-ollama').textContent = data.ollama_status || '—';
      document.getElementById('about-webui').textContent = data.webui_status || '—';
    })
    .catch(() => {
      // Fallback silencieux en cas d'erreur
    });
}

// ── Model Picker (accueil) ────────────────────────────────────────────────────
let selectedModel = null;

function buildPicker() {
  const grid = document.getElementById('picker-grid');
  grid.innerHTML = '';

  const skip = document.createElement('div');
  skip.className = 'pick-card skip-card selected';
  skip.innerHTML = '<div class="pick-name">⏭ Sans modèle pour l\'instant</div>'
    + '<div class="pick-sub">Vous pourrez en installer un depuis l\'onglet Modèles.</div>';
  skip.onclick = () => {
    selectedModel = null;
    document.querySelectorAll('.pick-card').forEach(c => c.classList.remove('selected'));
    skip.classList.add('selected');
    updateInstallBtn();
  };
  grid.appendChild(skip);

  MODELS.forEach(m => {
    const card = document.createElement('div');
    card.className = 'pick-card';
    card.innerHTML = '<div class="pick-name">' + m.icon + ' ' + m.name + '</div>'
      + '<div class="pick-sub">' + m.ram + '</div>'
      + '<span class="pick-badge">' + m.profile + '</span>';
    card.onclick = () => {
      selectedModel = m;
      document.querySelectorAll('.pick-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      updateInstallBtn();
    };
    grid.appendChild(card);
  });
}

function updateInstallBtn() {
  const btn = document.getElementById('btn-install');
  if (!btn) return;
  btn.textContent = selectedModel
    ? 'INSTALLER LUCAS + ' + selectedModel.name.toUpperCase()
    : 'INSTALLER LUCAS';
}

// -- Installation --------
let currentLogId = 'log-install';

function doBeginInstall() {
  const btn = document.getElementById('btn-install');
  btn.disabled = true;
  document.getElementById('install-progress').style.display = 'block';
  currentLogId = 'log-install';
  const payload = {
    source: selectedModel ? selectedModel.source : '',
    target: selectedModel ? selectedModel.target : ''
  };
  fetch(API + '/api/install', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
}

function doStart() {
  document.getElementById('control-log-box').style.display = 'block';
  const logEl = document.getElementById('log-control');
  logEl.innerHTML = '';
  currentLogId = 'log-control';
  fetch(API + '/api/start', {method:'POST'});
}

function doStop() {
  document.getElementById('control-log-box').style.display = 'block';
  const logEl = document.getElementById('log-control');
  logEl.innerHTML = '';
  currentLogId = 'log-control';
  fetch(API + '/api/stop', {method:'POST'});
}

function doOpenUI() { window.open('http://localhost:8080'); }

// -- Info / LEDs --------
async function onRecheck() {
  console.log('onRecheck() started');
  try {
    console.log('Fetching /api/info from:', API + '/api/info');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('Timeout! Aborting /api/info request');
      controller.abort();
    }, 5000);

    const resp = await fetch(API + '/api/info', { signal: controller.signal });
    clearTimeout(timeoutId);
    console.log('Got response:', resp.status);

    if (!resp.ok) {
      console.error('HTTP error:', resp.status);
      throw new Error(`HTTP ${resp.status}`);
    }

    const info = await resp.json();
    console.log('Parsed JSON:', info);

    document.getElementById('greeting').textContent = info.greeting || 'LUCAS';
    updateLed('led-docker', info.docker);
    updateLed('led-ollama', info.ollama);
    updateLed('led-web',    info.webui);


    if (info.env_exists) {
      console.log('Installation found, showing control section');
      document.getElementById('control-section').style.display = 'block';
      document.getElementById('install-section').style.display  = 'none';
    } else {
      console.log('No installation found, showing install section');
      document.getElementById('install-section').style.display  = 'block';
      document.getElementById('control-section').style.display  = 'none';
      buildPicker();
    }
    console.log('onRecheck() completed successfully');
  } catch(e) {
    console.error('onRecheck() error:', e);
    document.getElementById('greeting').textContent = 'LUCAS • Erreur serveur';
    document.getElementById('install-section').style.display = 'block';
    document.getElementById('control-section').style.display = 'none';
    buildPicker();
  }
}

function updateLed(id, ok) {
  document.getElementById(id).className = 'led ' + (ok ? 'led-ok' : 'led-err');
}


// ── Page Modèles ──────────────────────────────────────────────────────────────
function loadModels() {
  const container = document.getElementById('models-container');
  container.innerHTML = '<div style="color:var(--muted);font-size:13px">Chargement...</div>';
  fetch(API + '/api/models/status')
    .then(r => r.json())
    .then(d  => renderModels(d.models || []))
    .catch(() => renderModels([]));
}

function renderModels(installed) {
  const container = document.getElementById('models-container');
  container.innerHTML = '';

  MODELS.forEach(m => {
    // Vérifier si le modèle cible (renommé) est installé
    const isInstalled = installed.some(n => n.toLowerCase() === m.target.toLowerCase());
    const card = document.createElement('div');
    card.className = 'mcard'; // Suppression de 'glass' car intégré au CSS mcard

    // Ajout du listener pour le halo et le point de zoom
    card.onmousemove = (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // On met à jour les variables CSS pour le gradient
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);

      // Optionnel : change le centre du zoom pour qu'il soit "sous la souris"
      card.style.transformOrigin = `${(x / rect.width) * 100}% ${(y / rect.height) * 100}%`;
    };

    card.innerHTML =
      '<div class="mcard-top">'
        + '<div class="m-icon">' + m.icon + '</div>'
        + '<div><div class="mt">' + m.profile + '</div>'
        +      '<div style="font-size:22px;font-weight:900;letter-spacing:-.04em">' + m.name + '</div></div>'
        + '<div class="mdesc">' + m.desc + '</div>'
        + '<div class="mram">⚡ ' + m.ram + '</div>'
      + '</div>'
      + '<div class="mcard-bottom">'
        + '<span style="font-size:12px;font-weight:700;color:' + (isInstalled ? 'var(--success)' : 'var(--gray)') + '">'
          + (isInstalled ? '✅ Installé' : '○ Non installé')
        + '</span>'
        + (isInstalled
            ? '<button class="btn-danger" onclick="doModelAction(\'delete\',\'' + m.source + '\',\'' + m.target + '\')">Supprimer</button>'
            : '<button class="btn-sm"     onclick="doModelAction(\'install\',\'' + m.source + '\',\'' + m.target + '\')">Installer</button>')
      + '</div>';
    container.appendChild(card);
  });
}

function doModelAction(action, source, target) {
  const logBox = document.getElementById('models-log-box');
  const logEl  = document.getElementById('log-models');
  if (!logBox || !logEl) { console.error('Log container not found!'); return; }

  logBox.style.display = 'block';
  logEl.innerHTML = '';
  currentLogId = 'log-models';  // ← l'EventSource global écrira ici

  fetch(API + '/api/models/action', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, source, target})
  }).catch(e => console.error('Fetch error:', e));
  // Pas de nouveau EventSource ici — celui du DOMContentLoaded suffit
}

// -- Logs --------
function appendLog(line) {
  appendLogTo(currentLogId, line);
  // Debug: log dans la console aussi
  console.log('Log appended to', currentLogId, ':', line);
}

function appendLogTo(id, line) {
  const log = document.getElementById(id);
  if (!log) {
    console.warn('Log container not found:', id);
    return;
  }

  const div = document.createElement('div');
  div.textContent = '> ' + line;
  div.style.marginBottom = '4px';
  div.style.wordBreak = 'break-word';

  // Colorisation selon le contenu
  if (line.includes('✅') || line.includes('[OK]') || line.includes('🎉')) {
    div.style.color = 'var(--success)';
  }
  else if (line.includes('[ERROR]') || line.includes('❌')) {
    div.style.color = 'var(--error)';
  }
  else if (line.includes('[LUCAS]')) {
    div.style.color = 'var(--accent)';
  }
  // Styling spécial pour les progress bars (lignes avec 📊)
  else if (line.includes('📊')) {
    div.style.color = 'var(--success)';
    div.style.fontWeight = '600';
  }

  log.appendChild(div);

  // Force scroll vers le bas
  setTimeout(() => {
    log.scrollTop = log.scrollHeight;
  }, 0);
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  onRecheck();
  fetch(API + '/api/hardware').then(r => r.json()).then(hw => {
    document.getElementById('h-ram').innerHTML =
      '<span style="color:var(--accent)">' + hw.ram + ' GB</span>';
  }).catch(() => { document.getElementById('h-ram').innerHTML = '---'; });

  const es = new EventSource(API + '/stream');
  es.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.type === 'log')  appendLog(d.line);
    if (d.type === 'done') setTimeout(onRecheck, 1000);
  };
});
</script>
</body>
</html>
"""
