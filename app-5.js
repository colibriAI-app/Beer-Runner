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
  // modale de bienvenue : fermée uniquement à la main (bouton),
  // ROUVRE À CHAQUE lancement de l'app (sessionStorage : vide à chaque
  // nouvelle session, donc la modale revient, mais pas sur un simple refresh)
  const [welcome, setWelcome] = useState(() => {
    try { return !sessionStorage.getItem("brWelcomeVu"); } catch (e) { return true; }
  });
  const [profile, setProfile] = useState(loadProfile());
  const [logoOpen, setLogoOpen] = useState(false);
  // PWA : événement d'installation natif (Android/Chrome) + rappel jeudi
  const [installEvt, setInstallEvt] = useState(null);
  // déjà installée ? (mode standalone = app lancée depuis l'écran d'accueil)
  const [standalone] = useState(() => {
    try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; }
  });
  // iOS ? (Safari n'a pas beforeinstallprompt → panneau d'instructions dédié)
  const [isIOS] = useState(() => {
    try {
      return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    } catch (e) { return false; }
  });
  const [installHelp, setInstallHelp] = useState(false);
  const [lang, setLang] = useState(L());
  const [theme, setTheme] = useState("dark");
  const T = (k, p) => t(k, p, lang);
  const watchRef = useRef(null);
  // ---------- WAKE LOCK : garder l'écran allumé pendant la course ----------
  // iOS Safari (16.4+) & Chrome Android suspendent le JS/GPS écran éteint →
  // on demande à garder l'écran actif tant que la course tourne.
  // Repli silencieux : si l'API manque, la course continue normalement.
  const wakeRef = useRef(null);
  const acquireWakeLock = async () => {
    try {
      if (!("wakeLock" in navigator)) return;
      wakeRef.current = await navigator.wakeLock.request("screen");
      wakeRef.current.addEventListener("release", () => { wakeRef.current = null; });
    } catch (e) { /* refusé (batterie faible, arrière-plan) : on ignore */ }
  };
  const releaseWakeLock = () => { try { wakeRef.current && wakeRef.current.release(); } catch (e) {} wakeRef.current = null; };
  // PWA : le navigateur propose l'installation → on capte l'événement pour notre bouton.
  // NB : index.html capte déjà l'événement AVANT Babel (window.__installEvt) —
  // Chrome peut l'émettre avant que React soit monté. On récupère donc la réserve.
  useEffect(() => {
    if (window.__installEvt) setInstallEvt(window.__installEvt);
    const h = (e) => { e.preventDefault(); window.__installEvt = e; setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const lastPos = useRef(null);
  const lastTs = useRef(null);
  const speedsRef = useRef([]);
  const winRef = useRef([]);          // fenêtre glissante {ts, km} pour la vitesse
  const boltShownRef = useRef(false);
  const gpsLowRetry = useRef(false); // 1 relance basse précision si timeout GPS
  const [vGps, setVGps] = useState(null);
  const pintsRef = useRef(0);
  const kmRef = useRef(0);
  // poids réactif : lu depuis l'état React (menu déroulant), PAS le localStorage
  // (dans l'aperçu canvas, localStorage peut être bloqué → valeur figée à 70)
  // kcal NETTES (modèle réaliste) × facteur de gain (gueule de bois / sobriété)
  const kcalKmNow = Number(profile.poids) || 70;
  const kcal = kcalNettes(km, time, kcalKmNow);
  // facteur de gain : gueule de bois (−12 %) ou sobriété (+10 % max)
  const gueuleBois = consoRecente();
  const sobriete = bonusSobriete();
  const kcalEff = kcal * gainFactorNow();
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
    const done = Math.floor(kmRef.current / kp + 1e-9);
    if (done > pintsRef.current) {
      pintsRef.current = done;
      setPintsWon(done);
      // chaque pinte gagnée : toast festif sans interrompre — le grand Bravo uniquement à l'objectif (finished)
      showToast({ emoji: "🍻", nom: T("bonus", { n: done }), desc: T("bonusDesc", { n: done }) });
    }
  }, [km, goal]);
  // chrono basé sur l'horloge système : même si le navigateur gèle le JS
  // (autre appli, écran veille), le temps reste EXACT au réveil
  const tick = () => {
    if (startTsRef.current === null) return;
    setTime(Math.max(0, Math.floor((Date.now() - startTsRef.current) / 1000)));
  };
  useEffect(() => {
    if (!running) { releaseWakeLock(); return; }
    if (startTsRef.current === null) startTsRef.current = Date.now();
    acquireWakeLock(); // écran allumé → GPS actif pendant toute la course
    const iv = setInterval(tick, 1000);
    // au retour de veille/arrière-plan : recalcul immédiat + le Wake Lock est
    // automatiquement libéré quand l'écran s'éteint → on le re-demande pour
    // que l'écran reste allumé jusqu'à la fin de la course
    const onVis = () => { if (document.visibilityState === "visible") { tick(); acquireWakeLock(); } };
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
    const onFix = (pos) => {
        setGpsMsg(T("gpsOk"));
        // ignorer les fixes trop imprécis (Wi-Fi : précision > 25 m)
        if (pos.coords.accuracy && pos.coords.accuracy > 50) return;
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
          } else if (d > 0.0005 && d < 0.5 && dt > 0.5) {
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
      };
    const onErr = (err) => {
      // code 1 = PERMISSION_DENIED : Android ne redemande jamais → consigne claire
      if (err && err.code === 1) { setGpsMsg(T("gpsDenied")); setMode("simu"); setRunning(true); return; }
      // code 3 = TIMEOUT : une seule relance sans haute précision (fix plus rapide en intérieur)
      if (err && err.code === 3 && !gpsLowRetry.current) {
        gpsLowRetry.current = true;
        if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: false, maximumAge: 5000, timeout: 20000 });
        setGpsMsg(T("gpsSeek"));
        return;
      }
      setGpsMsg(T("gpsRefus")); setMode("simu");
    };
    watchRef.current = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
    setRunning(true);
  };
  const reset = () => {
    stopGps();
    if (kmRef.current >= 0.05) addRun(kmRef.current, time);
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
              {/* sélecteur de langue FR / EN */}
              <div className="flex justify-center gap-2">
                {[["fr", "🇫🇷 FR"], ["en", "🇬🇧 EN"]].map(([code, lbl]) => (
                  <button key={code} onClick={() => { setLang(code); save("brLang", code); }}
                    className={`px-4 py-1.5 rounded-full text-sm font-black transition active:scale-95 ${lang === code ? "bg-amber-500 text-black" : "bg-white/10 text-white/60 hover:bg-white/20"}`}>
                    {lbl}
                  </button>
                ))}
              </div>
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
              {/* --- bien configurer l'app --- */}
              <div className="border-t border-amber-500/30 pt-3 space-y-2">
                <p className="text-[12px] font-black text-amber-400 text-center">{T("welcomeSetupTitre")}</p>
                <ul className="space-y-2">
                  {["welcomeSetup1", "welcomeSetup2", "welcomeSetup3"].map((k) => (
                    <li key={k} className="text-[12px] leading-snug text-white/65 flex items-start gap-2">
                      <span className="text-amber-400/70 mt-0.5">▸</span>
                      <span>{T(k)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={() => { try { sessionStorage.setItem("brWelcomeVu", "1"); } catch (e) {} setWelcome(false); }}
                className="w-full py-3 rounded-full bg-amber-500 text-black text-lg font-black active:scale-95 transition">
                {T("welcomeBtn")}
              </button>
            </div>
          </div>
        )}
        {/* ===== PANNEAU INSTALLATION (Chrome natif ou instructions iOS/Android) ===== */}
        {installHelp && (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 overflow-y-auto">
            <div className="bg-gray-900 border-2 border-amber-500 rounded-3xl p-6 max-w-sm w-full my-6 text-left space-y-4">
              <h2 className="text-xl font-black text-amber-400 text-center">📲 {T("pwaAideTitre")}</h2>
              {isIOS ? (
                <div className="space-y-2">
                  <p className="text-[13px] font-black text-white/85">{T("pwaIosTitre")}</p>
                  {["pwaIos1", "pwaIos2", "pwaIos3"].map((k) => (
                    <p key={k} className="text-[13px] leading-snug text-white/75">{T(k)}</p>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] font-black text-white/85">{T("pwaChromeTitre")}</p>
                  {["pwaChrome1", "pwaChrome2"].map((k) => (
                    <p key={k} className="text-[13px] leading-snug text-white/75">{T(k)}</p>
                  ))}
                </div>
              )}
              {!isIOS && <p className="text-[11px] leading-snug text-white/50 text-center">{T("pwaInfo")}</p>}
              <button onClick={() => setInstallHelp(false)}
                className="w-full py-3 rounded-full bg-amber-500 text-black text-lg font-black active:scale-95 transition">
                {T("pwaFermer")}
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
            <button onClick={() => { if (unit !== "km") { setUnit("km"); setGoal(5); } }}
              className={`px-3.5 py-1 rounded-full text-xs font-bold transition ${unit === "km" ? "bg-amber-500 text-black" : "bg-white/10 text-white/70"}`}>
              {T("toggleKm")}
            </button>
          </div>
          {unit === "pintes" ? (
            <div className="flex items-center justify-center gap-4">
              <button onClick={() => setGoal(Math.max(1, goal - 1))}
                className="w-14 h-14 rounded-full bg-amber-500 text-black text-3xl font-black active:scale-90 transition">−</button>
              <div className="text-4xl font-black text-amber-300 w-28 text-center">{goal} 🍺</div>
              <button onClick={() => setGoal(Math.min(20, goal + 1))}
                className="w-14 h-14 rounded-full bg-amber-500 text-black text-3xl font-black active:scale-90 transition">+</button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4">
              <button onClick={() => setGoal(Math.max(1, Math.round((goal - 1) * 10) / 10))}
                className="w-14 h-14 rounded-full bg-amber-500 text-black text-3xl font-black active:scale-90 transition">−</button>
              <div className="text-4xl font-black text-amber-300 w-32 text-center">{goal} km</div>
              <button onClick={() => setGoal(Math.min(200, Math.round((goal + 1) * 10) / 10))}
                className="w-14 h-14 rounded-full bg-amber-500 text-black text-3xl font-black active:scale-90 transition">+</button>
            </div>
          )}
          <p className="mt-2 text-center text-base font-bold text-white/70">
            {T("objectif")} <b className="text-amber-300 text-xl">{(goalPintes * kp).toFixed(1)} km</b> · <b className="text-amber-300 text-xl">{goalPintes.toFixed(1)} 🍺</b>
          </p>
          <p className="mt-1 text-center text-[11px] text-white/45">{T("equivNote", { p: profile.poids })}</p>
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
          ) : standalone ? (
            <p className="text-[11px] leading-snug text-green-400/80 font-bold text-center">{T("pwaDeja")}</p>
          ) : (
            <button onClick={() => setInstallHelp(true)}
              className="w-full py-2 rounded-full bg-amber-500 text-black text-xs font-black active:scale-95 transition">{T("pwaBtn")}</button>
          )}
        </div>
        <p className="text-[10px] text-white/30">© 2026 Beer Runner™ · ColibriAI</p>
      </div>
    );
  }
  // ---------- PAGE BILAN ----------
  if (page === "bilan") {
    const mBilan = loadMeta(); // ⚠️ ne pas dépendre du bloc "home" ci-dessus (bug de portée corrigé)
    return <Bilan onHome={() => setPage("home")} onToast={showToast} lang={lang} theme={theme} badges={mBilan.badges} />;
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
      {/* condition du coureur : gueule de bois (−12%) ou streak sobriété (+10% max) */}
      {(gueuleBois || sobriete > 0.001) && (
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

