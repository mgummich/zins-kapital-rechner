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
