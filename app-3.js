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
