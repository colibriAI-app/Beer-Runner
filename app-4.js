function Bilan({ onHome, onToast, lang, theme, badges }) {
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
  // format lisible des barres 12 semaines selon la vue (pintes/km : 1 décimale · kcal : compact)
  const fmtSem = (v, val) => v === "kcal"
    ? (val >= 1000 ? (Math.round(val / 100) / 10).toString().replace(".", ",") + "k" : String(Math.round(val)))
    : (Math.round(val * 10) / 10).toString().replace(".", ",");
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
      {/* RÉSUMÉ de la semaine : hausse/baisse vs semaine précédente — remonté juste sous les compteurs */}
      <div className="w-full max-w-md bg-gradient-to-r from-amber-500/15 to-transparent rounded-2xl p-3 border border-amber-500/30 text-center text-sm">
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
      {/* tendance 12 semaines type Garmin — cliquable : 🍺 / kcal / km */}
      <div className="w-full max-w-md bg-white/5 rounded-2xl p-4 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-amber-300 text-sm">{T("trendTitre")}</h2>
          <div className="flex gap-1">
            {[["pintes", "🍺"], ["kcal", "🔥"], ["km", "🏃"]].map(([v, e]) => (
              <button key={v} onClick={() => setVue(v)}
                className={`px-3 py-1.5 rounded-full text-base leading-none ${vue === v ? "bg-amber-500 text-black ring-2 ring-amber-300" : "bg-white/10 text-white/60 hover:bg-white/20"}`}>{e}</button>
            ))}
          </div>
        </div>
        <div className="text-center text-[11px] font-bold text-amber-300/90">
          {vue === "pintes" ? T("eliminees") : vue === "kcal" ? T("kcalElim") : "KM"} · max {fmtSem(vue, maxSem)}
        </div>
        <div className="flex items-end justify-between gap-1 h-36">
          {semaines12.map((w, i) => {
            const val = valDe(w);
            const der = i === semaines12.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end"
                title={`${fmtSem(vue, val)} ${vue === "kcal" ? "kcal" : vue === "km" ? "km" : "🍺"}`}>
                <div className={`text-[8px] font-bold leading-none ${der ? "text-amber-300" : "text-white/55"}`}>
                  {val > 0 ? fmtSem(vue, val) : ""}
                </div>
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
      {/* galerie de TOUS les badges possibles — obtenus en doré, à débloquer en grisé */}
      <div className="w-full max-w-md bg-white/5 rounded-2xl p-3 border border-white/10 space-y-2 text-left">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-amber-400/70 font-bold uppercase tracking-wide">{T("badgesTitre")}</div>
          <div className="text-[11px] text-white/50">{(badges || []).length}/{BADGES.length} {T("badgesObtenus")}</div>
        </div>
        {/* badges triés du plus facile au plus difficile : progression claire */}
        <div className="grid grid-cols-2 gap-2">
          {BADGES.slice().sort((a, b) => ORDRE_DIFF[a.id] - ORDRE_DIFF[b.id]).map((b) => {
            const got = (badges || []).includes(b.id);
            return (
              <div key={b.id} className={`rounded-xl p-2 border ${got ? "bg-amber-500/10 border-amber-500/40" : "bg-white/5 border-white/10 opacity-55"}`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base shrink-0">{got ? b.emoji : "🔒"}</span>
                  <span className="text-[11px] font-black text-white/85 truncate">{bn(b, lang)}</span>
                </div>
                <div className="text-[10px] leading-snug text-white/50">{bd(b, lang)}</div>
              </div>
            );
          })}
        </div>
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
      {/* trophées supprimé : doublon de la galerie « Tous les badges » plus haut */}
    </div>
  );
}
// ---------- Page Brasseries locales (géolocalisée, sans API) ----------
function Brasseries({ onHome, onToast, lang, theme }) {
  const T = (k, p) => t(k, p, lang);
  const [pos, setPos] = useState(null);       // {lat, lon} — GPS uniquement, sans bouton
  const [statut, setStatut] = useState("idle"); // idle | cherche | err
  // géolocalisation silencieuse dès l'ouverture de la page — GPS uniquement
  const localiser = () => {
    setStatut("cherche");
    if (!navigator.geolocation) { setStatut("err"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lon: p.coords.longitude }); setStatut("ok"); },
      (err) => setStatut(err && err.code === 1 ? "denied" : "err"), // code 1 = refus Android
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  useEffect(() => { localiser(); }, []);
  // lien Google Maps : UNIQUEMENT le terme de recherche + position GPS (jamais de nom de ville)
  const q = (terme, p) => {
    const pp = p || pos;
    if (pp) return `https://www.google.com/maps/search/${encodeURIComponent(terme)}/@${pp.lat},${pp.lon},13z`;
    return null; // pas de GPS → pas de faux résultat avec ville
  };
  // ouverture : le GPS identifie le lieu AVANT d'ouvrir Maps — jamais de fallback ville
  const ouvrirMaps = (terme) => {
    const go = (p) => {
      const url = q(terme, p);
      const w = window.open(url, "_blank", "noopener");
      if (!w) { try { window.location.href = url; } catch (e) {} }
    };
    if (pos) return go(pos);
    setStatut("cherche");
    if (!navigator.geolocation) { setStatut("err"); onToast && onToast({ emoji: "📍", txt: T("posErr") }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const pp = { lat: p.coords.latitude, lon: p.coords.longitude }; setPos(pp); setStatut("ok"); go(pp); },
      (err) => { setStatut(err && err.code === 1 ? "denied" : "err"); onToast && onToast({ emoji: "📍", txt: T(err && err.code === 1 ? "posDenied" : "posErr") }); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  const CATEGORIES = [
    { emoji: "🏭", nom: "Micro-brasseries", nomEn: "Microbreweries", terme: "micro brasserie", termeEn: "microbrewery" },
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
      {/* statut GPS discret */}
      <div className="w-full max-w-md">
        {statut === "cherche" && <p className="text-xs text-white/50 text-center">📍 {T("locating")}</p>}
        {statut === "err" && <p className="text-xs text-amber-400/80 text-center">{T("posErr")}</p>}
        {statut === "denied" && (
          <div className="text-center">
            <p className="text-xs text-amber-400 font-bold">{T("posDenied")}</p>
            <button onClick={localiser} className="mt-2 px-4 py-1.5 rounded-full bg-amber-500/25 border border-amber-500/50 text-amber-200 text-xs font-black active:scale-95 transition">�DDD4 {T("maPos")}</button>
          </div>
        )}
      </div>
      {/* LA BIÈRE DU JOUR — remontée juste sous le titre, façon Jivay */}
      {(() => {
        const b = biereDuJour();
        const en = L() === "en";
        const fa = en && BIERES_CULTES_EN[b.nom] ? BIERES_CULTES_EN[b.nom] : b.fa;
        const typeTxt = en ? tradEn(b.type) : b.type;
        const origTxt = en ? tradEn(b.origine) : b.origine;
        return (
          <div className="w-full max-w-md bg-white/5 rounded-2xl px-3 py-2 border border-white/10 text-left">
            <div className="flex items-center gap-2">
              <span className="text-lg shrink-0">{b.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[11px] text-amber-400/70 font-bold uppercase tracking-wide truncate">{T("biereJour")} <span className="text-amber-300 font-black normal-case">{b.nom}</span></div>
                  <div className="text-sm font-black text-amber-300 shrink-0">{b.force}</div>
                </div>
                <div className="text-[12px] leading-snug text-white/60">{typeTxt} · {origTxt}</div>
              </div>
            </div>
            <p className="text-[12px] leading-snug text-white/65 mt-1">{fa}</p>
          </div>
        );
      })()}
      {/* catégories de recherche — GPS uniquement, sans nom de ville */}
      <div className="w-full max-w-md space-y-3">
        {CATEGORIES.map((c) => (
          <button key={L() === "en" ? c.nomEn : c.nom} onClick={() => ouvrirMaps(L() === "en" ? c.termeEn : c.terme)}
            className="w-full bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/40 rounded-2xl p-4 text-center transition group active:scale-95">
            <div className="text-3xl mb-1 group-hover:scale-110 transition">{c.emoji}</div>
            <div className="text-sm font-bold text-white/90">{L() === "en" ? c.nomEn : c.nom}</div>
            <div className="text-[12px] text-amber-400/70 mt-1">{T("ouvrirMaps")}</div>
          </button>
        ))}
      </div>
      <button onClick={() => {
          // mailto fiable en PWA installée : window.open, repli location.href
          const url = `mailto:ColibriAI.app@gmail.com?subject=${encodeURIComponent("Beer Runner — Brasserie partenaire")}&body=${encodeURIComponent("Bonjour,\n\nJe suis une brasserie et je souhaite devenir le fût officiel de Beer Runner.\n\n")}`;
          const w = window.open(url, "_blank");
          if (!w) { try { window.location.href = url; } catch (e) {} }
        }}
        className="px-3.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-200 text-[12px] font-black active:scale-95 transition">
        {T("brasseriesContact")}
      </button>
      {/* bouton global retiré — 2 boutons max */}
      <p className="text-[12px] text-white/40 text-center max-w-md">
        {T("astuce")}
      </p>
    </div>
  );
}
// ================= APP =================
