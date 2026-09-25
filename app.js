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
// ================= I18N (FR / EN) + THÈME =================
const TXT = {
  fr: {
    jours: "jours", pseudo: "Pseudo", kg: "kg",
    togglePintes: "🍺 Pintes", toggleKm: "🏔️ Km",
    objectif: "Objectif :", kmWeek: "km / semaine", equiv: "équivalent", joursCourus: "jours courus",
    defi: "🎯 Défi : {n} 🍺", defiOk: "— explosé ! 🎉", defiStart: "— lève-toi et va la chercher !", defiReste: "— encore {n} !",
    streakHome: "🔥 {n} jours de suite — ta série de courses consécutives (badges à 3 et 7 j)",
    prochainBadge: "Prochain badge", tousBadges: "🏆 Tous les badges débloqués !",
    record: "🏆 Record 12 mois :", recordSem: "semaine du", battu: " · 🎉 battu !",
    cta: "C'est parti ! 🏃", bilanBadges: "📊 Bilan & badges", brasseriesBtn: "🍺 Find your pub",
    defisBtn: "🏁 Challenge", defisTitre: "🏁 Challenge de groupe",
    pwaTitre: "📲 Installer l'app", pwaBtn: "Installer Beer Runner", pwaInstalle: "✅ App installée !",
    pwaInfo: "Menu Chrome (⋮) → « Ajouter à l'écran d'accueil » — l'app s'ouvrira plein écran, comme une vraie app 🍺",
    notifMer: "Mercredi ! Une petite course aujourd'hui = bière du week-end méritée 🍺", notifBiereMer: "La bière du jour : {n} — viens la découvrir !", notifVen: "Vendredi soir ! Dernières heures pour remplir ton fût avant l'apéro 🍺", notifBiereVen: "La bière du jour : {n} — à déguster bien méritée !",
    futTitre: "Pintes à boire sans culpabilité", futExpire: "Déjà payées par tes courses 🍺 Mais bois vite : −50 % par jour, tout fond après 3 jours.",
    welcomeTitre: "🍺 Bienvenue sur Beer Runner !",
    welcomeIntro: "Cours, gagne des kcal, transforme-les en pintes. Ici, chaque bière se mérite.",
    welcomeAccueil: "🏃 Cours → ton fût se remplit (258 kcal ≈ 1 pinte)",
    welcomeRun: "⏳ Ton fût se vide tout seul : demi-vie de 24 h",
    welcomeBtn: "C'est parti ! 🍺",
    gueuleBadge: "🍺 Gueule de bois : gains −12 % (conso < 12 h)",
    soberBadge: "🌱 Sobre {d} j : gains +{p} %",
    defisDesc: "Course entre potes — le classement vit ici, l'animation vit dans WhatsApp 😄",
    defiNom: "Nom du défi :", defiNomPh: "Les Mousquetaires de la Mousse…",
    defiObj: "Objectif (pintes cette semaine) :", defiCreer: "💪 Lancer le défi",
    defiCodeLbl: "Code du fût :", defiRejoindre: "Rejoindre par code",
    defiCodePh: "MOUSSE-42", defiInvalide: "Code invalide",
    defiWAInvite: "📲 Inviter par WhatsApp",
    defiWAMsg: "🍺 Rejoins mon défi Beer Runner ! *{n}* — objectif : {o} pintes éliminées cette semaine. Ouvre l'app, onglet 🏁 Défi de groupe, colle le code {c}. Que le meilleur fût gagne ! 🏃🔥",
    defiPublier: "📋 Publier mon score", defiScoreCopie: "Score copié !",
    defiScoreMsg: "🍺 Beer Runner · {n}\n👤 {p}\n🔥 {b} pintes éliminées · {k} km cette semaine\n🏅 {t} badges",
    defiCollerLbl: "Coller les scores du groupe :", defiCollerPh: "Colle ici les messages des potes…",
    defiClasse: "Classer !", defiPodium: "🏆 Podion", defiPersonnel: "toi",
    defiQuit: "Quitter le défi", defiAucun: "Aucun défi en cours — lance-en un ou rejoins un code !",
    home: "← Accueil", homeBtn: "Accueil",
    brasseriesContact: "🍺 Brasserie ? Devenez le fût officiel de Beer Runner",
    temps: "TEMPS", vitesse: "⚡ Vitesse :", distanceTxt: "📏 Distance :", pintePourToi: "🍺 1 pinte = {k} km pour toi",
    tempsPinte: "⏱️ Temps pour éliminer 1 pinte :", calcule: "cours pour calculer…",
    pause: "⏸ Pause", reprendre: "Reprendre", courir: "Courir", terminerBtn: "↺ Terminer",
    extra: " (+{n} extra !)", bonus: "Pinte bonus n°{n} !", bonusDesc: "Tu dépasses ton objectif — {n} pintes éliminées !",
    gpsNo: "📡 GPS non dispo → simulation 🎮", gpsSeek: "📡 Recherche du signal GPS…",
    boltMsg: "🚀 44,7 km/h atteints ! Soit vous êtes champion du monde 🏆, soit vous êtes dans un moyen de transport 😅",
    warmupTitre: "⏳ Échauffement",
    warmupDesc: "Moins de ~10 min de course : rien d'éliminé ! (à 7-8 km/h, il faut au moins ~1,2 km)",
    warmupInfo: "🔥 Encore {m} min d'échauffement — après, la 1ʳᵉ pinte se comptabilise !",
    regle10: "⏳ Règle des 10 min : ton corps a besoin d'au moins 10 minutes d'effort avant de puiser dans les réserves — avant ça, rien d'éliminé. Bonus : la distance courue pendant l'échauffement compte quand même !",
    gpsOk: "📡 GPS actif — cours !", gpsRefus: "📡 GPS refusé → simulation 🎮",
    badgeUnlock: "BADGE DÉBLOQUÉ !", copie: "Copié !", copieDesc: "Bilan copié — pense au #BeerRunner 😉",
    bilanTitre: "📊 Bilan de la semaine", partager: "📤 Partager",
    pintes: "pintes", pinte: "pinte", pintesTotal: "pintes éliminées au total", palier: "prochain palier :",
    eliminees: "🍺 ÉLIMINÉES", kcalElim: "🔥 KCAL ÉLIM.", trendTitre: "📈 Tendance · 12 semaines", trendNow: "act.", trendTotal: "Total 12 semaines :", hausse: "📈 En hausse", baisse: "📉 En baisse", stable: "➖ Stable",
    vsDerniere: "vs semaine dernière ({p} 🍺) :", serie: "Série : {n} j 🔥",
    aucune: "Aucune course cette semaine… ta pinte t'attend ! 🍺🏃",
    trophees: "🏅 Trophées ({n}/{t})",
    bravo: "BRAVO !", objAtteint: "Objectif atteint :", enTime: "en",
    pinteNr: "Pinte n°{n} éliminée !",
    totalLine: "Total : {p} pintes · Niveau : {e} {n} · Série : {s} j 🔥",
    continuer: "Continuer 🏃", terminer: "Terminer",
    brasseriesTitre: "🍺 Find your pub",
    brasseriesDesc: "Trouve où célébrer tes pintes éliminées — les micro-brasseries autour de tes parcours de course.",
    locateMe: "Me localiser", locating: "Localisation…", reSituer: "Position actualisée ✓ (re-situer)",
    ouVille: "ou ville :", maPos: "ma position",
    posOk: "✓ Position trouvée — les résultats s'ouvrent dans Maps autour de toi",
    posErr: "Position indisponible — indique ta ville ci-dessus, ça marche pareil !",
    ouvrirMaps: "Ouvrir dans Maps →",
    astuce: "Astuce : la carte s'ouvre centrée sur ta position de course — parfait pour repérer la brasserie à 500 m de ton point d'arrivée. Santé ! 🍻",
    total: "total",
    shareTxt: "🍻 Beer Runner™ — {d}\nCette semaine : {km} km = {p} pintes éliminées !\nTotal : {tp} pintes · Niveau {n}\n{b} badges 🏅\n#BeerRunner #CourirPourBoire → beerrunner.app",
  },
  en: {
    jours: "days", pseudo: "Nickname", kg: "kg",
    togglePintes: "🍺 Pints", toggleKm: "🏔️ Km",
    objectif: "Goal:", kmWeek: "km / week", equiv: "equivalent", joursCourus: "days run",
    defi: "🎯 Challenge: {n} 🍺", defiOk: "— smashed! 🎉", defiStart: "— get up and go get it!", defiReste: "— {n} to go!",
    streakHome: "🔥 {n} days in a row — your consecutive-run streak (badges at 3 and 7 d)",
    prochainBadge: "Next badge", tousBadges: "🏆 All badges unlocked!",
    record: "🏆 12-month record:", recordSem: "week of", battu: " · 🎉 beaten!",
    cta: "Let's go! 🏃", bilanBadges: "📊 Summary & badges", brasseriesBtn: "🍺 Find your pub",
    defisBtn: "🏁 Challenge", defisTitre: "🏁 Group challenge",
    pwaTitre: "📲 Install the app", pwaBtn: "Install Beer Runner", pwaInstalle: "✅ App installed!",
    pwaInfo: "Chrome menu (⋮) → 'Add to Home screen' — the app will open full-screen, like a real app 🍺",
    notifMer: "Wednesday! A little run today = weekend beer earned 🍺", notifBiereMer: "Beer of the day: {n} — come check it out!", notifVen: "Friday night! Last hours to fill your keg before drinks 🍺", notifBiereVen: "Beer of the day: {n} — enjoy it well earned!",
    futTitre: "Guilt-free pints", futExpire: "Already paid for by your runs 🍺 But drink fast: −50% per day, all melts after 3 days.",
    welcomeTitre: "🍺 Welcome to Beer Runner!",
    welcomeIntro: "Run, earn kcal, turn them into pints. Here, every beer is earned.",
    welcomeAccueil: "🏃 Run → your keg fills up (258 kcal ≈ 1 pint)",
    welcomeRun: "⏳ Your keg drains on its own: 24h half-life",
    welcomeBtn: "Let's go! 🍺",
    gueuleBadge: "🍺 Hangover: gains −12% (drank < 12h ago)",
    soberBadge: "🌱 Sober {d} d: gains +{p}%",
    defisDesc: "Run with friends — the leaderboard lives here, the banter lives on WhatsApp 😄",
    defiNom: "Challenge name:", defiNomPh: "The Musketeers of Foam…",
    defiObj: "Goal (pints this week):", defiCreer: "💪 Start the challenge",
    defiCodeLbl: "Keg code:", defiRejoindre: "Join with a code",
    defiCodePh: "FOAM-42", defiInvalide: "Invalid code",
    defiWAInvite: "📲 Invite on WhatsApp",
    defiWAMsg: "🍺 Join my Beer Runner challenge! *{n}* — goal: {o} pints burned this week. Open the app, 🏁 Group challenge tab, paste code {c}. May the best keg win! 🏃🔥",
    defiPublier: "📋 Post my score", defiScoreCopie: "Score copied!",
    defiScoreMsg: "🍺 Beer Runner · {n}\n👤 {p}\n🔥 {b} pints burned · {k} km this week\n🏅 {t} badges",
    defiCollerLbl: "Paste the group's scores:", defiCollerPh: "Paste your friends' messages here…",
    defiClasse: "Rank!", defiPodium: "🏆 Podium", defiPersonnel: "you",
    defiQuit: "Leave challenge", defiAucun: "No challenge yet — start one or join a code!",
    home: "← Home", homeBtn: "Home",
    brasseriesContact: "🍺 Brewery? Become Beer Runner's official keg",
    temps: "TIME", vitesse: "⚡ Speed:", distanceTxt: "📏 Distance:", pintePourToi: "🍺 1 pint = {k} km for you",
    tempsPinte: "⏱️ Time to burn 1 pint:", calcule: "run to calculate…",
    pause: "⏸ Pause", reprendre: "Resume", courir: "Run", terminerBtn: "↺ Finish",
    extra: " (+{n} extra!)", bonus: "Bonus pint n°{n}!", bonusDesc: "You're past your goal — {n} pints burned!",
    gpsNo: "📡 No GPS → simulation 🎮", gpsSeek: "📡 Looking for GPS signal…",
    boltMsg: "🚀 44.7 km/h reached! Either you're a world champion 🏆, or you're in a vehicle 😅",
    warmupTitre: "⏳ Warm-up",
    warmupDesc: "Under 10 min of running: nothing burned! (at 7-8 km/h, you need at least ~1.2 km)",
    warmupInfo: "🔥 {m} more min of warm-up — then your 1st pint starts counting!",
    regle10: "⏳ The 10-min rule: your body needs at least 10 minutes of effort before tapping into reserves — before that, nothing burned. Bonus: distance run during warm-up still counts!",
    gpsOk: "📡 GPS active — run!", gpsRefus: "📡 GPS denied → simulation 🎮",
    badgeUnlock: "BADGE UNLOCKED!", copie: "Copied!", copieDesc: "Summary copied — think #BeerRunner 😉",
    bilanTitre: "📊 Weekly summary", partager: "📤 Share",
    pintes: "pints", pinte: "pint", pintesTotal: "pints burned in total", palier: "next tier:",
    eliminees: "🍺 BURNED", kcalElim: "🔥 KCAL BURNED", trendTitre: "📈 Trend · 12 weeks", trendNow: "now", trendTotal: "12-week total:", hausse: "📈 Up", baisse: "📉 Down", stable: "➖ Steady",
    vsDerniere: "vs last week ({p} 🍺):", serie: "Streak: {n} d 🔥",
    aucune: "No runs this week… your pint is waiting! 🍺🏃",
    trophees: "🏅 Trophies ({n}/{t})",
    bravo: "CHEERS !", objAtteint: "Goal reached:", enTime: "in",
    pinteNr: "Pint n°{n} burned!",
    totalLine: "Total: {p} pints · Level: {e} {n} · Streak: {s} d 🔥",
    continuer: "Keep going 🏃", terminer: "Finish",
    brasseriesTitre: "🍺 Find your pub",
    brasseriesDesc: "Find where to celebrate your burned pints — the microbreweries around your running routes.",
    locateMe: "Locate me", locating: "Locating…", reSituer: "Position found ✓ (refresh)",
    ouVille: "or city:", maPos: "my location",
    posOk: "✓ Position found — results open in Maps around you",
    posErr: "Position unavailable — enter your city above, works the same!",
    ouvrirMaps: "Open in Maps →",
    astuce: "Tip: the map opens centered on your running position — perfect to spot the brewery 500 m from your finish line. Cheers! 🍻",
    total: "total",
    shareTxt: "🍻 Beer Runner™ — {d}\nThis week: {km} km = {p} pints burned!\nTotal: {tp} pints · Level {n}\n{b} badges 🏅\n#BeerRunner #RunToDrink → beerrunner.app",
  },
};
const t = (k, p, lg) => {
  const lang = lg || L();
  let s = (TXT[lang] && TXT[lang][k]) || TXT.fr[k] || k;
  if (p) for (const key in p) s = s.split("{" + key + "}").join(String(p[key]));
  return s;
};
// ---------- traductions niveaux & badges ----------
const NIVEAUX_EN = ["Thirsty", "Brewer Apprentice", "Pint Runner", "Bar Regular", "Keg Master", "Pub Legend", "Trail-Brewing Myth", "Foam Emperor", "Hops Deity"];
const nName = (nv, lg) => ((lg || L()) === "en" ? NIVEAUX_EN[NIVEAUX.findIndex((n) => n.min === nv.min)] || nv.nom : nv.nom);
const BADGES_EN = {
  first_run: ["First Head", "Finish your 1st run"],
  first_pint: ["First Crash", "Burn 1 pint in total"],
  oktoberfest: ["Oktoberfest", "14 pints in one week (Munich's Big Mass)"],
  pintskeller: ["Pints Keller Dublin", "7 pints in one week (Irish spirit)"],
  cantillon: ["Cantillon Brussels", "21 pints in one week (the Brussels one)"],
  week3: ["Apero Athlete", "3 pints in one week"],
  perfect_week: ["The Trappist Week", "Run 3 days this week"],
  streak3: ["Beer-Run Habit", "3 days in a row"],
  streak7: ["Flemish Week", "7 days in a row (like brewing monks)"],
  streak30: ["Trappist Monk", "30 days in a row (patience & hops)"],
  run5: ["The Small Half", "5 km in one run"],
  run10: ["Kölsch of Cologne", "10 km in one run"],
  run15: ["Keg Rider", "15 km in one run"],
  run20: ["Hop Eagle", "20 km in one run"],
  run25: ["Foam Spitter", "25 km in one run"],
  run30: ["Brewing Bull", "30 km in one run"],
  semi: ["The Half-Crash", "21.1 km in one go (half)"],
  marathon: ["MARATHONER!", "42.2 km in one go"],
  ultra: ["Ultra-Pint", "60 km in one go"],
  run4h: ["Keg Forcer", "2h running in one go"],
  km10: ["Ten Markers", "10 km in total"],
  km42: ["Oktoberfest Road", "42.2 km in total"],
  km100: ["Centurion", "100 km in total"],
  km250: ["The Brewers' Road", "250 km in total"],
  km500: ["Around the Hop World", "500 km in total"],
  km1000: ["A Thousand Kays!", "1000 km in total"],
  pints10: ["The Ten", "10 pints in total"],
  pints50: ["The Bavarian Fifty", "50 pints in total"],
  pints100: ["The Golden Keg", "100 pints in total"],
  pints365: ["The Vintage", "365 pints in total"],
  triple: ["Triple Service", "3 pints in one run"],
  sixpack: ["Six-Pack (of beers!)", "6 pints in one run"],
  keg: ["Keg Piercer", "10 pints in one run"],
  brewery: ["Buy the Brewery", "20 pints in one run"],
  hour: ["The Beer Hour", "1h running in total"],
  hours10: ["Ten Hours at the Bar", "10h running in total"],
  hours24: ["Keg Day", "24h running in total"],
};
const bn = (b, lg) => ((lg || L()) === "en" && BADGES_EN[b.id] ? BADGES_EN[b.id][0] : b.nom);
const bd = (b, lg) => ((lg || L()) === "en" && BADGES_EN[b.id] ? BADGES_EN[b.id][1] : b.desc);
// ---------- thème : fond sombre + texte clair (style d'origine) ----------
function ThemeCss() {
  return null;
}
// ================= COMPOSANTS UI =================
// ---------- Toast badge ----------
function Toast({ toast, lang }) {
  const T = (k, p) => t(k, p, lang);
  if (!toast) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw]">
      <div className="flex items-center gap-3 bg-gray-900 border-2 border-amber-500 rounded-2xl px-4 py-3 shadow-xl shadow-amber-500/30 animate-pulse">
        <span className="text-3xl">{toast.emoji}</span>
        <div>
          <div className="text-amber-400 font-black text-sm">{T("badgeUnlock")}</div>
          <div className="text-white text-sm font-bold">{toast.nom}</div>
          <div className="text-white/60 text-xs">{toast.desc}</div>
        </div>
      </div>
    </div>
  );
}
// ---------- Pinte nonic britannique (sans mousse, une pinte à la fois) ----------
// - la pinte active se remplit ; pleine → elle rejoint le "rack" sur le côté
// - la suivante repart de zéro — PAS de graduations (ça n'a pas de sens)
// - max 32 pintes affichées (= 100 km à 70 kg), ensuite compteur "+N"
function Pinte({ fill, goal, light, lang }) {
  const T = (k, p) => t(k, p, lang);
  const MAX_RACK = 32; // 100 km ≈ 32 pintes max affichées
  const W = light ? "42,38,32" : "255,255,255";
  const pints = fill / KCAL_PAR_PINTE;              // pintes complètes éliminées
  const nbDone = Math.floor(Math.min(pints, MAX_RACK)); // pintes dans le rack
  const restants = Math.max(0, Math.floor(pints) - MAX_RACK);
  const fillCur = Math.min(pints - Math.floor(pints), 1); // remplissage 0→1 de la pinte active
  const TOP_BEER = 42, BOT_BEER = 178;
  const beerY = BOT_BEER - (BOT_BEER - TOP_BEER) * fillCur;
  const full = fillCur >= 0.999;
  return (
    <div className="flex items-center justify-center gap-1.5 w-full max-w-md">
      {/* rack des pintes terminées — sur le côté */}
      {nbDone > 0 && (
        <div className="flex flex-col gap-1 max-h-48 overflow-hidden">
          <div className="grid grid-cols-2 gap-x-1 gap-y-0.5">
            {Array.from({ length: nbDone }, (_, i) => (
              <span key={i} className="text-[13px] leading-none">🍺</span>
            ))}
          </div>
          {restants > 0 && <span className="text-[11px] text-amber-300 font-bold text-center">+{restants}</span>}
        </div>
      )}
      {/* pinte active */}
      <div className="flex flex-col items-center gap-2">
        <svg viewBox="0 0 220 210" className="w-52 h-48">
          <defs>
            <linearGradient id="beerG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="55%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="beerShade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0.30)" />
              <stop offset="30%" stopColor="rgba(255,255,255,0)" />
              <stop offset="72%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.22)" />
            </linearGradient>
            <linearGradient id="glassG" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={`rgba(${W},0.28)`} />
              <stop offset="20%" stopColor={`rgba(${W},0.04)`} />
              <stop offset="80%" stopColor={`rgba(${W},0.04)`} />
              <stop offset="100%" stopColor={`rgba(${W},0.20)`} />
            </linearGradient>
            <radialGradient id="glowG" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="rgba(245,158,11,0.22)" />
              <stop offset="100%" stopColor="rgba(245,158,11,0)" />
            </radialGradient>
            <clipPath id="verre">
              <path d="M64 42 C64 50 56 52 56 66 C56 78 64 80 64 92 L64 170 Q64 176 70 176 L150 176 Q156 176 156 170 L156 92 C156 80 164 78 164 66 C164 52 156 50 156 42 Z" />
            </clipPath>
          </defs>
          <ellipse cx="110" cy="115" rx="92" ry="100" fill="url(#glowG)" />
          <ellipse cx="110" cy="192" rx="58" ry="8" fill="rgba(0,0,0,0.45)" />
          <g clipPath="url(#verre)">
            {/* bière : remplit TOUT le verre, du fond au bord supérieur — aucun vide en bas */}
            <rect x="50" y={beerY} width="120" height={BOT_BEER - beerY + 6} fill="url(#beerG)" />
            <rect x="50" y={beerY} width="120" height={BOT_BEER - beerY + 6} fill="url(#beerShade)" />
            <ellipse cx="110" cy={beerY} rx="52" ry="3.5" fill="rgba(254,240,138,0.5)" />
            <rect x="76" y={beerY} width="7" height={BOT_BEER - beerY} fill="rgba(255,255,255,0.4)" rx="3.5" />
            {/* écume dorée au sommet quand la pinte est pleine */}
            {full && (
              <g>
                <ellipse cx="110" cy={TOP_BEER + 2} rx="50" ry="6" fill="#fef3c7" opacity="0.95" />
                <ellipse cx="90" cy={TOP_BEER - 1} rx="16" ry="5" fill="#fffbeb" />
                <ellipse cx="128" cy={TOP_BEER} rx="13" ry="4" fill="#fef9c3" />
              </g>
            )}
            {fillCur > 0.04 && [
              { cx: 84, r: 2, d: 2.8, dl: 0 }, { cx: 104, r: 1.4, d: 3.4, dl: 1.1 },
              { cx: 126, r: 2.3, d: 2.3, dl: 0.5 }, { cx: 142, r: 1.6, d: 3.1, dl: 1.8 },
              { cx: 72, r: 1.2, d: 3.7, dl: 0.9 },
            ].map((b, i) => (
              <circle key={i} cx={b.cx} cy="172" r={b.r} fill="rgba(255,255,255,0.7)">
                <animate attributeName="cy" from="172" to={beerY + 5} dur={`${b.d}s`} begin={`${b.dl}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.8;0.8;0" dur={`${b.d}s`} begin={`${b.dl}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
          {/* repère « 1 PINT » collé en haut du verre = niveau d'une pinte pleine */}
          <g opacity="0.75">
            <line x1="86" y1="44" x2="134" y2="44" stroke={`rgba(${W},0.55)`} strokeWidth="1.3" />
            <text x="110" y="38" textAnchor="middle" fontSize="11" fontWeight="800"
              fill={`rgba(${W},0.9)`} letterSpacing="2">1 PINT</text>
            <text x="110" y="52" textAnchor="middle" fontSize="7" fill={`rgba(${W},0.6)`} letterSpacing="1">· 568 ml ·</text>
          </g>
          <rect x="58" y="28" width="104" height="14" rx="6"
            fill={`rgba(${W},0.15)`} stroke={`rgba(${W},0.85)`} strokeWidth="2.5" />
          <path d="M60 42 C60 50 52 52 52 66 C52 78 60 80 60 92 L60 170 Q60 176 66 176 L154 176 Q160 176 160 170 L160 92 C160 80 168 78 168 66 C168 52 160 50 160 42"
            fill="url(#glassG)" stroke={`rgba(${W},0.8)`} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M60 50 C60 58 52 60 52 66 C52 72 60 74 60 80" fill="none" stroke={`rgba(${W},0.3)`} strokeWidth="1.2" />
          <path d="M160 50 C160 58 168 60 168 66 C160 72 168 74 160 80" fill="none" stroke={`rgba(${W},0.3)`} strokeWidth="1.2" />
          <line x1="70" y1="56" x2="70" y2="158" stroke={`rgba(${W},0.4)`} strokeWidth="4.5" strokeLinecap="round" />
          <line x1="70" y1="62" x2="70" y2="152" stroke={`rgba(${W},0.22)`} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="150" y1="106" x2="150" y2="156" stroke={`rgba(${W},0.15)`} strokeWidth="3" strokeLinecap="round" />
          <circle cx="96" cy="126" r="1.5" fill={`rgba(${W},0.5)`} />
          <circle cx="132" cy="140" r="1.2" fill={`rgba(${W},0.4)`} />
          <circle cx="84" cy="144" r="1.1" fill={`rgba(${W},0.35)`} />
        </svg>
        <div className="text-lg font-black text-amber-300 drop-shadow">
          {pints.toFixed(2)} / {goal} 🍺
          {full && goal > Math.floor(pints) && <span className="text-green-400 ml-1">{T("extra", { n: "1" })}</span>}
        </div>
      </div>
    </div>
  );
}
// ---------- Grand BRAVO ----------
function Bravo({ pintsWon, final, goal, goalText, time, onContinue, onHome, lang, light }) {
  const T = (k, p) => t(k, p, lang);
  const s = stats();
  const nv = niveauDe(s.totalPintes);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur px-4">
      <div className="bg-gray-900 border-4 border-amber-500 rounded-3xl p-8 text-center max-w-sm w-full">
        <div className="text-7xl mb-3">{final ? "🍻🏆" : "🍻🎉"}</div>
        <h2 className="text-5xl font-black text-amber-400 mb-3">{T("bravo")}</h2>
        {final ? (
          <p className="text-lg text-white/90 mb-2">
            {T("objAtteint")} <b className="text-amber-300">{goalText || `${goal} ${T(goal > 1 ? "pintes" : "pinte")}`}</b> {T("enTime")}{" "}
            <b className="text-amber-300">{fmtTime(time)}</b> !
          </p>
        ) : (
          <p className="text-xl text-white/90 mb-2">
            {T("pinteNr", { n: pintsWon })}
          </p>
        )}
        <p className="text-sm text-white/60 mb-5">
          {T("totalLine", { p: s.totalPintes.toFixed(1), e: nv.emoji, n: nName(nv, lang), s: s.streak })}
        </p>
        <div className="flex gap-3 justify-center">
          {!final && (
            <button onClick={onContinue}
              className="px-8 py-3 rounded-full bg-amber-500 text-black text-xl font-black">
              {T("continuer")}
            </button>
          )}
          <button onClick={onHome}
            className={`px-6 py-3 rounded-full font-bold ${final ? "bg-amber-500 text-black font-black" : "bg-white/10 text-white"}`}>
            {final ? T("terminer") : T("homeBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
// ---------- Avatar (logo fun choisi dans la bibliothèque) ----------
const LOGOS = [
  // bières & verres
  "🍺", "🍻", "🥃", "🍷", "🫗", "🛢️", "🏺", "🫙",
  // personnages drôles / métiers
  "🧔", "👨‍🌾", "🕵️", "🧙", "🥸", "🤠", "🧛", "🦸",
  "👨‍🍳", "👷", "🎅", "🤶", "🧑‍🎄", "🥷", "👽", "🤖",
  // bestioles marrantes
  "🦖", "🦆", "🐧", "🦉", "🐺", "🦊", "🐻", "🐗",
  "🐸", "🦛", "🐙", "🦞", "🦩", "🐿️", "🦔", "🐢",
  // esprit course / trail
  "🏃", "🏃‍♂️", "🏃‍♀️", "🥾", "👟", "🏔️", "🦅", "🔥",
  // gloire & fun
  "🥇", "🏆", "👑", "⚡", "🕺", "🤾", "💪", "🏆",
];
function Avatar({ profile }) {
  const logo = profile.logo || "🍺"; // la bière en standard tant que rien n'est choisi
  return (
    <span className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl shrink-0">
      {logo}
    </span>
  );
}
// ---------- Sélecteur de logo fun ----------
function LogoPicker({ profile, setProfile }) {
  const [open, setOpen] = useState(false);
  const choose = (l) => {
    const p = { ...profile, logo: l, photo: null };
    setProfile(p); saveProfile(p);
    setOpen(false);
  };
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold">
        {open ? "✕ Fermer" : "🎭 Changer de logo"}
      </button>
      {open && (
        <div className="mt-3 bg-white/5 rounded-2xl p-3 border border-white/10 space-y-2">
          {[
            { titre: "🍺 Bières & verres", debut: 0, fin: 8 },
            { titre: "🥸 Persos rigolos", debut: 8, fin: 24 },
            { titre: "🦉 Bestioles", debut: 24, fin: 40 },
            { titre: "🏃 Course & trail", debut: 40, fin: 48 },
            { titre: "🏆 Gloire", debut: 48, fin: 56 },
          ].map((cat) => (
            <div key={cat.titre}>
              <p className="text-[12px] text-amber-400/70 font-bold mb-1">{cat.titre}</p>
              <div className="grid grid-cols-8 gap-1.5">
                {LOGOS.slice(cat.debut, cat.fin).map((l) => (
                  <button key={l + cat.debut} onClick={() => choose(l)}
                    className={`aspect-square rounded-xl text-2xl flex items-center justify-center transition
                      ${profile.logo === l ? "bg-amber-500/40 border border-amber-400 scale-110" : "bg-white/5 border border-white/10 hover:bg-white/15"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ---------- Page Défi de groupe (option A : code du fût + WhatsApp, sans serveur) ----------
// - créer un défi → code court généré (ex. MOUSSE-42)
// - inviter via lien WhatsApp pré-rempli
// - publier son score → message formaté copié, à coller dans le groupe
// - coller les scores du groupe → parse + podium 🥇🥈🥉
function Defis({ onHome, onToast, lang, theme }) {
  const T = (k, p) => t(k, p, lang);
  const [defi, setDefi] = useState(load("brDefi", null));   // {nom, obj, code}
  const [nom, setNom] = useState("");
  const [obj, setObj] = useState(10);
  const [codeIn, setCodeIn] = useState("");
  const [scoresIn, setScoresIn] = useState("");
  const [podium, setPodium] = useState(null);
  const p = loadProfile();
  const jours = semaine();
  const weekPintes = jours.reduce((t, d) => t + d.pintes, 0);
  const weekKm = jours.reduce((t, d) => t + d.km, 0);
  const m = loadMeta();
  const genCode = () => {
    const mots = ["MOUSSE", "HOUBLON", "MALTS", "PILOU", "FUTS", "KARMEL", "DUVEL", "CHOUF", "KRAK", "TRAPPI", "GALOP", "PRELOU"];
    return `${mots[Math.floor(Math.random() * mots.length)]}-${Math.floor(10 + Math.random() * 90)}`;
  };
  const creer = () => {
    const n = nom.trim().slice(0, 40) || "Beer Runner Challenge";
    const o = Math.max(1, Math.min(100, Math.round(obj) || 10));
    const d = { nom: n, obj: o, code: genCode() };
    save("brDefi", d);
    setDefi(d);
    onToast({ emoji: "🏁", nom: T("defiCodeLbl"), desc: d.code });
  };
  const rejoindre = () => {
    const c = codeIn.trim().toUpperCase();
    if (c.length < 3) { onToast({ emoji: "❌", nom: T("defiInvalide"), desc: c }); return; }
    const d = { nom: codeIn.trim().toUpperCase(), obj: 10, code: c };
    save("brDefi", d);
    setDefi(d);
  };
  const quitter = () => { save("brDefi", null); setDefi(null); setPodium(null); };
  const copier = async (txt, nomToast) => {
    try { await navigator.clipboard.writeText(txt); onToast({ emoji: "📋", nom: nomToast, desc: "" }); }
    catch {
      try { document.execCommand("copy"); } catch {}
      onToast({ emoji: "📋", nom: nomToast, desc: "" });
    }
  };
  // lien WhatsApp pré-rempli (wa.me — s'ouvre dans n'importe quel WhatsApp)
  const lienWA = () => {
    const msg = T("defiWAMsg", { n: defi.nom, o: defi.obj, c: defi.code });
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };
  const publier = () => {
    const scoreMsg = T("defiScoreMsg", {
      n: defi.nom, p: p.pseudo || "Moi", b: weekPintes.toFixed(1), k: weekKm.toFixed(1), t: m.badges.length,
    });
    copier(scoreMsg, T("defiScoreCopie"));
  };
  // parse les scores collés : lignes "👤 pseudo" + "🔥 X pintes"
  const classer = () => {
    const lignes = scoresIn.split("\n");
    const res = [];
    let cur = null;
    for (const l of lignes) {
      const mu = l.match(/👤\s*(.+)/);
      if (mu) { if (cur) res.push(cur); cur = { pseudo: mu[1].trim().slice(0, 20), pintes: 0 }; continue; }
      const mp = l.match(/([\d.,]+)\s*(?:🍺|pintes?|pints?)/i);
      if (mp && cur) { cur.pintes = parseFloat(mp[1].replace(",", ".")) || 0; continue; }
      const mk = l.match(/([\d.,]+)\s*km/i);
      if (mk && cur) { cur.km = parseFloat(mk[1].replace(",", ".")) || 0; }
    }
    if (cur) res.push(cur);
    // ajoute mon score à moi
    res.push({ pseudo: p.pseudo || "Moi", pintes: weekPintes, km: weekKm, moi: true });
    // dédoublonne par pseudo (moi = priorité au score local)
    const vus = new Set();
    const uniq = res.filter((r) => { const k = (r.pseudo || "").toLowerCase(); if (vus.has(k)) return false; vus.add(k); return true; });
    uniq.sort((a, b) => b.pintes - a.pintes);
    setPodium(uniq);
  };
  return (
    <div className={`${theme} min-h-screen bg-gray-950 text-white flex flex-col items-center gap-4 pt-4 pb-8 px-4`}>
      <ThemeCss />
      <div className="w-full max-w-md flex items-center justify-between">
        <button onClick={onHome} className="px-5 py-2.5 rounded-full bg-amber-500/25 border border-amber-500/50 text-amber-200 text-sm font-black active:scale-95 transition">{T("home")}</button>
        {defi && <button onClick={quitter} className="px-3 py-1.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-[13px] font-bold">{T("defiQuit")}</button>}
      </div>
      <h1 className="text-3xl font-black text-amber-400">{T("defisTitre")}</h1>
      <p className="text-xs text-white/50 -mt-3 text-center max-w-sm">{T("defisDesc")}</p>
      {!defi ? (
        <div className="w-full max-w-md space-y-4">
          {/* créer */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-3">
            <div>
              <label className="text-[13px] text-white/60 font-bold">{T("defiNom")}</label>
              <input value={nom} placeholder={T("defiNomPh")} onChange={(e) => setNom(e.target.value.slice(0, 40))}
                className="w-full bg-white/10 rounded-xl px-3 py-2 text-sm outline-none mt-1" />
            </div>
            <div>
              <label className="text-[13px] text-white/60 font-bold">{T("defiObj")}</label>
              <div className="flex items-center gap-3 mt-1">
                <button onClick={() => setObj(Math.max(1, obj - 1))} className="w-9 h-9 rounded-full bg-amber-500 text-black text-xl font-black">−</button>
                <div className="text-xl font-black text-amber-300 w-16 text-center">{obj} 🍺</div>
                <button onClick={() => setObj(Math.min(100, obj + 1))} className="w-9 h-9 rounded-full bg-amber-500 text-black text-xl font-black">+</button>
              </div>
            </div>
            <button onClick={creer} className="w-full py-3 rounded-full bg-amber-500 text-black font-black">{T("defiCreer")}</button>
          </div>
          {/* rejoindre */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <label className="text-[13px] text-white/60 font-bold">{T("defiCodeLbl")}</label>
            <div className="flex gap-2 mt-1">
              <input value={codeIn} placeholder={T("defiCodePh")} onChange={(e) => setCodeIn(e.target.value.slice(0, 20))}
                className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-sm outline-none uppercase" />
              <button onClick={rejoindre} className="px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-sm">{T("defiRejoindre")}</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-4">
          {/* résumé du défi */}
          <div className="bg-gradient-to-r from-amber-500/15 to-transparent rounded-2xl p-4 border border-amber-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-black text-amber-300 truncate">{defi.nom}</div>
              <div className="px-2 py-1 rounded-lg bg-white/10 text-[13px] font-black tracking-wider">{defi.code}</div>
            </div>
            <div className="text-[13px] text-white/60">{T("defiObj")} <b className="text-amber-300">{defi.obj} 🍺</b></div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600"
                style={{ width: `${Math.min((weekPintes / defi.obj) * 100, 100)}%` }} />
            </div>
            <div className="text-xs text-white/70">{weekPintes.toFixed(1)} / {defi.obj} 🍺 · {weekKm.toFixed(1)} km</div>
          </div>
          {/* WhatsApp + score */}
          <div className="grid grid-cols-2 gap-2">
            <a href={lienWA()} target="_blank" rel="noopener noreferrer"
              className="py-3 rounded-full bg-green-500/20 border border-green-500/40 text-green-300 text-sm font-black text-center">{T("defiWAInvite")}</a>
            <button onClick={publier}
              className="py-3 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-black">{T("defiPublier")}</button>
          </div>
          {/* coller les scores */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-2">
            <label className="text-[13px] text-white/60 font-bold">{T("defiCollerLbl")}</label>
            <textarea value={scoresIn} placeholder={T("defiCollerPh")} onChange={(e) => setScoresIn(e.target.value.slice(0, 2000))}
              rows={4} className="w-full bg-white/10 rounded-xl px-3 py-2 text-xs outline-none resize-none" />
            <button onClick={classer} className="w-full py-2 rounded-full bg-amber-500 text-black font-black text-sm">{T("defiClasse")}</button>
          </div>
          {/* podium */}
          {podium && (
            <div className="bg-white/5 rounded-2xl p-4 border border-amber-500/30 space-y-2">
              <h2 className="font-black text-amber-300 text-sm">{T("defiPodium")}</h2>
              {podium.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.moi ? "bg-amber-500/15 border border-amber-500/40" : "bg-white/5"}`}>
                  <div className="text-lg w-7 text-center">{["🥇", "🥈", "🥉"][i] || `#${i + 1}`}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{r.pseudo}{r.moi ? ` (${T("defiPersonnel")})` : ""}</div>
                    {r.km > 0 && <div className="text-[12px] text-white/50">{r.km.toFixed(1)} km</div>}
                  </div>
                  <div className="text-sm font-black text-amber-300">{r.pintes.toFixed(1)} 🍺</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// ---------- Écran Bilan & Trophées ----------
function Bilan({ onHome, onToast, lang, theme }) {
  const T = (k, p) => t(k, p, lang);
  const [vue, setVue] = useState("pintes"); // vue du graphe 12 semaines : "pintes" | "kcal" | "km"
  const days = semaine();
  const totKm = days.reduce((t, d) => t + d.km, 0);
  const totSec = days.reduce((t, d) => t + d.sec, 0);
  const totPintes = days.reduce((t, d) => t + d.pintes, 0);
  const poids = kcalKm();
  const totKcal = kcalNettes(totKm, totSec, poids);
  // 12 dernières semaines (lundi → dimanche), pour le graphe tendance type Garmin
  const semaines12 = (() => {
    const h = loadHist();
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const lundi = new Date(now); lundi.setDate(lundi.getDate() - ((now.getDay() + 6) % 7));
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const l = new Date(lundi); l.setDate(l.getDate() - i * 7);
      let km = 0;
      for (let j = 0; j < 7; j++) {
        const d = new Date(l); d.setDate(d.getDate() + j);
        const r = h[fmtDateKey(d)]; if (r) km += r.km || 0;
      }
      const kc = kcalNettes(km, km * 300, poids); // allure moyenne représentative 12 km/h
      out.push({ km, kcal: kc, pintes: kc / KCAL_PAR_PINTE });
    }
    return out;
  })();
  const valDe = (w) => vue === "km" ? w.km : vue === "kcal" ? w.kcal : w.pintes;
  const maxSem = Math.max(...semaines12.map(valDe), 0.001);
  const totSem = semaines12.reduce((t, w) => t + valDe(w), 0);
  const prevPintes = semainePrecedente();
  const diff = totPintes - prevPintes;
  const maxKm = Math.max(...days.map((d) => d.km), 0.1);
  const m = loadMeta();
  const s = stats();
  const nv = niveauDe(s.totalPintes);
  const nextNv = NIVEAUX.find((n) => n.min > s.totalPintes);
  const dateStr = new Date().toLocaleDateString(L() === "en" ? "en-GB" : "fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className={`${theme} min-h-screen bg-gray-950 text-white flex flex-col items-center gap-5 pt-4 pb-8 px-4`}>
      <ThemeCss />
      <div className="w-full max-w-md flex items-center justify-between">
        <button onClick={onHome} className="px-5 py-2.5 rounded-full bg-amber-500/25 border border-amber-500/50 text-amber-200 text-sm font-black active:scale-95 transition">{T("home")}</button>
      </div>
      <h1 className="text-3xl font-black text-amber-400">{T("bilanTitre")}</h1>
      <p className="text-xs text-white/50 -mt-3 capitalize">{dateStr}</p>
      <p className="text-[12px] text-white/60 -mt-2">{T("streakHome", { n: s.streak })}</p>
      {/* carte niveau */}
      <div className="w-full max-w-md bg-gradient-to-r from-amber-500/15 to-transparent rounded-2xl p-4 border border-amber-500/30 flex items-center gap-4">
        <div className="text-4xl">{nv.emoji}</div>
        <div className="flex-1">
          <div className="text-amber-300 font-black">{nName(nv, lang)}</div>
          <div className="text-xs text-white/60 mb-1">
            {s.totalPintes.toFixed(1)} {T("pintesTotal")}
            {nextNv && <> · {T("palier")} {nextNv.min} 🍺</>}
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-amber-600"
              style={{ width: nextNv ? `${Math.min(((s.totalPintes - nv.min) / (nextNv.min - nv.min)) * 100, 100)}%` : "100%" }} />
          </div>
        </div>
      </div>
      {/* totaux semaine : km · pintes · kcal · temps */}
      <div className="grid grid-cols-4 gap-2 w-full max-w-md">
        <div className="bg-white/5 rounded-2xl p-3 text-center border border-white/10">
          <div className="text-xl font-black text-amber-300">{totKm.toFixed(1)}</div>
          <div className="text-[12px] text-white/60">KM</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 text-center border border-amber-500/40">
          <div className="text-xl font-black text-amber-300">{totPintes.toFixed(1)}</div>
          <div className="text-[12px] text-white/60">{T("eliminees")}</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 text-center border border-white/10">
          <div className="text-xl font-black text-amber-300">{Math.round(totKcal)}</div>
          <div className="text-[12px] text-white/60">{T("kcalElim")}</div>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 text-center border border-white/10">
          <div className="text-xl font-black text-amber-300">{fmtTime(totSec)}</div>
          <div className="text-[12px] text-white/60">TEMPS</div>
        </div>
      </div>
      {/* tendance 12 semaines type Garmin — cliquable : 🍺 / kcal / km */}
      <div className="w-full max-w-md bg-white/5 rounded-2xl p-4 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-amber-300 text-sm">{T("trendTitre")}</h2>
          <div className="flex gap-1">
            {[["pintes", "🍺"], ["kcal", "🔥"], ["km", "🏃"]].map(([v, e]) => (
              <button key={v} onClick={() => setVue(v)}
                className={`px-2 py-0.5 rounded-full text-[13px] font-bold ${vue === v ? "bg-amber-500 text-black" : "bg-white/10 text-white/60 hover:bg-white/20"}`}>{e}</button>
            ))}
          </div>
        </div>
        <div className="flex items-end justify-between gap-1 h-28">
          {semaines12.map((w, i) => {
            const val = valDe(w);
            const der = i === semaines12.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
                title={`${val > 0 ? (vue === "kcal" ? Math.round(val) : val.toFixed(1)) : 0} ${vue === "kcal" ? "kcal" : vue === "km" ? "km" : "🍺"}`}>
                <div className={`w-full rounded-t-md ${der ? "bg-gradient-to-t from-amber-600 to-amber-400" : "bg-white/25"}`}
                  style={{ height: `${Math.max((val / maxSem) * 100, val > 0 ? 4 : 1.5)}%` }} />
                <div className="text-[8px] text-white/40 whitespace-nowrap">{der ? T("trendNow") : i % 2 === 0 ? `−${11 - i}` : ""}</div>
              </div>
            );
          })}
        </div>
        <div className="text-center text-[12px] text-white/50">
          {T("trendTotal")}{" "}
          <b className="text-amber-300">
            {vue === "kcal" ? Math.round(totSem).toLocaleString() : totSem.toFixed(1)}
            {vue === "kcal" ? " kcal" : vue === "km" ? " km" : " 🍺"}
          </b>
        </div>
      </div>
      {/* comparaison semaine précédente */}
      <div className="w-full max-w-md bg-white/5 rounded-2xl p-3 border border-white/10 text-center text-sm">
        {totKm > 0 ? (
          <>
            {diff > 0 ? T("hausse") : diff < 0 ? T("baisse") : T("stable")} {T("vsDerniere", { p: prevPintes.toFixed(1) })}{" "}
            <b className={diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-white/70"}>
              {diff > 0 ? "+" : ""}{diff.toFixed(1)} {T("pintes")}
            </b>
            {" "}· {T("serie", { n: s.streak })}
          </>
        ) : T("aucune")}
      </div>
      {/* barres par jour */}
      <div className="w-full max-w-md bg-white/5 rounded-2xl p-4 border border-white/10 space-y-2">
        {days.map((d) => (
          <div key={d.key} className="flex items-center gap-3">
            <div className="w-12 text-xs text-white/60 text-right">{d.jour} {d.num}</div>
            <div className="flex-1 h-5 rounded-full bg-white/10 overflow-hidden relative">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600"
                style={{ width: `${(d.km / maxKm) * 100}%` }} />
              {d.km > 0 && (
                <span className="absolute left-2 top-0 text-[12px] font-bold text-black leading-5">{d.km.toFixed(1)} km</span>
              )}
            </div>
            <div className="w-16 text-xs font-bold text-amber-300 text-left">
              {d.km > 0 ? `🍺 ${d.pintes.toFixed(1)}` : "—"}
            </div>
          </div>
        ))}
      </div>
      {/* trophées */}
      <div className="w-full max-w-md bg-white/5 rounded-2xl p-4 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-amber-300">{T("trophees", { n: m.badges.length, t: BADGES.length })}</h2>
          <span className="text-xs text-white/50">{T("serie", { n: s.streak })}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {BADGES.map((b) => {
            const ok = m.badges.includes(b.id);
            return (
              <div key={b.id}
                className={`rounded-xl p-2 text-center border ${ok ? "bg-amber-500/15 border-amber-500/40" : "bg-white/5 border-white/10 opacity-40"}`}
                title={bd(b, lang)}>
                <div className="text-2xl">{ok ? b.emoji : "🔒"}</div>
                <div className="text-[12px] font-bold text-white/85 leading-tight">{bn(b, lang)}</div>
                <div className="text-[8px] text-white/50 leading-tight">{bd(b)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
// ---------- Page Brasseries locales (géolocalisée, sans API) ----------
function Brasseries({ onHome, onToast, lang, theme }) {
  const T = (k, p) => t(k, p, lang);
  const [pos, setPos] = useState(null);       // {lat, lon}
  const [statut, setStatut] = useState("idle"); // idle | cherche | ok | err
  const [ville, setVille] = useState(load("brVille", ""));
  const chercher = () => {
    setStatut("cherche");
    if (!navigator.geolocation) { setStatut("err"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lon: p.coords.longitude }); setStatut("ok"); },
      () => setStatut("err"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  // liens Google Maps ciblés — marche sans aucune API ni clé
  const q = (terme) => {
    if (pos) {
      return `https://www.google.com/maps/search/${encodeURIComponent(terme)}/@${pos.lat},${pos.lon},13z`;
    }
    const lieu = ville.trim() || T("maPos");
      return `https://www.google.com/maps/search/${encodeURIComponent(terme + " " + lieu)}`;
  };
  const CATEGORIES = [
    { emoji: "🏭", nom: "Micro-brasseries", nomEn: "Microbreweries", terme: "micro brasserie", termeEn: "microbrewery" },
    { emoji: "🍺", nom: "Bières artisanales", nomEn: "Craft beers", terme: "biere artisanale", termeEn: "craft beer" },
  ];
  return (
    <div className={`${theme} min-h-screen bg-gray-950 text-white flex flex-col items-center gap-5 pt-4 pb-8 px-4`}>
      <ThemeCss />
      <div className="w-full max-w-md flex items-center justify-between">
        <button onClick={onHome} className="px-5 py-2.5 rounded-full bg-amber-500/25 border border-amber-500/50 text-amber-200 text-sm font-black active:scale-95 transition">{T("home")}</button>
      </div>
      <h1 className="text-3xl font-black text-amber-400">{T("brasseriesTitre")}</h1>
      <p className="text-sm text-white/60 text-center max-w-md -mt-2">
        {T("brasseriesDesc")}
      </p>
      {/* géoloc */}
      <div className="w-full max-w-md bg-white/5 rounded-2xl p-4 border border-white/10 space-y-3">
        <button onClick={chercher}
          className="w-full py-3 rounded-xl bg-amber-500 text-black font-black">
          📍 {statut === "cherche" ? T("locating") : pos ? T("reSituer") : T("locateMe")}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50 whitespace-nowrap">{T("ouVille")}</span>
          <input value={ville} placeholder="Lyon, Annecy…"
            onChange={(e) => { setVille(e.target.value.slice(0, 30)); save("brVille", e.target.value.slice(0, 30)); }}
            className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-sm outline-none text-white" />
        </div>
        {statut === "ok" && (
          <p className="text-xs text-green-400 text-center">{T("posOk")}</p>
        )}
        {statut === "err" && (
          <p className="text-xs text-amber-400/80 text-center">{T("posErr")}</p>
        )}
      </div>
      {/* catégories de recherche — micro-brasseries & bières artisanales juste sous la localisation */}
      <div className="w-full max-w-md grid grid-cols-2 gap-3">
        {CATEGORIES.map((c) => (
          <a key={L() === "en" ? c.nomEn : c.nom} href={q(L() === "en" ? c.termeEn : c.terme)} target="_blank" rel="noopener noreferrer"
            className="bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/40 rounded-2xl p-4 text-center transition group">
            <div className="text-3xl mb-1 group-hover:scale-110 transition">{c.emoji}</div>
            <div className="text-sm font-bold text-white/90">{L() === "en" ? c.nomEn : c.nom}</div>
            <div className="text-[12px] text-amber-400/70 mt-1">{T("ouvrirMaps")}</div>
          </a>
        ))}
      </div>
      {/* LA BIÈRE DU JOUR — quotidienne, façon Jivay — après la recherche */}
      {(() => {
        const b = biereDuJour();
        const fa = (L() === "en" && BIERES_CULTES_EN[b.nom]) ? BIERES_CULTES_EN[b.nom] : b.fa;
        return (
          <div className="w-full max-w-md bg-white/5 rounded-2xl px-3 py-2 border border-white/10 text-left">
            <div className="flex items-center gap-2">
              <span className="text-lg shrink-0">{b.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[11px] text-amber-400/70 font-bold uppercase tracking-wide truncate">{T("biereJour")} <span className="text-amber-300 font-black normal-case">{b.nom}</span></div>
                  <div className="text-sm font-black text-amber-300 shrink-0">{b.force}</div>
                </div>
                <div className="text-[12px] leading-snug text-white/60">{b.type} · {b.origine}</div>
              </div>
            </div>
            <p className="text-[12px] leading-snug text-white/65 mt-1">{fa}</p>
          </div>
        );
      })()}
      <a href="mailto:ColibriAI.app@gmail.com"
        className="inline-block px-5 py-2.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-200 text-sm font-black active:scale-95 transition">
        {T("brasseriesContact")}
      </a>
      {/* bouton global retiré — 2 boutons max */}
      <p className="text-[12px] text-white/40 text-center max-w-md">
        {T("astuce")}
      </p>
    </div>
  );
}
// ================= APP =================
function App() {
  const [page, setPage] = useState("home");
  const [goal, setGoal] = useState(1);          // objectif en pintes (peut être fractionnaire en mode km)
  const [unit, setUnit] = useState("pintes");   // "pintes" | "km"
  const [running, setRunning] = useState(false);
  const [km, setKm] = useState(0);
  const [time, setTime] = useState(0);
  const startTsRef = useRef(null);  // date.now() au lancement → chrono insensible aux pauses JS
  const [pintsWon, setPintsWon] = useState(0);
  const [bravo, setBravo] = useState(false);
  const [gpsMsg, setGpsMsg] = useState(null);
  const [mode, setMode] = useState(null);
  const [toast, setToast] = useState(null);
  // modale de bienvenue : fermée uniquement à la main (bouton), rouvre à chaque connexion
  const [welcome, setWelcome] = useState(true);
  const [profile, setProfile] = useState(loadProfile());
  const [logoOpen, setLogoOpen] = useState(false);
  // PWA : événement d'installation natif (Android/Chrome) + rappel jeudi
  const [installEvt, setInstallEvt] = useState(null);
  const [lang, setLang] = useState(L());
  const [theme, setTheme] = useState("dark");
  const T = (k, p) => t(k, p, lang);
  const watchRef = useRef(null);
  // PWA : le navigateur propose l'installation → on capte l'événement pour notre bouton
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const lastPos = useRef(null);
  const lastTs = useRef(null);
  const speedsRef = useRef([]);
  const winRef = useRef([]);          // fenêtre glissante {ts, km} pour la vitesse
  const boltShownRef = useRef(false);
  const [vGps, setVGps] = useState(null);
  const pintsRef = useRef(0);
  const kmRef = useRef(0);
  // poids réactif : lu depuis l'état React (menu déroulant), PAS le localStorage
  // (dans l'aperçu canvas, localStorage peut être bloqué → valeur figée à 70)
  // kcal NETTES (modèle réaliste) × facteur de gain (gueule de bois / sobriété)
  const kcalKmNow = Number(profile.poids) || 70;
  const kcal = kcalNettes(km, time, kcalKmNow);
  // échauffement : 10 min avant de commencer à éliminer (cas lent 7-8 km/h → ~1,2 km min)
  const WARMUP_SEC = 600;
  const warmedUp = time >= WARMUP_SEC;
  const gueuleBois = consoRecente();
  const sobriete = bonusSobriete();
  const kcalEff = warmedUp ? kcal * gainFactorNow() : 0;
  // vitesse : lissée (GPS natif) si dispo, sinon moyenne distance/temps (simu)
  const vitesse = (mode === "gps" && vGps !== null) ? vGps : (time > 0 ? km / (time / 3600) : 0);
  const kp = KCAL_PAR_PINTE / kcalKmNow;
  const tempsParPinte = vitesse > 0 ? (kp / vitesse) * 3600 : null;
  // objectif canonique en pintes (le mode km stocke des km → conversion)
  const goalPintes = unit === "km" ? goal / kp : goal;
  // fin basée sur les kcal → exact dans les 2 modes (fix : avant, le mode km n'atteignait JAMAIS l'objectif)
  const finished = kcalEff >= goalPintes * KCAL_PAR_PINTE;
  const showToast = (b) => {
    setToast(b);
    setTimeout(() => setToast(null), 8000); // badges : bien visibles (8 s au lieu de 3,5 s)
  };
  const addKm = (d) => {
    kmRef.current += d;
    setKm(kmRef.current);
  };
  // détection pinte gagnée — continue à compter AU-DELÀ de l'objectif
  useEffect(() => {
    const done = warmedUp ? Math.floor(kmRef.current / kp + 1e-9) : 0; // chaque pinte compte après l'échauffement
    if (done > pintsRef.current) {
      pintsRef.current = done;
      setPintsWon(done);
      if (done < goalPintes) { setBravo(true); setRunning(false); }
      // au-delà de l'objectif : toast festif sans interrompre la course
      else if (done > goalPintes) showToast({ emoji: "🍻", nom: T("bonus", { n: done - Math.floor(goalPintes) }), desc: T("bonusDesc", { n: done }) });
    }
  }, [km, goal]);
  // chrono basé sur l'horloge système : même si le navigateur gèle le JS
  // (autre appli, écran veille), le temps reste EXACT au réveil
  const tick = () => {
    if (startTsRef.current === null) return;
    setTime(Math.max(0, Math.floor((Date.now() - startTsRef.current) / 1000)));
  };
  useEffect(() => {
    if (!running) return;
    if (startTsRef.current === null) startTsRef.current = Date.now();
    const iv = setInterval(tick, 1000);
    // au retour de veille/arrière-plan, recalcul immédiat
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [running]);
  useEffect(() => {
    if (!running || mode !== "simu") return;
    const iv = setInterval(() => addKm(10 / 3600), 1000); // simu réaliste 10 km/h (le vrai GPS prime)
    return () => clearInterval(iv);
  }, [running, mode]);
  // NOTIFS AUTO — mercredi & vendredi ~18 h, aucun bouton :
  // permission demandée discrètement au 1er tap (les navigateurs exigent un geste)
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    const ask = () => {
      if (Notification.permission === "default") Notification.requestPermission();
      document.removeEventListener("pointerdown", ask);
    };
    document.addEventListener("pointerdown", ask);
    const iv = setInterval(() => {
      if (Notification.permission !== "granted") return;
      const now = new Date();
      const jour = now.getDay(); // 3 = mercredi, 5 = vendredi
      if ((jour !== 3 && jour !== 5) || now.getHours() !== 18 || now.getMinutes() !== 0) return;
      const cle = "brNotifD" + jour + "-" + now.getDate();
      if (load(cle, false)) return; // anti-doublon : une seule notif par jour cible
      save(cle, true);
      const b = biereDuJour();
      const bieresTxt = T(jour === 3 ? "notifBiereMer" : "notifBiereVen", { n: b.nom });
      try { new Notification("🍺 Beer Runner", { body: T(jour === 3 ? "notifMer" : "notifVen") + "\n" + b.emoji + " " + bieresTxt }); } catch (e) {}
    }, 20000);
    return () => { clearInterval(iv); document.removeEventListener("pointerdown", ask); };
  }, [lang]);
  const stopGps = () => {
    if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  };
  const startGps = () => {
    if (!navigator.geolocation) {
      setGpsMsg(T("gpsNo"));
      setMode("simu"); setRunning(true);
      return;
    }
    // anti-doublon : jamais deux watchers simultanés
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    setGpsMsg(T("gpsSeek"));
    setMode("gps");
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsMsg(T("gpsOk"));
        // ignorer les fixes trop imprécis (Wi-Fi : précision > 25 m)
        if (pos.coords.accuracy && pos.coords.accuracy > 25) return;
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        const ts = pos.timestamp;
        // vitesse instantanée fiable : vitesse native du GPS si dispo
        let vInst = null;
        if (pos.coords.speed != null && pos.coords.speed >= 0) vInst = pos.coords.speed * 3.6;
        let segmentValide = true;
        if (lastPos.current && lastTs.current) {
          const R = 6371;
          const dLat = ((p.lat - lastPos.current.lat) * Math.PI) / 180;
          const dLon = ((p.lon - lastPos.current.lon) * Math.PI) / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos((lastPos.current.lat * Math.PI) / 180) * Math.cos((p.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
          const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const dt = (ts - lastTs.current) / 1000;
          // vitesse implicite du segment : si elle dépasse Bolt, c'est un saut de position, pas un déplacement
          const vSeg = dt > 0.5 ? (d / dt) * 3600 : 0;
          if (vSeg > 44.72) {
            segmentValide = false; // téléportation GPS → on ignore ce fix (ni distance, ni mise à jour du point de référence)
          } else if (d > 0.003 && d < 0.5 && dt > 0.5) {
            addKm(d);
            if (vInst === null) vInst = vSeg;
          }
        }
        if (!segmentValide) return;
        // vitesse sur fenêtre glissante 15 s (comme les vraies apps de course)
        // buffer : {ts, km cumulés} — évite le "yoyo" des mesures instantanées
        winRef.current.push({ ts, km: kmRef.current });
        winRef.current = winRef.current.filter((w) => ts - w.ts <= 15000);
        const win = winRef.current;
        const w0 = win[0], w1 = win[win.length - 1];
        if (win.length >= 2 && w1.ts - w0.ts >= 8000) {
          const dtw = (w1.ts - w0.ts) / 3600; // heures
          const vWin = dtw > 0 ? (w1.km - w0.km) / dtw : 0;
          if (vInst !== null && vInst > 44.72) { vInst = Math.min(vInst, 45); }
          // plafond Bolt + détection véhicule
          if (vWin > 44.72 && !boltShownRef.current) {
            boltShownRef.current = true;
            setGpsMsg(T("boltMsg"));
            setTimeout(() => { stopGps(); setRunning(false); }, 50);
            return;
          }
          // lissage : médiane des dernières vitesses de fenêtre (robuste aux pics)
          const v = Math.max(0, Math.min(44.72, vWin));
          speedsRef.current = [...speedsRef.current, v].slice(-5);
          const sorted = [...speedsRef.current].sort((a, b) => a - b);
          const med = sorted[Math.floor(sorted.length / 2)];
          setVGps(med);
        }
        lastPos.current = p;
        lastTs.current = ts;
      },
      () => { setGpsMsg(T("gpsRefus")); setMode("simu"); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
    setRunning(true);
  };
  const reset = () => {
    stopGps();
    if (kmRef.current >= 0.05 && time >= WARMUP_SEC) addRun(kmRef.current, time);
    else if (kmRef.current >= 0.05) showToast({ emoji: "⏳", nom: T("warmupTitre"), desc: T("warmupDesc") });
    kmRef.current = 0;
    pintsRef.current = 0;
    lastPos.current = null;
    lastTs.current = null;
    speedsRef.current = [];
    winRef.current = [];
    boltShownRef.current = false;
    setVGps(null);
    setKm(0); setTime(0); startTsRef.current = null; setPintsWon(0); setBravo(false);
    setRunning(false); setMode(null); setGpsMsg(null);
    // détection badges après enregistrement — toast du dernier obtenu
    const nb = checkBadges();
    if (nb.length) { const g = nb[nb.length - 1]; showToast({ emoji: g.emoji, nom: bn(g, lang), desc: bd(g, lang) }); }
  };
  // ---------- PAGE ACCUEIL ----------
  if (page === "home") {
    const s = stats();
    const nv = niveauDe(s.totalPintes);
    const days = semaine();
    const weekPintes = days.reduce((t, d) => t + d.pintes, 0);
    const objSemaine = 7; // défi hebdo : 7 pintes
    const m = loadMeta();
    // objectif canonique en pintes (mode km : goal stocke des km)
    const goalPintes = unit === "km" ? goal / kp : goal;
    return (
      <div className={`${theme} min-h-[100dvh] overflow-y-auto bg-gray-950 text-white flex flex-col items-center gap-2.5 px-4 pt-3 pb-3 text-center`}>
        {/* ===== MODALE DE BIENVENUE — version simple ===== */}
        {welcome && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 overflow-y-auto">
            <div className="bg-gray-900 border-2 border-amber-500 rounded-3xl p-6 max-w-sm w-full my-6 text-left space-y-4">
              <h2 className="text-2xl font-black text-amber-400 text-center leading-tight">{T("welcomeTitre")}</h2>
              <p className="text-[14px] leading-snug text-white/85 text-center">{T("welcomeIntro")}</p>
              <ul className="space-y-2.5">
                {["welcomeAccueil", "welcomeRun"].map((k) => (
                  <li key={k} className="text-[13px] leading-snug text-white/75 flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span>{T(k)}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => setWelcome(false)}
                className="w-full py-3 rounded-full bg-amber-500 text-black text-lg font-black active:scale-95 transition">
                {T("welcomeBtn")}
              </button>
            </div>
          </div>
        )}
        <ThemeCss />
        <Toast toast={toast} lang={lang} />
        {/* header compact : titre + série + réglages */}
        <div className="w-full max-w-md flex items-center justify-between">
          <h1 className="text-2xl font-black text-amber-400">🍺 Beer Runner</h1>
          <div className="flex items-center gap-1.5">
            <button onClick={() => { const nl = lang === "fr" ? "en" : "fr"; setLang(nl); save("brLang", nl); }}
              className="px-2 h-8 rounded-full bg-white/10 hover:bg-white/20 text-[13px] font-black text-amber-300">
              {lang === "fr" ? "EN" : "FR"}
            </button>
          </div>
        </div>
        {/* carte profil : avatar + pseudo + poids (recalcul direct) */}
        <div className="w-full max-w-md bg-gradient-to-r from-amber-500/15 to-transparent rounded-2xl py-3 px-3.5 border border-amber-500/30 flex items-center gap-3 text-left">
          {/* avatar : le perso choisi remplace la bière 🍺 — badge 🎭 pour changer */}
          <div className="relative shrink-0">
            <Avatar profile={profile} />
            <button onClick={() => setLogoOpen(!logoOpen)}
              className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-gray-900 border border-amber-500/50 text-[12px] flex items-center justify-center hover:bg-amber-500/30"
              title="Changer de perso">🎭</button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <input value={profile.pseudo} placeholder={T("pseudo")}
                onChange={(e) => { const p = { ...profile, pseudo: e.target.value.slice(0, 15) }; setProfile(p); saveProfile(p); }}
                className="w-40 bg-white/10 rounded-lg px-2.5 py-1.5 text-white text-lg font-black outline-none" />
              <select value={profile.poids}
                onChange={(e) => { const p = { ...profile, poids: Number(e.target.value) }; setProfile(p); saveProfile(p); }}
                className="text-center bg-white/10 rounded-lg px-1.5 py-1.5 text-amber-300 font-black text-lg outline-none">
                {Array.from({ length: 111 }, (_, i) => 40 + i).map((w) => (
                  <option key={w} value={w} className="bg-gray-900 text-white">{w}</option>
                ))}
              </select>
              <span className="text-sm font-bold text-white/60">{T("kg")}</span>
            </div>
          </div>
        </div>
        {/* panneau de choix du perso — 🍺 reste le standard par défaut */}
        {logoOpen && (
          <div className="w-full max-w-md bg-white/5 rounded-2xl p-3 border border-white/10 space-y-2">
            {[
              { titre: "🍺 Bières & verres", debut: 0, fin: 8 },
              { titre: "🥸 Persos rigolos", debut: 8, fin: 24 },
              { titre: "🦉 Bestioles", debut: 24, fin: 40 },
              { titre: "🏃 Course & trail", debut: 40, fin: 48 },
              { titre: "🏆 Gloire", debut: 48, fin: 56 },
            ].map((cat) => (
              <div key={cat.titre}>
                <p className="text-[12px] text-amber-400/70 font-bold mb-1">{cat.titre}</p>
                <div className="grid grid-cols-8 gap-1.5">
                  {LOGOS.slice(cat.debut, cat.fin).map((l) => (
                    <button key={l + cat.debut}
                      onClick={() => { const p = { ...profile, logo: l }; setProfile(p); saveProfile(p); setLogoOpen(false); }}
                      className={`aspect-square rounded-xl text-xl flex items-center justify-center transition
                        ${(profile.logo || "🍺") === l ? "bg-amber-500/40 border border-amber-400 scale-110" : "bg-white/5 border border-white/10 hover:bg-white/15"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => { const p = { ...profile, logo: "🍺" }; setProfile(p); saveProfile(p); setLogoOpen(false); }}
              className="w-full py-2 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold">
              🍺 Revenir à la bière standard
            </button>
          </div>
        )}
        {/* choix de l'objectif course (compact) */}
        <div className="bg-white/5 rounded-2xl p-3 border border-white/10 w-full max-w-md">
          {/* toggle unité */}
          <div className="flex justify-center gap-2 mb-2.5">
            <button onClick={() => { if (unit !== "pintes") { setUnit("pintes"); setGoal(1); } }}
              className={`px-3.5 py-1 rounded-full text-xs font-bold transition ${unit === "pintes" ? "bg-amber-500 text-black" : "bg-white/10 text-white/70"}`}>
              {T("togglePintes")}
            </button>
            <button onClick={() => { if (unit !== "km") { setUnit("km"); setGoal(30); } }}
              className={`px-3.5 py-1 rounded-full text-xs font-bold transition ${unit === "km" ? "bg-amber-500 text-black" : "bg-white/10 text-white/70"}`}>
              {T("toggleKm")}
            </button>
          </div>
          {unit === "pintes" ? (
            <>
              <div className="flex items-center justify-center gap-4">
                <button onClick={() => setGoal(Math.max(1, goal - 1))}
                  className="w-16 h-16 rounded-full bg-amber-500 text-black text-4xl font-black active:scale-90 transition">−</button>
                <div className="text-5xl font-black text-amber-300 w-32">{goal} 🍺</div>
                <button onClick={() => setGoal(Math.min(20, goal + 1))}
                  className="w-16 h-16 rounded-full bg-amber-500 text-black text-4xl font-black active:scale-90 transition">+</button>
              </div>
              {/* presets pintes : km affichés calculés selon le poids saisi ci-dessus */}
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                {[1, 2, 3, 5, 8, 12].map((d) => (
                  <button key={d} onClick={() => setGoal(d)}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-black ${goal === d ? "bg-amber-500 text-black" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                    {d} 🍺 · {(d * kp).toFixed(1)} km
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setGoal(Math.max(1, Math.round((goal - 1) * 10) / 10))}
                  className="w-16 h-16 rounded-full bg-amber-500 text-black text-4xl font-black active:scale-90 transition">−</button>
                <div className="text-5xl font-black text-amber-300 w-36">{goal} km</div>
                <button onClick={() => setGoal(Math.min(200, Math.round((goal + 1) * 10) / 10))}
                  className="w-16 h-16 rounded-full bg-amber-500 text-black text-4xl font-black active:scale-90 transition">+</button>
              </div>
              {/* presets distances */}
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                {[3, 5, 8, 10, 21.1, 42.2, 60, 80, 100].map((d) => (
                  <button key={d} onClick={() => setGoal(d)}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-black ${goal === d ? "bg-amber-500 text-black" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                    {d === 21.1 ? "Semi" : d === 42.2 ? "Marathon" : `${d} km`} · {(d / kp).toFixed(1)} 🍺
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="mt-2 text-white/60 text-[13px]">
            {T("objectif")} <b className="text-amber-300">{(goalPintes * kp).toFixed(1)} km</b> ·{" "}
            <b className="text-amber-300">{Math.round(goalPintes * KCAL_PAR_PINTE)} kcal</b> ·{" "}
            <b className="text-amber-300">{goalPintes.toFixed(1)} 🍺</b>
          </p>
        </div>
        {/* carte objectif : prochain badge uniquement */}
        <div className="w-full max-w-md bg-white/5 rounded-2xl p-3 border border-white/10 space-y-2 text-left">
          {(() => {
            const prochain = BADGES.find((b) => !m.badges.includes(b.id));
            return prochain ? (
              <div className="flex items-center gap-2">
                <span className="text-xl shrink-0">{prochain.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-amber-400/70 font-bold uppercase tracking-wide">{T("prochainBadge")}</div>
                  <div className="text-[13px] font-black text-white/85 truncate">{bn(prochain, lang)}</div>
                  <div className="text-[11px] leading-snug text-white/55">{prochain.desc}</div>
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-amber-300 font-bold">{T("tousBadges")}</div>
            );
          })()}
        </div>
        {/* LE FÛT — crédit de pintes périssable (le bilan détaillé est dans son onglet dédié) */}
        {(() => {
          const futP = futKcal() / KCAL_PAR_PINTE;
          return (
            <div className="w-full max-w-md bg-white/5 rounded-2xl px-3 py-2 border border-white/10 text-left">
              <div className="flex items-center gap-2">
                <span className="text-lg shrink-0">🛢️</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-[11px] text-amber-400/70 font-bold uppercase tracking-wide truncate">{T("futTitre")}</div>
                    <div className="text-sm font-black text-amber-300 shrink-0">{futP.toFixed(1)} 🍺</div>
                  </div>
                  <p className="text-[11px] leading-snug text-white/45">{T("futExpire")}</p>
                </div>
              </div>
            </div>
          );
        })()}
        {/* CTA — remonté pour ne pas clasher avec la barre du smartphone */}
        <div className="w-full max-w-md flex flex-col gap-2 mt-auto pt-1 mb-3">
          <button onClick={() => setPage("run")}
            className="w-full py-3 rounded-full bg-amber-500 text-black text-xl font-black shadow-lg shadow-amber-500/30">
            {T("cta")}
          </button>
          <div className="flex gap-2">
            <button onClick={() => setPage("bilan")}
              className="flex-1 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm font-bold">
              {T("bilanBadges")}
            </button>
            <button onClick={() => setPage("brasseries")}
              className="flex-1 py-2 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-bold">
              {T("brasseriesBtn")}
            </button>
            <button onClick={() => setPage("defis")}
              className="flex-1 py-2 rounded-full bg-green-500/20 border border-green-500/40 text-green-300 text-sm font-bold">
              {T("defisBtn")}
            </button>
          </div>
        </div>
        {/* PWA : installer l'app — remonté au-dessus de la zone de gestes */}
        <div className="w-full max-w-md bg-white/5 rounded-2xl p-3 border border-white/10 space-y-2 text-left mb-6" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="text-[12px] text-amber-400/70 font-bold uppercase tracking-wide">{T("pwaTitre")}</div>
          {installEvt ? (
            <button onClick={async () => { installEvt.prompt(); const c = await installEvt.userChoice; if (c?.outcome === "accepted") showToast({ emoji: "📲", nom: T("pwaInstalle"), desc: "" }); setInstallEvt(null); }}
              className="w-full py-2 rounded-full bg-amber-500 text-black text-xs font-black">{T("pwaBtn")}</button>
          ) : (
            <p className="text-[11px] leading-snug text-white/50">{T("pwaInfo")}</p>
          )}
        </div>
        <p className="text-[10px] text-white/30">© 2026 Beer Runner™ · ColibriAI</p>
      </div>
    );
  }
  // ---------- PAGE BILAN ----------
  if (page === "bilan") {
    return <Bilan onHome={() => setPage("home")} onToast={showToast} lang={lang} theme={theme} />;
  }
  // ---------- PAGE BRASSERIES ----------
  if (page === "brasseries") {
    return <Brasseries onHome={() => setPage("home")} onToast={showToast} lang={lang} theme={theme} />;
  }
  // ---------- PAGE DEFIS ----------
  if (page === "defis") {
    return <Defis onHome={() => setPage("home")} onToast={showToast} lang={lang} theme={theme} />;
  }
  // ---------- PAGE COURSE (compact, tient sur un écran smartphone) ----------
  return (
    <div className={`${theme} h-[100dvh] overflow-hidden bg-gray-950 text-white flex flex-col items-center gap-2.5 pt-3 pb-4 px-4`}>
      <ThemeCss />
      <Toast toast={toast} lang={lang} />
      <div className="flex items-center gap-3 self-start w-full max-w-md">
        <button onClick={() => { reset(); setPage("home"); }}
          className="px-5 py-2.5 rounded-full bg-amber-500/25 border border-amber-500/50 text-amber-200 text-sm font-black active:scale-95 transition">{T("home")}</button>
        {gpsMsg && (
          <span className="text-[13px] px-3 py-1 rounded-full bg-white/10 text-white/70 flex-1 text-center truncate">{gpsMsg}</span>
        )}
      </div>
      <Pinte fill={kcalEff} goal={goalPintes} light={theme === "light"} lang={lang} />
      {/* bandeau échauffement : règle des 30 min */}
      {!warmedUp && (
        <div className="w-full max-w-md -mt-1 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[12px] text-white/70 text-center">
          {T("warmupInfo", { m: Math.ceil((WARMUP_SEC - time) / 60) })}
        </div>
      )}
      {/* condition du coureur : gueule de bois (−12%) ou streak sobriété (+10% max) */}
      {warmedUp && (gueuleBois || sobriete > 0.001) && (
        <div className={`w-full max-w-md -mt-1 px-3 py-1.5 rounded-full border text-[12px] text-center ${gueuleBois ? "bg-red-500/15 border-red-400/30 text-red-200" : "bg-green-500/15 border-green-400/30 text-green-200"}`}>
          {gueuleBois ? T("gueuleBadge") : T("soberBadge", { d: Math.min(streakSobriete(), 5), p: Math.round(sobriete * 100) })}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 w-full max-w-md">
        {[
          { v: km.toFixed(2), l: "KM" },
          { v: Math.round(kcal), l: "KCAL" },
          { v: fmtTime(time), l: T("temps") },
        ].map((st) => (
          <div key={st.l} className="bg-white/5 rounded-xl p-2.5 text-center border border-white/10">
            <div className="text-xl font-black text-amber-300 leading-tight">{st.v}</div>
            <div className="text-[12px] text-white/60">{st.l}</div>
          </div>
        ))}
      </div>
      <div className="w-full max-w-md bg-white/5 rounded-xl p-2.5 border border-white/10 text-xs space-y-0.5">
        <div>{T("pintePourToi", { k: kp.toFixed(1) })} · {T("distanceTxt")} <b className="text-amber-300">{km.toFixed(2)} km</b></div>
      </div>
      {!finished && !bravo && (
        <div className="flex gap-3">
          {running ? (
            <button onClick={() => { setRunning(false); stopGps(); }}
              className="px-8 py-3 rounded-full bg-red-400 text-black font-black">{T("pause")}</button>
          ) : (
            <button onClick={() => { if (mode === "gps") setRunning(true); else startGps(); }}
              className="px-8 py-3 rounded-full bg-amber-500 text-black font-black shadow-lg shadow-amber-500/30">
              ▶ {km > 0 ? T("reprendre") : T("courir")} (GPS)
            </button>
          )}
          <button onClick={reset}
            className="px-6 py-3 rounded-full bg-white/10 text-white/70 font-bold">{T("terminerBtn")}</button>
        </div>
      )}
      {bravo && !finished && (
        <Bravo pintsWon={pintsWon} final={false} lang={lang} light={theme === "light"}
          onContinue={() => { setBravo(false); setRunning(true); }}
          onHome={() => { reset(); setPage("home"); }} />
      )}
      {finished && (
        <Bravo pintsWon={pintsWon} final goal={goalPintes} time={time} lang={lang} light={theme === "light"}
          goalText={unit === "km" ? `${goal} km` : `${goal} ${T(goal > 1 ? "pintes" : "pinte")}`}
          onContinue={() => {}}
          onHome={() => { reset(); setPage("home"); }} />
      )}
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);