
// AUTODÉFENSE CACHE : désinstalle l'ancien service worker (v4 cache-first) et vide TOUS ses caches.
try {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }
  if (window.caches && caches.keys) {
    caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
  }
} catch (e) {}
// Beer Runner — application React (chargé après bieres.js)
const { useState, useEffect, useRef } = React;
// ================= DONNÉES & PERSISTANCE =================
const KCAL_PAR_PINTE = 258;      // pinte RÉELLE : 215 kcal × 1,2 (taxe alcool) ≈ 258 kcal
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const fmtDateKey = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const load = (k, def) => {
  try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? def : v; }
  catch { return def; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const loadHist = () => load("brHist", {});
const saveHist = (h) => save("brHist", h);
const loadMeta = () => load("brMeta", { badges: [], bestRun: 0, nbRuns: 0 });
const saveMeta = (m) => save("brMeta", m);
const loadProfile = () => load("brProfile", { pseudo: "", poids: 70 });
const saveProfile = (p) => save("brProfile", p);
// ---- traduction EN des types et origines de la bière du jour (les noms restent des noms propres) ----
const EN_MOTS = {
  // phrases complètes d'abord (priorité sur les mots isolés)
  "Bière cerise-guimauve": "Cherry-marshmallow beer", "Bock de mai": "Maibock", "Blanche corse": "Corsican wit",
  "Bière ultra-amère": "Ultra-bitter beer", "Gueuze assemblée": "Blended gueuze", "Bière de garde": "Keeping ale",
  "Bière de Noël": "Christmas beer", "Bière ambrée": "Amber beer", "Trappiste de table": "Table trappist",
  "Bière au houblon": "Hopped beer", "Bière au miel": "Honey beer", "Stout au café": "Coffee stout",
  "Bière à la châtaigne": "Chestnut beer", "Stout impérial": "Imperial stout", "Bière fruitée ambrée": "Fruity amber beer",
  // toponymes : noms anglais officiels
  "Édimbourg": "Edinburgh", "Brême": "Bremen", "Forêt-Noire": "Black Forest", "Bretagne": "Brittany",
  "Athènes": "Athens", "Montréal": "Montreal", "Adélaïde": "Adelaide", "Saint-Pétersbourg": "Saint Petersburg",
  "île de Texel": "island of Texel", "Ciudad de México": "Mexico City",
  "Trappiste": "Trappist", "trappiste": "trappist", "Abbaye": "Abbey", "d'abbaye": "abbey", "de table": "table ale",
  "Bière": "Beer", "bière": "beer", "Blanche": "Wit", "blanche": "wit", "Blonde": "Blond", "blonde": "blond",
  "Brune": "Dark", "brune": "dark", "Ambrée": "Amber", "ambrée": "amber", "Rousse": "Red", "rousse": "red",
  "Fort": "Strong", "forte": "strong", "fort": "strong", "Triple": "Tripel", "triple": "tripel", "Quadrupel": "Quadrupel",
  "Dubbel": "Dubbel", "Saison": "Saison", "de Noël": "Christmas", "de garde": "for aging", "de mai": "May",
  "au café": "coffee", "au miel": "honey", "au houblon": "hopped", "aux raisins": "with grapes",
  "cerise": "cherry", "guimauve": "marshmallow", "Framboise": "Raspberry", "framboise": "raspberry", "Abricot": "Apricot",
  "Kriek": "Kriek", "Gueuze": "Gueuze", "Lambic": "lambic", "lambic": "lambic", "sur lambic": "on lambic",
  "Rouge des Flandres": "Flanders red", "Rouge-brune": "Red-brown", "Cervoise": "Cervoise", "houblon": "hops",
  "de blé": "wheat", "au blé noir": "buckwheat", "de froment": "wheat", "fumé": "smoked", "fumée": "smoked",
  "vieilli": "aged", "vieillie": "aged", "en fût": "in casks", "en bourbon": "in bourbon", "chocolaté": "chocolatey",
  "à l'avoine": "oatmeal", "au lactose": "lactose", "épicée": "spiced", "aux épices": "spiced", "aux trois céréales": "three-grain",
  "hoppy": "hoppy", "amère": "bitter", "ultra-amère": "ultra-bitter", "artisanales": "craft", "artisanale": "craft",
  "claire": "light", "extrême": "extreme", "d'assemblage": "blend", "de brasserie": "brewery", "tchèque": "Czech",
  "irlandaise": "Irish", "brugeoise": "Bruges", "des Flandres": "Flanders", "belge": "Belgian", "Belges": "Belgian",
  "égyptiennes": "Egyptian", "américaine": "American", "japonaise": "Japanese", "balte": "Baltic", "corse": "Corsican",
  "de Senne": "Senne-style", "de pleine lune": "full moon", "fantaisiste": "fancy", "douce": "sweet", "sauvage": "wild",
  "brut": "brut", "traditionnelle": "traditional", "accessible": "accessible", "unique": "one-of-a-kind",
  // pays/origines
  "Belgique": "Belgium", "Allemagne": "Germany", "France": "France", "Irlande": "Ireland", "Angleterre": "England",
  "Écosse": "Scotland", "États-Unis": "USA", "Tchéquie": "Czechia", "Pays-Bas": "Netherlands", "Autriche": "Austria",
  "Suisse": "Switzerland", "Danemark": "Denmark", "Norvège": "Norway", "Finlande": "Finland", "Grèce": "Greece",
  "Italie": "Italy", "Espagne": "Spain", "Portugal": "Portugal", "Pologne": "Poland", "Japon": "Japan", "Chine": "China",
  "Thaïlande": "Thailand", "Vietnam": "Vietnam", "Singapour": "Singapore", "Mexique": "Mexico", "Argentine": "Argentina",
  "Pérou": "Peru", "Venezuela": "Venezuela", "Canada": "Canada", "Australie": "Australia", "Russie": "Russia",
  "Turquie": "Turkey", "Roumanie": "Romania", "Slovénie": "Slovenia", "Slovaquie": "Slovakia", "Hongrie": "Hungary",
  "Ukraine": "Ukraine", "Afrique du Sud": "South Africa", "Kenya": "Kenya", "Écosse —": "Scotland —",
  "abbaye de": "abbey of", "d'abbaye": "abbey", "de Bruges": "of Bruges", "des Flandres": "of Flanders",
};
const tradEn = (s) => {
  let out = s;
  // remplacements les plus longs d'abord pour éviter les coupures
  for (const [fr, en] of Object.entries(EN_MOTS).sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(fr).join(en);
  }
  return out;
};
const L = () => load("brLang", "fr");   // langue courante : "fr" | "en"
// poids du coureur → kcal/km ≈ 1 kcal/kg/km
const kcalKm = () => {
  const p = loadProfile();
  return p.poids || 70;
};
const kmParPinte = () => KCAL_PAR_PINTE / kcalKm();
// ---------- MODÈLE DE CALCUL RÉALISTE ----------
// kcal NETTES : brutes corrigées par l'allure, moins le métabolisme de repos (1 kcal/kg/h)
const kcalNettes = (km, sec, poids) => {
  const v = sec > 0 ? km / (sec / 3600) : 10;              // vitesse km/h
  const brut = km * poids * (0.85 + 0.02 * Math.min(v, 18)); // courir vite coûte un peu plus au km
  const repos = poids * (sec / 3600);                       // ce que le corps brûlait de toute façon
  return Math.max(0, brut - repos);
};
// ---------- LE FÛT : crédit de pintes périssable ----------
// chaque course crédite des kcal ; elles se périment : demi-vie 24 h, perdues à 72 h
const FUT_DEMI_VIE_H = 24, FUT_PEREMPTION_H = 72;
const loadFut = () => load("brFut", []);
const saveFut = (f) => save("brFut", f);
const addFut = (kcal) => {
  if (kcal <= 0) return;
  const f = loadFut(); f.push({ kcal, ts: Date.now() }); saveFut(f);
};
const futKcal = () => {
  const now = Date.now();
  return loadFut().reduce((t, e) => {
    const h = (now - e.ts) / 3600000;
    if (h >= FUT_PEREMPTION_H) return t;                    // périmé → perdu
    return t + e.kcal * Math.pow(0.5, h / FUT_DEMI_VIE_H); // décote de demi-vie
  }, 0);
};
// purge des entrées périmées (allège le stockage)
const purgeFut = () => {
  const now = Date.now();
  saveFut(loadFut().filter((e) => (now - e.ts) / 3600000 < FUT_PEREMPTION_H));
};
// ---------- CONSOMMATIONS DÉCLARÉES ----------
const loadConsos = () => load("brConsos", []);
const saveConsos = (c) => save("brConsos", c);
const derniereConso = () => {
  const c = loadConsos();
  return c.length ? c[c.length - 1].ts : null;
};
// gueule de bois : conso < 12 h avant la course → gains × 0,88
const MALUS_GUEULE = 0.88;
const consoRecente = () => {
  const t = derniereConso();
  return t !== null && (Date.now() - t) / 3600000 < 12;
};
// streak sobriété : +2% par jour sans conso, plafonné à +10%
const streakSobriete = () => {
  const t = derniereConso();
  if (t === null) return 99;
  return Math.floor((Date.now() - t) / 86400000);
};
const bonusSobriete = () => Math.min(0.10, 0.02 * streakSobriete());
// facteur de gain appliqué à une course
const gainFactorNow = () => (consoRecente() ? MALUS_GUEULE : 1) * (1 + bonusSobriete());
// boire une pinte : débite le fût (priorité aux plus anciennes) + enregistre la conso
const boirePinte = () => {
  purgeFut();
  let reste = KCAL_PAR_PINTE;
  const f = loadFut().sort((a, b) => a.ts - b.ts);
  let couvert = 0;
  for (const e of f) {
    if (reste <= 0) break;
    const prise = Math.min(e.kcal, reste);
    e.kcal -= prise; reste -= prise; couvert += prise;
  }
  const ok = couvert >= KCAL_PAR_PINTE - 1; // tolérance d'arrondi
  saveFut(f.filter((e) => e.kcal > 0.5));
  const c = loadConsos(); c.push({ ts: Date.now(), couvert: ok ? KCAL_PAR_PINTE : couvert }); saveConsos(c);
  return ok;
};
// ---------- BILAN GLISSANT 7 JOURS ----------
// déficit calorique réel, poids simulé (7 700 kcal ≈ 1 kg), pintes justifiées
const bilan7j = () => {
  const poids = kcalKm();
  let kcalNet = 0;
  for (const d of semaine()) kcalNet += kcalNettes(d.km, d.sec, poids);
  const limite = Date.now() - 7 * 86400000;
  const consos = loadConsos().filter((c) => c.ts >= limite);
  const bues = consos.length;
  const justifiees = consos.filter((c) => c.couvert >= KCAL_PAR_PINTE - 1).length;
  const deficit = kcalNet - bues * KCAL_PAR_PINTE;
  return { kcalNet, bues, justifiees, deficit, deltaPoids: deficit / 7700 };
};
// ---------- historique ----------
const addRun = (km, sec) => {
  if (km < 0.05) return null;
  const h = loadHist();
  const key = fmtDateKey(new Date());
  if (!h[key]) h[key] = { km: 0, sec: 0 };
  h[key].km += km;
  h[key].sec += sec;
  saveHist(h);
  // crédit du fût : kcal nettes gagnées (× facteur gueule de bois / sobriété) — périssables 72 h
  addFut(kcalNettes(km, sec, kcalKm()) * gainFactorNow());
  const m = loadMeta();
  m.bestRun = Math.max(m.bestRun, km);
  m.bestSec = Math.max(m.bestSec || 0, sec);
  m.nbRuns += 1;
  // record de semaine (km) — mise à jour auto
  const w = statsSemaineEnCours();
  const recs = loadRecords();
  if (!recs.meilleure || w.km > recs.meilleure.km) {
    recs.meilleure = { km: w.km, pintes: w.pintes, jours: w.jours, lundi: w.lundi };
  }
  saveRecords(recs);
  saveMeta(m);
  return key;
};
// ---------- records de semaines (12 mois glissants) ----------
const loadRecords = () => load("brRecords", { meilleure: null });
const saveRecords = (r) => save("brRecords", r);
// purge : ne garde que les 12 derniers mois
const purgeRecords = () => {
  const r = loadRecords();
  if (r.meilleure) {
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 12);
    if (new Date(r.meilleure.lundi) < limite) { r.meilleure = null; saveRecords(r); }
  }
};
// stats de la semaine en cours
const statsSemaineEnCours = () => {
  const days = semaine();
  const km = days.reduce((t, d) => t + d.km, 0);
  const sec = days.reduce((t, d) => t + d.sec, 0);
  const jours = days.filter((d) => d.km > 0).length;
  const pintes = kcalNettes(km, sec, kcalKm()) / KCAL_PAR_PINTE;
  // lundi formaté pour le record
  const now = new Date();
  const lundi = new Date(now);
  lundi.setHours(0, 0, 0, 0);
  lundi.setDate(lundi.getDate() - ((now.getDay() + 6) % 7));
  return { km, sec, jours, pintes, lundi: fmtDateKey(lundi) };
};
// semaine en cours : lundi → dimanche
const semaine = () => {
  const h = loadHist();
  const now = new Date();
  const lundi = new Date(now);
  lundi.setHours(0, 0, 0, 0);
  lundi.setDate(lundi.getDate() - ((now.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    const key = fmtDateKey(d);
    const run = h[key] || { km: 0, sec: 0 };
    days.push({ key, jour: JOURS[i], num: d.getDate(), km: run.km, sec: run.sec, pintes: kcalNettes(run.km, run.sec, kcalKm()) / KCAL_PAR_PINTE });
  }
  return days;
};
// stats globales + série (streak)
const stats = () => {
  const h = loadHist();
  let totalKm = 0, totalSec = 0, nbJours = 0;
  for (const k in h) { totalKm += h[k].km; totalSec += h[k].sec; if (h[k].km > 0) nbJours++; }
  // streak : jours consécutifs avec course (jusqu'à hier ; aujourd'hui compte s'il est couru)
  let streak = 0;
  const cur = new Date(); cur.setHours(0, 0, 0, 0);
  let d = new Date(cur);
  if (!h[fmtDateKey(d)] || h[fmtDateKey(d)].km <= 0) d.setDate(d.getDate() - 1); // tolère "pas encore couru aujourd'hui"
  while (h[fmtDateKey(d)] && h[fmtDateKey(d)].km > 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  const m = loadMeta();
  return {
    totalKm, totalSec, nbJours, streak,
    totalPintes: kcalNettes(totalKm, totalSec, kcalKm()) / KCAL_PAR_PINTE,
    bestRun: m.bestRun, bestSec: m.bestSec, nbRuns: m.nbRuns,
  };
};
// semaine précédente (pour comparaison)
const semainePrecedente = () => {
  const h = loadHist();
  const now = new Date();
  const lundi = new Date(now);
  lundi.setHours(0, 0, 0, 0);
  lundi.setDate(lundi.getDate() - ((now.getDay() + 6) % 7) - 7);
  let km = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    const run = h[fmtDateKey(d)];
    if (run) km += run.km;
  }
  return km / kmParPinte();
};
// ================= NIVEAUX & BADGES =================
const NIVEAUX = [
  { min: 0,   nom: "Assoiffé", emoji: "🍺" },
  { min: 2,   nom: "Apprenti Brasseur", emoji: "🌱" },
  { min: 5,   nom: "Coureur de Pintes", emoji: "🏃" },
  { min: 12,  nom: "Habitué du Comptoir", emoji: "🍺" },
  { min: 25,  nom: "Maître du Fût", emoji: "🍻" },
  { min: 50,  nom: "Légende du Pub", emoji: "🏆" },
  { min: 100, nom: "Mythe Brasse-Trailleur", emoji: "👑" },
  { min: 200, nom: "Empereur de la Mousse", emoji: "🌟" },
  { min: 500, nom: "Divinité du Houblon", emoji: "⚡" },
];
const niveauDe = (pintes) => {
  let n = NIVEAUX[0];
  for (const nv of NIVEAUX) if (pintes >= nv.min) n = nv;
  return n;
};
// ---------- Bières cultes — minifiches façon Jivay (rotation QUOTIDIENNE, 362 bières) ----------
// { nom, emoji, type, origin, force (ABV), anecdote }
const biereDuJour = () => {
  // 1 bière par jour de l'année : 362 recettes, la 363e journée on recommence
  const d = new Date();
  const debut = new Date(d.getFullYear(), 0, 0);
  const jour = Math.floor((d - debut) / 86400000);
  return BIERES_CULTES[(jour - 1) % BIERES_CULTES.length];
};
// ---------- Notifications « personality » façon Kaamelott / Naheulbeuk ----------
// messages selon la situation du coureur — ton médiéval + donjon de Naheulbeuk
const notifPerso = (ctx) => {
  const { streak, weekPintes, joursDepuis, lang, pseudo, jeudiSoir } = ctx;
  const p = pseudo || (lang === "en" ? "Sire" : "Sire");
  // SPÉCIAL JEUDI SOIR — la relance d'avant le week-end 🍻
  if (jeudiSoir) {
    if (lang === "en") return { emoji: "🍻", txt: `Thursday evening, ${p}! The weekend barrels are already whispering… A run now, and you'll greet Saturday's pints with a clear conscience. The tavernier recommends it. 🏃` };
    return { emoji: "🍻", txt: `Jeudi soir, ${p} ! Les tonneaux du week-end chuchotent déjà… Une petite course maintenant, et vous saluerez les pintes de samedi en conscience tranquille. Le tavernier vous le recommande. 🏃` };
  }
  if (lang === "en") {
    if (joursDepuis >= 2) return { emoji: "🛡️", txt: `Sire ${p}! Two days without a quest… even the tavern's flies are gossiping about you. 🍺` };
    if (streak >= 7) return { emoji: "🔥", txt: `Seven days in a row, ${p}! The monks of Westvleuter bow before your discipline. Almost annoying.` };
    if (weekPintes === 0) return { emoji: "🍺", txt: `The barrel stays empty, ${p}. Even the tavern keeper asks if you're still alive…` };
    if (weekPintes >= 5) return { emoji: "🏆", txt: `${weekPintes.toFixed(1)} pints burned this week, ${p}! The villagers whisper your name with respect. Keep it up.` };
    return { emoji: "⚔️", txt: `A short quest, ${p}? Even 2 km fills a bit of the pint. The beer won't burn itself!` };
  }
  if (joursDepuis >= 2) return { emoji: "🛡️", txt: `Sire ${p} ! Ça fait ${joursDepuis} jours qu'pas de quête… même les mouches de la taverne causent sur votre compte. 🍺` };
  if (streak >= 7) return { emoji: "🔥", txt: `Sept jours d'affilée, ${p} ! Les moines de Westvleuter s'inclinent devant tant de discipline. C'est presque agaçant.` };
  if (weekPintes === 0) return { emoji: "🍺", txt: `Le tonneau est vide, ${p}. Même le tavernier demande si vous êtes encore de ce monde…` };
  if (weekPintes >= 5) return { emoji: "🏆", txt: `${weekPintes.toFixed(1)} pintes éliminées cette semaine, ${p} ! Les villageois murmurent votre nom avec respect. Continuez comme ça.` };
  return { emoji: "⚔️", txt: `Une petite quête, ${p} ? Même 2 km remplissent un peu la pinte. La bière ne s'éliminera pas toute seule !` };
};
const BADGES = [
  // --- premiers pas ---
  { id: "first_run", emoji: "👟", nom: "L'Apprenti Brasseur", desc: "Terminer ta 1ère course", cond: (s) => s.nbRuns >= 1 },
  { id: "first_pint", emoji: "🍺", nom: "La Première Pinte", desc: "Éliminer 1 pinte au total", cond: (s) => s.totalPintes >= 1 },
  // --- bières et fêtes du monde ---
  { id: "oktoberfest", emoji: "🇩🇪", nom: "Oktoberfest", desc: "14 pintes dans la semaine — la fête de Munich", cond: (s, w) => w >= 14 },
  { id: "pintskeller", emoji: "🇮🇪", nom: "Guinness", desc: "7 pintes dans la semaine — l'esprit irlandais", cond: (s, w) => w >= 7 },
  { id: "cantillon", emoji: "🇧🇪", nom: "Cantillon", desc: "21 pintes dans la semaine — la lambic de Bruxelles", cond: (s, w) => w >= 21 },
  { id: "week3", emoji: "📅", nom: "La Pils du Dimanche", desc: "3 pintes dans la semaine", cond: (s, w) => w >= 3 },
  { id: "perfect_week", emoji: "⭐", nom: "La Semaine Trappiste", desc: "Couru 3 jours cette semaine", cond: (s, w, days) => days.filter((d) => d.km > 0).length >= 3 },
  // --- streak ---
  { id: "streak3", emoji: "🔥", nom: "Habitude Bière-Run", desc: "3 jours d'affilée", cond: (s) => s.streak >= 3 },
  { id: "streak7", emoji: "🔥", nom: "La Duvel", desc: "7 jours d'affilée — la belge qui monte à la tête", cond: (s) => s.streak >= 7 },
  { id: "streak30", emoji: "🌋", nom: "La Westvleteren", desc: "30 jours d'affilée — la trappiste la plus rare", cond: (s) => s.streak >= 30 },
  // --- distance en une course : bières connues ---
  { id: "run5", emoji: "🥾", nom: "La Moinette", desc: "5 km en une course — l'ambrée du Nord", cond: (s) => s.bestRun >= 5 },
  { id: "run10", emoji: "🚀", nom: "La Chouffe", desc: "10 km en une course — le gnome est avec toi", cond: (s) => s.bestRun >= 10 },
  { id: "run15", emoji: "🐎", nom: "La Kwak", desc: "15 km en une course — attention au verre de cocher", cond: (s) => s.bestRun >= 15 },
  { id: "run20", emoji: "🦅", nom: "La Piraat", desc: "20 km en une course — le pirate du houblon", cond: (s) => s.bestRun >= 20 },
  { id: "run25", emoji: "🐉", nom: "La Delirium", desc: "25 km en une course — l'éléphant rose", cond: (s) => s.bestRun >= 25 },
  { id: "run30", emoji: "🦬", nom: "La Triple Karmeliet", desc: "30 km en une course — la triple de Gand", cond: (s) => s.bestRun >= 30 },
  { id: "semi", emoji: "🥈", nom: "Le Semi", desc: "21,1 km d'un coup — le demi qui pique", cond: (s) => s.bestRun >= 21.1 },
  // --- marathon ---
  { id: "marathon", emoji: "🥇", nom: "Le Marathon", desc: "42,2 km d'un coup — plus vite qu'une pinte ne se vide", cond: (s) => s.bestRun >= 42.2 },
  { id: "ultra", emoji: "🌌", nom: "Snake Venom", desc: "60 km d'un coup — la bière la plus forte du monde (67,5%)", cond: (s) => s.bestRun >= 60 },
  { id: "run4h", emoji: "⏳", nom: "L'Happy Hour", desc: "2h de course d'un coup", cond: (s) => s.bestSec >= 7200 },
  // --- totaux cumulés ---
  { id: "km10", emoji: "🛣️", nom: "Dix Bornes", desc: "10 km au total", cond: (s) => s.totalKm >= 10 },
  { id: "km42", emoji: "🏅", nom: "Route de l'Oktoberfest", desc: "42,2 km au total — la route de Munich", cond: (s) => s.totalKm >= 42.2 },
  { id: "km100", emoji: "💯", nom: "Le Centurion", desc: "100 km au total — 100 bières au comptoir", cond: (s) => s.totalKm >= 100 },
  { id: "km250", emoji: "🗺️", nom: "La Route des Brasseurs", desc: "250 km au total — l'itinéraire des abbayes", cond: (s) => s.totalKm >= 250 },
  { id: "km500", emoji: "🌍", nom: "Le Tour du Houblon", desc: "500 km au total — Prague, Munich, Dublin… à pied", cond: (s) => s.totalKm >= 500 },
  { id: "km1000", emoji: "🚢", nom: "Mille Sabords !", desc: "1000 km au total — capitaine au long cours", cond: (s) => s.totalKm >= 1000 },
  // --- pintes cumulées ---
  { id: "pints10", emoji: "🍻", nom: "La Dizaine", desc: "10 pintes au total", cond: (s) => s.totalPintes >= 10 },
  { id: "pints50", emoji: "🎖️", nom: "Le Perce-Oreiller", desc: "50 pintes au total — pretzel d'honneur", cond: (s) => s.totalPintes >= 50 },
  { id: "pints100", emoji: "👑", nom: "Le Tonneau d'Or", desc: "100 pintes au total — anobli par la mousse", cond: (s) => s.totalPintes >= 100 },
  { id: "pints365", emoji: "💎", nom: "Le Millésime", desc: "365 pintes au total — une pinte par jour de l'année", cond: (s) => s.totalPintes >= 365 },
  // --- performance bière ---
  { id: "triple", emoji: "🍺", nom: "La Triple", desc: "3 pintes en une course — comme l'abbaye", cond: (s) => s.bestRun / kmParPinte() >= 3 },
  { id: "sixpack", emoji: "📦", nom: "Le Six-Pack", desc: "6 pintes en une course — de bières, pas d'abdos", cond: (s) => s.bestRun / kmParPinte() >= 6 },
  { id: "keg", emoji: "🛢️", nom: "Le Perce-Fût", desc: "10 pintes en une course", cond: (s) => s.bestRun / kmParPinte() >= 10 },
  { id: "brewery", emoji: "🏭", nom: "Rachète la Brasserie", desc: "20 pintes en une course — le banquier du houblon", cond: (s) => s.bestRun / kmParPinte() >= 20 },
  // --- temps cumulé ---
  { id: "hour", emoji: "⏱️", nom: "L'Heure de Pointe", desc: "1h de course au total", cond: (s) => s.totalSec >= 3600 },
  { id: "hours10", emoji: "🕰️", nom: "Dix Heures au Comptoir", desc: "10h de course au total — fidèle au comptoir", cond: (s) => s.totalSec >= 36000 },
  { id: "hours24", emoji: "📅", nom: "La Journée du Fût", desc: "24h de course au total — un jour plein, un fût plein", cond: (s) => s.totalSec >= 86400 },
];
// détection des nouveaux badges — TOUS les badges mérités d'un coup (fix : avant, 1 seul par vérif)
const checkBadges = () => {
  const m = loadMeta();
  const s = stats();
  const days = semaine();
  const w = days.reduce((t, d) => t + d.pintes, 0);
  const nouveaux = [];
  for (const b of BADGES) {
    if (!m.badges.includes(b.id) && b.cond(s, w, days)) {
      m.badges.push(b.id);
      nouveaux.push(b);
    }
  }
  if (nouveaux.length) saveMeta(m);
  return nouveaux;
};
