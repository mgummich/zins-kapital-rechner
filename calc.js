// Reine Rechen-Engine. Kein DOM, kein Intl. Prozentwerte als Dezimal.

export function berechneVorab(config) {
  const gebäudeanteil = 1 - config.grundstücksanteil;
  const kaufnebenkosten =
    config.kaufpreis * (config.grEStSatz + config.notarSatz + config.maklerSatz);
  const anschaffungskosten = config.kaufpreis + kaufnebenkosten;
  const afaBasis = anschaffungskosten * gebäudeanteil;
  return { gebäudeanteil, kaufnebenkosten, anschaffungskosten, afaBasis };
}

// Degressive AfA: Wechsel zu linear, sobald linear (Restbuchwert / Restnutzungsdauer)
// den degressiven Betrag übersteigt. ponytail: Restnutzungsdauer pauschal 33 Jahre
// (Neubau-Näherung); exakte gesetzliche ND je Objekt weicht ab — Näherung genügt
// für den Steuer-Timing-Vergleich, der das Ziel des Rechners ist.
const DEGRESSIV_ND = 33;

export function berechneAfa(config, afaBasis, jahre) {
  const afaJahr = [];
  const afaKumuliert = [];
  let kumuliert = 0;

  if (config.afaMethode === 'degressiv') {
    let restbuchwert = afaBasis;
    for (let t = 1; t <= jahre; t++) {
      const degr = config.afaSatz * restbuchwert;
      const restjahre = Math.max(1, DEGRESSIV_ND - (t - 1));
      const lin = restbuchwert / restjahre;
      let afa = Math.max(degr, lin);
      afa = Math.min(afa, restbuchwert); // nie mehr als Restbuchwert
      restbuchwert -= afa;
      kumuliert += afa;
      afaJahr.push(afa);
      afaKumuliert.push(kumuliert);
    }
  } else {
    const afa = afaBasis * config.afaSatz; // linear konstant
    for (let t = 1; t <= jahre; t++) {
      const betrag = Math.min(afa, Math.max(0, afaBasis - kumuliert));
      kumuliert += betrag;
      afaJahr.push(betrag);
      afaKumuliert.push(kumuliert);
    }
  }
  return { afaJahr, afaKumuliert };
}

export function berechneDarlehen(finanzierung, anschaffungskosten, jahre) {
  const darlehen = Math.max(0, anschaffungskosten - finanzierung.eigenkapital);
  const zins = [];
  const tilgung = [];
  const restschuld = [];

  // Annuität aus Anfangsdarlehen; beim Anschluss einmal neu annuisiert (verhindert neg. Amortisation).
  let monatsrate = (darlehen * (finanzierung.sollzins + finanzierung.anfTilgung)) / 12;
  let rest = darlehen;

  for (let t = 1; t <= jahre; t++) {
    const aktuellerZins = t <= finanzierung.zinsbindung ? finanzierung.sollzins : finanzierung.anschlusszins;
    if (t === finanzierung.zinsbindung + 1) {
      monatsrate = (rest * (finanzierung.anschlusszins + finanzierung.anfTilgung)) / 12; // Re-Annuisierung
    }
    let zinsJahr = 0;
    let tilgungJahr = 0;
    for (let m = 0; m < 12 && rest > 0; m++) {
      const zinsMonat = rest * (aktuellerZins / 12);
      let tilgungMonat = monatsrate - zinsMonat;
      if (tilgungMonat > rest) tilgungMonat = rest; // letzte Rate
      rest -= tilgungMonat;
      zinsJahr += zinsMonat;
      tilgungJahr += tilgungMonat;
    }
    if (finanzierung.sondertilgung > 0 && rest > 0) {
      const sonder = Math.min(finanzierung.sondertilgung, rest);
      rest -= sonder;
      tilgungJahr += sonder;
    }
    zins.push(zinsJahr);
    tilgung.push(tilgungJahr);
    restschuld.push(rest);
  }
  return { zins, tilgung, restschuld };
}

export function berechneSzenario(config, finanzierung) {
  const { anschaffungskosten, afaBasis } = berechneVorab(config);
  const { afaJahr } = berechneAfa(config, afaBasis, config.jahre);
  const darlehen = berechneDarlehen(finanzierung, anschaffungskosten, config.jahre);
  const stEff = config.grenzsteuersatz * (config.soliKirche ? 1.055 : 1);

  const freiesKapitalStart = Math.max(0, config.verfügbaresKapital - finanzierung.eigenkapital);
  let portfolioVor = freiesKapitalStart;

  const zeilen = [];
  for (let t = 1; t <= config.jahre; t++) {
    const kaltmieteJahr = config.kaltmieteMonat * 12 * Math.pow(1 + config.mietsteigerung, t - 1);
    const mietNetto = kaltmieteJahr * (1 - config.leerstand);
    const steigerung = Math.pow(1 + config.kostensteigerung, t - 1);
    const bewirtschaftungAbzieh = (config.verwaltung + config.instandhaltung) * steigerung; // Werbungskosten
    const ruecklage = (config.ruecklageZufuehrung || 0) * steigerung; // nur Cashflow, nicht absetzbar
    const finKostenAbzieh = t === 1 ? (finanzierung.finanzierungskosten || 0) : 0; // Disagio etc. Jahr 1
    const zins = darlehen.zins[t - 1];
    const tilgung = darlehen.tilgung[t - 1];
    const afa = afaJahr[t - 1];

    const werbungskosten = zins + afa + bewirtschaftungAbzieh + finKostenAbzieh;
    const steuerErgebnis = mietNetto - werbungskosten;
    const steuerEffekt = -steuerErgebnis * stEff; // Verlust → positiv (Erstattung)

    const kapitaldienst = zins + tilgung;
    const liquiKosten = bewirtschaftungAbzieh + ruecklage + finKostenAbzieh;
    const cashflowVorSteuer = mietNetto - liquiKosten - kapitaldienst;
    const cashflowNachSteuer = cashflowVorSteuer + steuerEffekt;

    const restschuld = darlehen.restschuld[t - 1];
    const immobilienwert = config.kaufpreis * Math.pow(1 + config.wertsteigerung, t);
    const immobilienEK = immobilienwert - restschuld;

    // positives Portfolio wächst mit altRendite; Unterdeckung mit teurerem Sollzins
    const satz = portfolioVor >= 0 ? config.altRendite : config.sollzinsUnterdeckung;
    const portfolio = portfolioVor * (1 + satz) + cashflowNachSteuer;
    portfolioVor = portfolio;
    const gesamtvermögen = immobilienEK + portfolio;

    zeilen.push({
      jahr: t, mietNetto, bewirtschaftungAbzieh, ruecklage, zins, tilgung, afa,
      steuerErgebnis, steuerEffekt, cashflowVorSteuer, cashflowNachSteuer,
      restschuld, immobilienwert, immobilienEK, portfolio, gesamtvermögen,
    });
  }
  return zeilen;
}

export function irr(zahlungen) {
  const npv = (rate) => zahlungen.reduce((s, z, i) => s + z / Math.pow(1 + rate, i), 0);
  let lo = -0.9999, hi = 1.0;
  if (npv(lo) * npv(hi) > 0) return NaN; // kein Vorzeichenwechsel → keine reelle Lösung im Bereich
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 1e-6) return mid;
    if (npv(lo) * v < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function berechneKennzahlen(reihe, config, finanzierung) {
  const N = config.jahre;
  const cashflowM1 = reihe[0].cashflowNachSteuer / 12;
  const beIdx = reihe.findIndex((z) => z.cashflowNachSteuer >= 0);
  const breakEvenJahr = beIdx === -1 ? null : beIdx + 1;
  const restschuldN = reihe[N - 1].restschuld;
  const immobilienEK_N = reihe[N - 1].immobilienEK;

  // Amortisation: erstes Jahr mit kumuliertem Cashflow ≥ 0 (§3.8)
  let kum = 0;
  let amortisationJahr = null;
  for (let t = 0; t < N; t++) {
    kum += reihe[t].cashflowNachSteuer;
    if (kum >= 0) { amortisationJahr = t + 1; break; }
  }

  // Netto-Liquidationswert: gemeinsam für Verkauf UND IRR-Fallback (Vergleichbarkeit, F3)
  const { anschaffungskosten, afaBasis } = berechneVorab(config);
  const { afaKumuliert } = berechneAfa(config, afaBasis, N);
  const stEff = config.grenzsteuersatz * (config.soliKirche ? 1.055 : 1);
  const vk = config.veräußerungskosten || 0; // Makler, Vorfälligkeitsentschädigung
  const verkaufspreis = reihe[N - 1].immobilienwert;
  let latenteSpekusteuer = 0;
  if (N < 10) {
    const gewinn = verkaufspreis - (anschaffungskosten - afaKumuliert[N - 1]) - vk;
    latenteSpekusteuer = Math.max(gewinn, 0) * stEff;
  }
  const terminalNetto = immobilienEK_N - vk - latenteSpekusteuer; // = verkaufspreis − restschuld − vk − steuer

  // Endvermögen: bei Verkauf realisiert (Netto-Liquidationswert + Portfolio),
  // sonst Gesamtvermögen (unrealisiert mit Immobilie und Portfolio)
  const endvermögen = config.verkaufAktiv
    ? reihe[N - 1].portfolio + terminalNetto
    : reihe[N - 1].gesamtvermögen;

  // IRR immer mit NETTO-Terminal → mit/ohne Verkauf vergleichbar (F3)
  const zahlungen = [-finanzierung.eigenkapital];
  for (let t = 1; t <= N; t++) {
    let z = reihe[t - 1].cashflowNachSteuer;
    if (t === N) z += terminalNetto;
    zahlungen.push(z);
  }

  return { cashflowM1, breakEvenJahr, amortisationJahr, restschuldN, immobilienEK_N, endvermögen, terminalNetto, irr: irr(zahlungen) };
}

// Kritische Alternativrendite: altRendite, bei der Endvermögen A == B (F2). null = kein Umschlag in [0,20%].
export function kritischeAltRendite(config, finA, finB) {
  const diff = (alt) => {
    const c = { ...config, altRendite: alt };
    const eA = berechneKennzahlen(berechneSzenario(c, finA), c, finA).endvermögen;
    const eB = berechneKennzahlen(berechneSzenario(c, finB), c, finB).endvermögen;
    return eA - eB;
  };
  let lo = 0, hi = 0.20;
  const dLo = diff(lo);
  if (dLo === 0) return lo;
  if (dLo * diff(hi) > 0) return null; // kein Vorzeichenwechsel → ein Szenario dominiert durchgängig
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const d = diff(mid);
    if (Math.abs(d) < 1) return mid;
    if (diff(lo) * d < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
