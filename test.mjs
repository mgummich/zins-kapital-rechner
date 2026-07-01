import test from 'node:test';
import assert from 'node:assert/strict';
import { berechneVorab, berechneAfa, berechneDarlehen, berechneSzenario } from './calc.js';

const basisConfig = {
  kaufpreis: 300000,
  grundstücksanteil: 0.20,
  grEStSatz: 0.06,
  notarSatz: 0.015,
  maklerSatz: 0.0357,
  afaMethode: 'linear',
  afaSatz: 0.02,
  kaltmieteMonat: 1000,
  mietsteigerung: 0.015,
  leerstand: 0.02,
  verwaltung: 300,
  instandhaltung: 1200,        // sofort absetzbar (Werbungskosten)
  ruecklageZufuehrung: 0,      // WEG-Erhaltungsrücklage: Cashflow, NICHT absetzbar
  kostensteigerung: 0.015,
  grenzsteuersatz: 0.42,
  soliKirche: false,
  jahre: 20,
  wertsteigerung: 0.02,
  altRendite: 0.05,
  sollzinsUnterdeckung: 0.09,  // Zins auf negatives Seitenportfolio (Dispo/Lombard)
  verfügbaresKapital: 100000,
  verkaufAktiv: false,
  veräußerungskosten: 0,       // bei Verkauf: Makler, Vorfälligkeitsentschädigung
};

test('berechneVorab: Kaufnebenkosten und AfA-Basis (Spec §6)', () => {
  const v = berechneVorab(basisConfig);
  assert.equal(Math.round(v.kaufnebenkosten), 33210);
  assert.equal(Math.round(v.anschaffungskosten), 333210);
  assert.ok(Math.abs(v.afaBasis - 266568) < 1, `afaBasis=${v.afaBasis}`);
  assert.equal(v.gebäudeanteil, 0.8);
});

test('berechneAfa: linear 2% konstant (Spec §6)', () => {
  const { afaJahr, afaKumuliert } = berechneAfa(basisConfig, 266568, 20);
  assert.equal(afaJahr.length, 20);
  assert.ok(Math.abs(afaJahr[0] - 5331.36) < 1, `afa1=${afaJahr[0]}`);
  assert.ok(Math.abs(afaJahr[19] - 5331.36) < 1, 'linear bleibt konstant');
  assert.ok(Math.abs(afaKumuliert[1] - 2 * 5331.36) < 1);
});

test('berechneAfa: degressiv 5% fällt und wechselt zu linear', () => {
  const cfg = { ...basisConfig, afaMethode: 'degressiv', afaSatz: 0.05 };
  const { afaJahr } = berechneAfa(cfg, 266568, 40);
  assert.ok(Math.abs(afaJahr[0] - 13328.4) < 1, `afa1=${afaJahr[0]}`); // 0.05*266568
  assert.ok(afaJahr[1] < afaJahr[0], 'degressiv fällt');
  // irgendwann Wechsel zu linear: danach steigt der jährliche Betrag nicht mehr,
  // bleibt aber positiv und konstant bis Restbuchwert aufgebraucht
  const spät = afaJahr.slice(20);
  assert.ok(spät.every((x) => x >= 0));
});

const finB = { eigenkapital: 40000, sollzins: 0.039, anfTilgung: 0.02, zinsbindung: 10, anschlusszins: 0.04, sondertilgung: 0, finanzierungskosten: 0 };
const finA = { eigenkapital: 100000, sollzins: 0.035, anfTilgung: 0.02, zinsbindung: 10, anschlusszins: 0.04, sondertilgung: 0, finanzierungskosten: 0 };

test('berechneDarlehen: Szenario B Jahr 1 (Spec §6)', () => {
  const d = berechneDarlehen(finB, 333210, 20);
  // Darlehen = 333210 - 40000 = 293210
  assert.ok(Math.abs(d.zins[0] - 11400) < 150, `zins1=${d.zins[0]}`);
  assert.ok(Math.abs(d.tilgung[0] - 5900) < 150, `tilgung1=${d.tilgung[0]}`);
  assert.ok(d.restschuld[0] < 293210, 'Restschuld sinkt');
  assert.ok(d.restschuld[19] < d.restschuld[0], 'Restschuld monoton fallend');
});

test('berechneDarlehen: Szenario A Jahr 1 (Spec §6)', () => {
  const d = berechneDarlehen(finA, 333210, 20);
  // Darlehen = 233210
  assert.ok(Math.abs(d.zins[0] - 8100) < 150, `zins1=${d.zins[0]}`);
  assert.ok(Math.abs(d.tilgung[0] - 4700) < 150, `tilgung1=${d.tilgung[0]}`);
});

test('berechneDarlehen: EK > Anschaffungskosten → Darlehen 0', () => {
  const d = berechneDarlehen({ ...finA, eigenkapital: 400000 }, 333210, 5);
  assert.equal(d.zins[0], 0);
  assert.equal(d.restschuld[0], 0);
});

test('berechneDarlehen: hoher Anschlusszins → keine negative Amortisation (Re-Annuisierung)', () => {
  const d = berechneDarlehen({ ...finB, zinsbindung: 5, anschlusszins: 0.12 }, 333210, 15);
  // trotz 12% Anschlusszins muss die Restschuld weiter fallen, nie wachsen
  for (let i = 1; i < d.restschuld.length; i++) {
    assert.ok(d.restschuld[i] <= d.restschuld[i - 1] + 1e-6, `Jahr ${i + 1}: Restschuld steigt`);
  }
});

test('berechneSzenario: Szenario B Jahr 1 (Spec §6)', () => {
  const r = berechneSzenario(basisConfig, finB);
  const j1 = r[0];
  assert.ok(Math.abs(j1.mietNetto - 11760) < 1, `mietNetto=${j1.mietNetto}`);
  assert.ok(Math.abs(j1.bewirtschaftungAbzieh - 1500) < 1, `bewirt=${j1.bewirtschaftungAbzieh}`);
  assert.ok(Math.abs(j1.steuerErgebnis - -6471) < 200, `steuerErgebnis=${j1.steuerErgebnis}`);
  assert.ok(Math.abs(j1.steuerEffekt - 2718) < 100, `steuerEffekt=${j1.steuerEffekt}`);
  assert.ok(Math.abs(j1.cashflowNachSteuer - -4321) < 200, `cfNachSt=${j1.cashflowNachSteuer}`);
});

test('berechneSzenario: Portfolio startet mit freiem Kapital', () => {
  const r = berechneSzenario(basisConfig, finB); // verfügbar 100000, EK 40000 → frei 60000
  // portfolio_1 = 60000*1.05 + cashflowNachSteuer_1
  assert.ok(r[0].portfolio > 55000 && r[0].portfolio < 63000, `portfolio1=${r[0].portfolio}`);
  assert.equal(r.length, 20);
});

test('berechneSzenario: mietNetto steigt mit Mietsteigerung', () => {
  const r = berechneSzenario(basisConfig, finB);
  assert.ok(r[1].mietNetto > r[0].mietNetto);
});

test('berechneSzenario: Erhaltungsrücklage senkt Cashflow, nicht die Steuer', () => {
  const basis = berechneSzenario(basisConfig, finB)[0];
  const mitRuecklage = berechneSzenario({ ...basisConfig, ruecklageZufuehrung: 1000 }, finB)[0];
  assert.ok(Math.abs(mitRuecklage.steuerEffekt - basis.steuerEffekt) < 0.01, 'Rücklage nicht absetzbar → Steuer gleich');
  assert.ok(Math.abs(mitRuecklage.cashflowNachSteuer - (basis.cashflowNachSteuer - 1000)) < 0.01, 'Rücklage mindert Cashflow voll');
});

test('berechneSzenario: Finanzierungskosten nur Jahr 1 absetzbar', () => {
  const finMitKosten = { ...finB, finanzierungskosten: 2000 };
  const r0 = berechneSzenario(basisConfig, finB);
  const r1 = berechneSzenario(basisConfig, finMitKosten);
  const stEff = 0.42;
  assert.ok(Math.abs(r1[0].steuerEffekt - (r0[0].steuerEffekt + 2000 * stEff)) < 0.01, 'Jahr 1: +2000 Werbungskosten');
  assert.ok(Math.abs(r1[1].steuerEffekt - r0[1].steuerEffekt) < 0.01, 'Jahr 2: kein Effekt');
});

import { irr, berechneKennzahlen, kritischeAltRendite } from './calc.js';

test('irr: bekannte Zahlungsreihe', () => {
  assert.ok(Math.abs(irr([-100, 110]) - 0.10) < 1e-4, `irr=${irr([-100, 110])}`);
  assert.ok(Math.abs(irr([-1000, 0, 0, 1331]) - 0.10) < 1e-3);
});

test('berechneKennzahlen: Szenario B Kennzahlen', () => {
  const r = berechneSzenario(basisConfig, finB);
  const k = berechneKennzahlen(r, basisConfig, finB);
  assert.ok(Math.abs(k.cashflowM1 - -360) < 30, `cfM1=${k.cashflowM1}`); // ≈ -360 €/Monat
  assert.equal(k.restschuldN, r[19].restschuld);
  assert.ok(typeof k.endvermögen === 'number');
  assert.ok(typeof k.irr === 'number' && isFinite(k.irr));
});

test('berechneKennzahlen: Verkauf aktiv verändert Endvermögen', () => {
  const cfg = { ...basisConfig, verkaufAktiv: true, veräußerungskosten: 5000 };
  const r = berechneSzenario(cfg, finB);
  const kMitVerkauf = berechneKennzahlen(r, cfg, finB);
  const kOhne = berechneKennzahlen(berechneSzenario({ ...basisConfig, veräußerungskosten: 5000 }, finB), { ...basisConfig, veräußerungskosten: 5000 }, finB);
  assert.notEqual(Math.round(kMitVerkauf.endvermögen), Math.round(kOhne.endvermögen));
  assert.ok(Math.abs(kMitVerkauf.endvermögen - (r[r.length - 1].portfolio + kMitVerkauf.terminalNetto)) < 0.01, 'Endvermögen bei Verkauf = Portfolio + terminalNetto');
});

test('berechneKennzahlen: terminalNetto ≤ Buchwert-EK bei N<10 (Kosten/Steuer abgezogen)', () => {
  const cfg = { ...basisConfig, jahre: 8, veräußerungskosten: 5000 };
  const k = berechneKennzahlen(berechneSzenario(cfg, finB), cfg, finB);
  assert.ok(k.terminalNetto <= k.immobilienEK_N, 'netto darf Buchwert nicht übersteigen');
  assert.ok(k.terminalNetto < k.immobilienEK_N, 'Kosten+latente Steuer senken den Wert');
});

test('kritischeAltRendite: Umschlagpunkt A↔B liegt im Intervall oder null', () => {
  const kr = kritischeAltRendite(basisConfig, finA, finB);
  assert.ok(kr === null || (kr > 0 && kr < 0.20), `kr=${kr}`);
  if (kr !== null) {
    const ev = (alt, fin) => {
      const c = { ...basisConfig, altRendite: alt };
      return berechneKennzahlen(berechneSzenario(c, fin), c, fin).endvermögen;
    };
    // unterhalb: mehr EK (A) vorn; oberhalb: weniger EK (B) vorn → Vorzeichenwechsel
    const unten = ev(kr - 0.02, finA) - ev(kr - 0.02, finB);
    const oben = ev(kr + 0.02, finA) - ev(kr + 0.02, finB);
    assert.ok(unten * oben < 0, 'Endvermögen-Differenz wechselt Vorzeichen um kr');
  }
});

import { stufenZins, berechneEKKurve } from './calc.js';

const stufen = [
  { maxLTV: 0.60, zins: 0.034 },
  { maxLTV: 0.80, zins: 0.036 },
  { maxLTV: 0.90, zins: 0.039 },
  { maxLTV: Infinity, zins: 0.043 },
];

test('stufenZins: Stufengrenzen', () => {
  assert.equal(stufenZins(0.50, stufen), 0.034);
  assert.equal(stufenZins(0.60, stufen), 0.034);
  assert.equal(stufenZins(0.61, stufen), 0.036);
  assert.equal(stufenZins(0.95, stufen), 0.043);
  assert.equal(stufenZins(1.20, stufen), 0.043); // > 100% → höchste Stufe
});

test('berechneEKKurve: Stützpunkte über EK-Bereich', () => {
  const params = { anfTilgung: 0.02, zinsbindung: 10, anschlusszins: 0.04, stufen, ekMin: 0, ekMax: 100000, schritt: 25000 };
  const kurve = berechneEKKurve(basisConfig, params);
  assert.equal(kurve.length, 5); // 0,25k,50k,75k,100k
  assert.equal(kurve[0].ek, 0);
  assert.equal(kurve[4].ek, 100000);
  assert.ok(kurve.every((p) => typeof p.endvermögen === 'number' && isFinite(p.endvermögen)));
  assert.ok(kurve.every((p) => typeof p.irr === 'number'));
});

export { basisConfig, finA, finB };

import { formatEUR, formatPct } from './format.js';

test('formatEUR: de-DE ohne Nachkommastellen', () => {
  assert.equal(formatEUR(333210), "333.210 €");
  assert.equal(formatEUR(-4321), "-4.321 €");
});

test('formatPct: Dezimal → Prozent', () => {
  assert.equal(formatPct(0.035), "3,5 %");
  assert.equal(formatPct(0.42), "42,0 %");
});
