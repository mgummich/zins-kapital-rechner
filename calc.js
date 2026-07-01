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
