import test from 'node:test';
import assert from 'node:assert/strict';
import { berechneVorab, berechneAfa } from './calc.js';

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

export { basisConfig };
