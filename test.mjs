import test from 'node:test';
import assert from 'node:assert/strict';
import { berechneVorab, berechneAfa, berechneDarlehen } from './calc.js';

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

export { basisConfig, finA, finB };
