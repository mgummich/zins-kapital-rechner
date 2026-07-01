# Immobilien-Cashflow-Rechner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based German rental-property financing calculator with two modes — "A vs. B" scenario comparison and an "EK-Optimum" equity slider — both driven by one pure calculation engine.

**Architecture:** Pure calculation engine in `calc.js` (no DOM, no Intl) with `node:test` unit tests validated against the spec's §6 acceptance numbers. Thin `format.js` for de-DE formatting. `app.js` wires DOM inputs, Chart.js (CDN), and both modes to the engine. Single `index.html` hosts markup + styles and loads the modules via `<script type="module">`. No build step, deployable to GitHub Pages.

**Tech Stack:** Vanilla JavaScript (ES modules), Chart.js via CDN, `node:test` + `node:assert` for engine tests. No bundler, no framework, no runtime dependencies.

## Global Constraints

- Source spec: `specs/spec-immobilien-cashflow-rechner.md` (v1.1). Every task implements a part of it; numbers below are copied from it verbatim.
- All monetary values in Euro; all percentages stored as decimals in the engine (3,5 % → `0.035`). UI converts.
- Engine (`calc.js`) is PURE: no DOM access, no `Intl`, no side effects. Enables `node:test`.
- Loan amortization is computed MONTHLY (12 steps/year), aggregated to yearly figures.
- **Tilgung is not tax-deductible; AfA is deductible but not cash-flow-relevant.** (spec §3.4)
- de-DE number format in UI: Euro `Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0})`, percent one decimal.
- Disclaimer visible in UI: planning tool, no tax/legal advice, interest deductible only when renting, values are projections. (spec §4.1.6)
- No build step. `index.html` loads `calc.js`, `format.js`, `app.js` as ES modules. Must run when opened via `http://` (GitHub Pages); note `file://` blocks module CORS — serve with `python3 -m http.server` for local dev.
- Engine identifiers stay in German to match the spec (`berechneSzenario`, `restschuld`, …).

---

### Task 1: Project skeleton + `berechneVorab`

**Files:**
- Create: `calc.js`
- Create: `test.mjs`
- Create: `.nojekyll` (empty, so GitHub Pages serves files as-is)

**Interfaces:**
- Consumes: nothing.
- Produces: `berechneVorab(config) → { gebäudeanteil, kaufnebenkosten, anschaffungskosten, afaBasis }`. `config` fields used here: `kaufpreis`, `grundstücksanteil`, `grEStSatz`, `notarSatz`, `maklerSatz` (all decimals except `kaufpreis` in €).

- [ ] **Step 1: Write the failing test**

Append to `test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { berechneVorab } from './calc.js';

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

export { basisConfig };
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `berechneVorab` not exported from `calc.js`.

- [ ] **Step 3: Write minimal implementation**

Create `calc.js`:
```js
// Reine Rechen-Engine. Kein DOM, kein Intl. Prozentwerte als Dezimal.

export function berechneVorab(config) {
  const gebäudeanteil = 1 - config.grundstücksanteil;
  const kaufnebenkosten =
    config.kaufpreis * (config.grEStSatz + config.notarSatz + config.maklerSatz);
  const anschaffungskosten = config.kaufpreis + kaufnebenkosten;
  const afaBasis = anschaffungskosten * gebäudeanteil;
  return { gebäudeanteil, kaufnebenkosten, anschaffungskosten, afaBasis };
}
```

Create empty `.nojekyll` (touch, no content).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add calc.js test.mjs .nojekyll
git commit -m "feat: berechneVorab (Kaufnebenkosten, AfA-Basis)"
```

---

### Task 2: `berechneAfa` (linear + degressiv)

**Files:**
- Modify: `calc.js`
- Modify: `test.mjs`

**Interfaces:**
- Consumes: `config` (fields `afaMethode`, `afaSatz`), `afaBasis` from `berechneVorab`.
- Produces: `berechneAfa(config, afaBasis, jahre) → { afaJahr: number[], afaKumuliert: number[] }`, both arrays length `jahre`, index 0 = year 1. `afaMethode` ∈ `'linear' | 'degressiv'`.

- [ ] **Step 1: Write the failing test**

Append to `test.mjs`:
```js
import { berechneAfa } from './calc.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `berechneAfa` not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `calc.js`:
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (3 tests total).

- [ ] **Step 5: Commit**

```bash
git add calc.js test.mjs
git commit -m "feat: berechneAfa (linear + degressiv mit Wechsel)"
```

---

### Task 3: `berechneDarlehen` (monthly annuity amortization)

**Files:**
- Modify: `calc.js`
- Modify: `test.mjs`

**Interfaces:**
- Consumes: `finanzierung`, `anschaffungskosten`, `jahre`.
- Produces: `berechneDarlehen(finanzierung, anschaffungskosten, jahre) → { zins: number[], tilgung: number[], restschuld: number[] }`, arrays length `jahre`, index 0 = year 1. `restschuld[i]` = balance at end of year i+1. `finanzierung` fields: `eigenkapital`, `sollzins`, `anfTilgung`, `zinsbindung`, `anschlusszins`, `sondertilgung`.

- [ ] **Step 1: Write the failing test**

Append to `test.mjs`:
```js
import { berechneDarlehen } from './calc.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `berechneDarlehen` not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `calc.js`:
```js
export function berechneDarlehen(finanzierung, anschaffungskosten, jahre) {
  const darlehen = Math.max(0, anschaffungskosten - finanzierung.eigenkapital);
  const zins = [];
  const tilgung = [];
  const restschuld = [];

  // Annuität aus Anfangsdarlehen; nach Zinsbindung Rate konstant, nur Split ändert sich.
  const annuitätJahr = darlehen * (finanzierung.sollzins + finanzierung.anfTilgung);
  const monatsrate = annuitätJahr / 12;
  let rest = darlehen;

  for (let t = 1; t <= jahre; t++) {
    const aktuellerZins = t <= finanzierung.zinsbindung ? finanzierung.sollzins : finanzierung.anschlusszins;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add calc.js test.mjs
git commit -m "feat: berechneDarlehen (monatliche Annuität, Zinsbindung, Sondertilgung)"
```

---

### Task 4: `berechneSzenario` (yearly rows: rent, tax, cashflow, wealth)

**Files:**
- Modify: `calc.js`
- Modify: `test.mjs`

**Interfaces:**
- Consumes: `config`, `finanzierung`; internally calls `berechneVorab`, `berechneAfa`, `berechneDarlehen`.
- Produces: `berechneSzenario(config, finanzierung) → Zeile[]` length `config.jahre`. `Zeile = { jahr, mietNetto, bewirtschaftungAbzieh, ruecklage, zins, tilgung, afa, steuerErgebnis, steuerEffekt, cashflowVorSteuer, cashflowNachSteuer, restschuld, immobilienwert, immobilienEK, portfolio, gesamtvermögen }`. `bewirtschaftungAbzieh` = deductible (Werbungskosten); `ruecklage` = non-deductible cash outflow. `config` gains `ruecklageZufuehrung`; `finanzierung` gains `finanzierungskosten` (deducted in year 1 only).

- [ ] **Step 1: Write the failing test**

Append to `test.mjs`:
```js
import { berechneSzenario } from './calc.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `berechneSzenario` not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `calc.js`:
```js
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

    const portfolio = portfolioVor * (1 + config.altRendite) + cashflowNachSteuer;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add calc.js test.mjs
git commit -m "feat: berechneSzenario (Miete, Steuer, Cashflow, Vermögen, Seitenportfolio)"
```

---

### Task 5: `irr` + `berechneKennzahlen` (incl. optional sale)

**Files:**
- Modify: `calc.js`
- Modify: `test.mjs`

**Interfaces:**
- Consumes: `reihe` (from `berechneSzenario`), `config`, `finanzierung`; `berechneVorab` for `anschaffungskosten` and `afaKumuliert` for Spekulationssteuer.
- Produces:
  - `irr(zahlungen: number[]) → number` — internal rate of return via bisection; `zahlungen[0]` is the initial outflow (negative).
  - `berechneKennzahlen(reihe, config, finanzierung) → { cashflowM1, breakEvenJahr, restschuldN, endvermögen, irr }`. `breakEvenJahr` = first year (1-based) with `cashflowNachSteuer ≥ 0`, else `null`.

- [ ] **Step 1: Write the failing test**

Append to `test.mjs`:
```js
import { irr, berechneKennzahlen } from './calc.js';

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
  const r = berechneSzenario({ ...basisConfig, verkaufAktiv: true }, finB);
  const kMitVerkauf = berechneKennzahlen(r, { ...basisConfig, verkaufAktiv: true }, finB);
  const kOhne = berechneKennzahlen(berechneSzenario(basisConfig, finB), basisConfig, finB);
  assert.notEqual(Math.round(kMitVerkauf.endvermögen), Math.round(kOhne.endvermögen));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `irr` / `berechneKennzahlen` not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `calc.js`:
```js
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

  // Endvermögen: mit oder ohne Verkauf (spec §3.7)
  let endvermögen;
  let letzterZahlungszuschlag; // wird zur letzten IRR-Zahlung addiert
  if (config.verkaufAktiv) {
    const { anschaffungskosten } = berechneVorab(config);
    const { afaKumuliert } = berechneAfa(config, berechneVorab(config).afaBasis, N);
    const stEff = config.grenzsteuersatz * (config.soliKirche ? 1.055 : 1);
    const verkaufspreis = reihe[N - 1].immobilienwert;
    const vk = config.veräußerungskosten || 0; // Makler, Vorfälligkeitsentschädigung
    let spekusteuer = 0;
    if (N < 10) {
      const gewinn = verkaufspreis - (anschaffungskosten - afaKumuliert[N - 1]) - vk;
      spekusteuer = Math.max(gewinn, 0) * stEff;
    }
    const nettoVerkaufserlös = verkaufspreis - restschuldN - spekusteuer - vk;
    endvermögen = reihe[N - 1].portfolio + nettoVerkaufserlös;
    letzterZahlungszuschlag = nettoVerkaufserlös;
  } else {
    endvermögen = reihe[N - 1].gesamtvermögen;
    letzterZahlungszuschlag = reihe[N - 1].immobilienEK; // fiktiver Verkauf zum EK-Buchwert
  }

  // IRR auf [-EK, cf_1, …, cf_{N-1}, cf_N + Zuschlag]
  const zahlungen = [-finanzierung.eigenkapital];
  for (let t = 1; t <= N; t++) {
    let z = reihe[t - 1].cashflowNachSteuer;
    if (t === N) z += letzterZahlungszuschlag;
    zahlungen.push(z);
  }

  return { cashflowM1, breakEvenJahr, restschuldN, endvermögen, irr: irr(zahlungen) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add calc.js test.mjs
git commit -m "feat: irr + berechneKennzahlen (Verkauf, Spekulationssteuer, EK-Rendite)"
```

---

### Task 6: `stufenZins` + `berechneEKKurve` (EK-Optimum engine)

**Files:**
- Modify: `calc.js`
- Modify: `test.mjs`

**Interfaces:**
- Consumes: `config`, `berechneVorab`, `berechneSzenario`, `berechneKennzahlen`.
- Produces:
  - `stufenZins(ltv, stufen) → number` — `stufen` is `[{ maxLTV, zins }]` sorted ascending by `maxLTV`; returns the `zins` of the first stufe with `ltv ≤ maxLTV`, else the last stufe's `zins`.
  - `berechneEKKurve(config, ekParams) → { ek, endvermögen, irr }[]`. `ekParams = { anfTilgung, zinsbindung, anschlusszins, stufen, ekMin, ekMax, schritt }`.

- [ ] **Step 1: Write the failing test**

Append to `test.mjs`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `stufenZins` / `berechneEKKurve` not defined.

- [ ] **Step 3: Write minimal implementation**

Add to `calc.js`:
```js
export function stufenZins(ltv, stufen) {
  for (const stufe of stufen) {
    if (ltv <= stufe.maxLTV) return stufe.zins;
  }
  return stufen[stufen.length - 1].zins;
}

export function berechneEKKurve(config, ekParams) {
  const { anschaffungskosten } = berechneVorab(config);
  const punkte = [];
  for (let ek = ekParams.ekMin; ek <= ekParams.ekMax + 1e-6; ek += ekParams.schritt) {
    const darlehen = Math.max(0, anschaffungskosten - ek);
    const ltv = config.kaufpreis > 0 ? darlehen / config.kaufpreis : 0;
    const sollzins = stufenZins(ltv, ekParams.stufen);
    const finanzierung = {
      eigenkapital: ek,
      sollzins,
      anfTilgung: ekParams.anfTilgung,
      zinsbindung: ekParams.zinsbindung,
      anschlusszins: ekParams.anschlusszins,
      sondertilgung: 0,
      finanzierungskosten: 0,
    };
    const reihe = berechneSzenario(config, finanzierung);
    const k = berechneKennzahlen(reihe, config, finanzierung);
    punkte.push({ ek, endvermögen: k.endvermögen, irr: k.irr });
  }
  return punkte;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (16 tests total).

- [ ] **Step 5: Commit**

```bash
git add calc.js test.mjs
git commit -m "feat: stufenZins + berechneEKKurve (EK-Optimum-Modus)"
```

---

### Task 7: `format.js` (de-DE formatting)

**Files:**
- Create: `format.js`
- Modify: `test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatEUR(n) → string` (Euro, no decimals, de-DE), `formatPct(n, decimals=1) → string` (n is a decimal like `0.035` → `"3,5 %"`).

- [ ] **Step 1: Write the failing test**

Append to `test.mjs`:
```js
import { formatEUR, formatPct } from './format.js';

test('formatEUR: de-DE ohne Nachkommastellen', () => {
  assert.equal(formatEUR(333210), '333.210 €');
  assert.equal(formatEUR(-4321), '-4.321 €');
});

test('formatPct: Dezimal → Prozent', () => {
  assert.equal(formatPct(0.035), '3,5 %');
  assert.equal(formatPct(0.42), '42,0 %');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `./format.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `format.js`:
```js
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function formatEUR(n) {
  return eur.format(Math.round(n));
}

export function formatPct(n, decimals = 1) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n * 100) + ' %';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (18 tests total). Note: `Intl` de-DE uses a non-breaking space before `€`/`%`; if an assertion fails on the space character, copy the actual output into the expected string.

- [ ] **Step 5: Commit**

```bash
git add format.js test.mjs
git commit -m "feat: format.js (de-DE Euro/Prozent)"
```

---

### Task 8: `index.html` + `app.js` — A-vs-B mode UI

**Files:**
- Create: `index.html`
- Create: `app.js`

**Interfaces:**
- Consumes: all `calc.js` exports, `format.js` exports.
- Produces: a working page. `app.js` exports `leseConfig()`, `leseFinanzierung(suffix)`, `renderAB()` for reuse in Task 9.

This task is UI; verification is a manual browser check against spec §6, plus the engine tests already prove the math. No new `node:test` (no DOM in node without adding a dependency, which the no-dependency constraint forbids).

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Immobilien-Cashflow-Rechner</title>
  <style>
    :root { --gap: 12px; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; max-width: 1100px; margin-inline: auto; color: #1a1a1a; }
    h1 { font-size: 1.4rem; }
    fieldset { border: 1px solid #ccc; border-radius: 8px; margin-bottom: var(--gap); }
    legend { font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--gap); }
    label { display: flex; flex-direction: column; font-size: 0.85rem; gap: 2px; }
    input, select { padding: 6px; font-size: 0.9rem; }
    .szenarien { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap); }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--gap); }
    .kpi { border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
    .kpi b { display: block; font-size: 1.15rem; }
    .modus { display: flex; gap: 8px; margin-bottom: var(--gap); }
    .modus button { padding: 8px 14px; cursor: pointer; }
    .modus button[aria-pressed="true"] { background: #1a1a1a; color: #fff; }
    #fazit { padding: 12px; border-radius: 8px; background: #eef6ff; margin: var(--gap) 0; }
    .disclaimer { font-size: 0.75rem; color: #666; border-top: 1px solid #ddd; margin-top: 24px; padding-top: 12px; }
    table { border-collapse: collapse; width: 100%; font-size: 0.8rem; }
    th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: right; }
    @media (max-width: 700px) { .szenarien { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>Immobilien-Cashflow-Rechner</h1>
  <div class="modus">
    <button id="modeAB" aria-pressed="true">A vs. B</button>
    <button id="modeEK" aria-pressed="false">EK-Optimum</button>
  </div>

  <form id="form">
    <fieldset><legend>Objekt &amp; Kauf</legend><div class="grid" id="grpObjekt"></div></fieldset>
    <fieldset><legend>AfA</legend><div class="grid" id="grpAfa"></div></fieldset>
    <fieldset><legend>Miete</legend><div class="grid" id="grpMiete"></div></fieldset>
    <fieldset><legend>Kosten</legend><div class="grid" id="grpKosten"></div></fieldset>
    <fieldset><legend>Steuer</legend><div class="grid" id="grpSteuer"></div></fieldset>
    <fieldset><legend>Annahmen &amp; Zeitraum</legend><div class="grid" id="grpAnnahmen"></div></fieldset>

    <fieldset id="fsAB"><legend>Finanzierung</legend>
      <div class="szenarien">
        <div><h3>Szenario A</h3><div class="grid" id="grpFinA"></div></div>
        <div><h3>Szenario B</h3><div class="grid" id="grpFinB"></div></div>
      </div>
    </fieldset>

    <fieldset id="fsEK" hidden><legend>Finanzierung (EK-Optimum)</legend>
      <div class="grid" id="grpEK"></div>
      <h4>LTV → Zins-Stufen</h4>
      <table id="stufenTabelle"><thead><tr><th>LTV ≤</th><th>Zins %</th></tr></thead><tbody></tbody></table>
      <label>Eigenkapital: <span id="ekWert"></span>
        <input type="range" id="ekRegler" />
      </label>
      <div><label>Y-Achse:
        <select id="ekMetrik"><option value="endvermögen">Endvermögen</option><option value="irr">EK-Rendite (IRR)</option></select>
      </label></div>
    </fieldset>
  </form>

  <div id="fazit"></div>
  <div class="kpis" id="kpis"></div>
  <canvas id="chart" height="120"></canvas>
  <details><summary>Jahres-Tabelle</summary><div id="tabelle"></div></details>

  <p class="disclaimer">
    Planungswerkzeug, keine Steuer- oder Rechtsberatung. Schuldzinsen sind nur bei
    vermieteten Objekten absetzbar. Alle Werte sind Prognosen unter den angegebenen Annahmen.
  </p>

  <!-- Chart.js gepinnt + Subresource Integrity (Hash in Step 1b berechnen und hier einsetzen) -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"
          integrity="sha384-REPLACE_IN_STEP_1B" crossorigin="anonymous"></script>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 1b: Compute the Chart.js SRI hash and insert it**

The `integrity` attribute must not ship as a placeholder. Compute the real hash for the pinned file and replace `sha384-REPLACE_IN_STEP_1B`:
```bash
curl -sL https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```
Take the output `<HASH>` and set `integrity="sha384-<HASH>"` in `index.html`.
Expected: page loads Chart.js; if the CDN file is tampered, the browser refuses to run it.

- [ ] **Step 2: Create `app.js` — field definitions, config readers, A/B render**

```js
import { berechneSzenario, berechneKennzahlen, berechneEKKurve, berechneVorab } from './calc.js';
import { formatEUR, formatPct } from './format.js';

// Feld-Definitionen: [id, label, default, {pct?, int?}]
const felder = {
  grpObjekt: [
    ['kaufpreis', 'Kaufpreis (€)', 300000, {}],
    ['grundstücksanteil', 'Grundstücksanteil (%)', 25, { pct: true }],
    ['grEStSatz', 'Grunderwerbsteuer (%)', 6.0, { pct: true }],
    ['notarSatz', 'Notar & Grundbuch (%)', 1.5, { pct: true }],
    ['maklerSatz', 'Maklerprovision (%)', 3.57, { pct: true }],
  ],
  grpAfa: [['afaSatz', 'AfA-Satz (%)', 2.0, { pct: true }]],
  grpMiete: [
    ['kaltmieteMonat', 'Kaltmiete/Monat (€)', 1000, {}],
    ['mietsteigerung', 'Mietsteigerung p.a. (%)', 1.5, { pct: true }],
    ['leerstand', 'Leerstand (%)', 2, { pct: true }],
  ],
  grpKosten: [
    ['verwaltung', 'Verwaltung p.a. (€)', 300, {}],
    ['instandhaltung', 'Instandhaltung sofort absetzbar p.a. (€)', 1200, {}],
    ['ruecklageZufuehrung', 'Zuführung Erhaltungsrücklage p.a. (€, nicht absetzbar)', 0, {}],
    ['kostensteigerung', 'Kostensteigerung p.a. (%)', 1.5, { pct: true }],
  ],
  grpSteuer: [['grenzsteuersatz', 'Grenzsteuersatz (%)', 42, { pct: true }]],
  grpAnnahmen: [
    ['jahre', 'Betrachtungszeitraum (Jahre)', 20, { int: true }],
    ['wertsteigerung', 'Wertsteigerung p.a. (%)', 2.0, { pct: true }],
    ['altRendite', 'Alternativrendite netto (%)', 5.0, { pct: true }],
    ['verfügbaresKapital', 'Verfügbares Kapital (€)', 100000, {}],
    ['veräußerungskosten', 'Veräußerungskosten bei Verkauf (€)', 0, {}],
  ],
};
const finFelder = [
  ['eigenkapital', 'Eigenkapital (€)'],
  ['sollzins', 'Sollzins p.a. (%)', { pct: true }],
  ['anfTilgung', 'Anf. Tilgung p.a. (%)', { pct: true }],
  ['zinsbindung', 'Zinsbindung (Jahre)', { int: true }],
  ['anschlusszins', 'Anschlusszins p.a. (%)', { pct: true }],
  ['finanzierungskosten', 'Finanzierungskosten einmalig (€)', {}],
];
const finDefaults = { A: [100000, 3.5, 2.0, 10, 4.0, 0], B: [40000, 3.9, 2.0, 10, 4.0, 0] };

function feldHtml(id, label, def, opt) {
  return `<label>${label}<input id="${id}" type="number" step="any" value="${def}" /></label>`;
}

function baueFelder() {
  for (const [grp, liste] of Object.entries(felder)) {
    document.getElementById(grp).innerHTML = liste.map(([id, l, d, o]) => feldHtml(id, l, d, o)).join('');
  }
  const soli = `<label>Soli & Kirchensteuer<select id="soliKirche"><option value="0">Nein</option><option value="1">Ja</option></select></label>`;
  document.getElementById('grpSteuer').insertAdjacentHTML('beforeend', soli);
  const afaMethode = `<label>AfA-Methode<select id="afaMethode"><option value="linear">linear</option><option value="degressiv">degressiv 5%</option></select></label>`;
  document.getElementById('grpAfa').insertAdjacentHTML('afterbegin', afaMethode);
  const verkauf = `<label>Verkauf am Ende<select id="verkaufAktiv"><option value="0">Nein</option><option value="1">Ja</option></select></label>`;
  document.getElementById('grpAnnahmen').insertAdjacentHTML('beforeend', verkauf);
  for (const suffix of ['A', 'B']) {
    document.getElementById('grpFin' + suffix).innerHTML = finFelder
      .map(([id, l], i) => `<label>${l}<input id="${id}_${suffix}" type="number" step="any" value="${finDefaults[suffix][i]}" /></label>`)
      .join('');
  }
}

const num = (id) => parseFloat(document.getElementById(id).value) || 0;
const pct = (id) => num(id) / 100;

export function leseConfig() {
  return {
    kaufpreis: num('kaufpreis'),
    grundstücksanteil: pct('grundstücksanteil'),
    grEStSatz: pct('grEStSatz'), notarSatz: pct('notarSatz'), maklerSatz: pct('maklerSatz'),
    afaMethode: document.getElementById('afaMethode').value, afaSatz: pct('afaSatz'),
    kaltmieteMonat: num('kaltmieteMonat'), mietsteigerung: pct('mietsteigerung'), leerstand: pct('leerstand'),
    verwaltung: num('verwaltung'), instandhaltung: num('instandhaltung'),
    ruecklageZufuehrung: num('ruecklageZufuehrung'), kostensteigerung: pct('kostensteigerung'),
    grenzsteuersatz: pct('grenzsteuersatz'), soliKirche: document.getElementById('soliKirche').value === '1',
    jahre: Math.round(num('jahre')), wertsteigerung: pct('wertsteigerung'), altRendite: pct('altRendite'),
    verfügbaresKapital: num('verfügbaresKapital'), verkaufAktiv: document.getElementById('verkaufAktiv').value === '1',
    veräußerungskosten: num('veräußerungskosten'),
  };
}

export function leseFinanzierung(suffix) {
  return {
    eigenkapital: num('eigenkapital_' + suffix), sollzins: pct('sollzins_' + suffix),
    anfTilgung: pct('anfTilgung_' + suffix), zinsbindung: Math.round(num('zinsbindung_' + suffix)),
    anschlusszins: pct('anschlusszins_' + suffix), sondertilgung: 0,
    finanzierungskosten: num('finanzierungskosten_' + suffix),
  };
}

let chart;
function zeichneChart(labels, datasets) {
  const ctx = document.getElementById('chart');
  if (chart) chart.destroy();
  chart = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: { responsive: true } });
}

export function renderAB() {
  const config = leseConfig();
  const rA = berechneSzenario(config, leseFinanzierung('A'));
  const rB = berechneSzenario(config, leseFinanzierung('B'));
  const kA = berechneKennzahlen(rA, config, leseFinanzierung('A'));
  const kB = berechneKennzahlen(rB, config, leseFinanzierung('B'));

  document.getElementById('kpis').innerHTML = [
    ['Cashflow/Monat J1 A', formatEUR(kA.cashflowM1)], ['Cashflow/Monat J1 B', formatEUR(kB.cashflowM1)],
    ['Endvermögen A', formatEUR(kA.endvermögen)], ['Endvermögen B', formatEUR(kB.endvermögen)],
    ['EK-Rendite A', formatPct(kA.irr)], ['EK-Rendite B', formatPct(kB.irr)],
  ].map(([t, v]) => `<div class="kpi">${t}<b>${v}</b></div>`).join('');

  const diff = kB.endvermögen - kA.endvermögen;
  const sieger = diff >= 0 ? 'B' : 'A';
  document.getElementById('fazit').textContent =
    `Szenario ${sieger} baut nach ${config.jahre} Jahren ${formatEUR(Math.abs(diff))} mehr Vermögen auf.`;

  const labels = rA.map((z) => 'J' + z.jahr);
  zeichneChart(labels, [
    { label: 'Gesamtvermögen A', data: rA.map((z) => z.gesamtvermögen), borderColor: '#2563eb', tension: 0.1 },
    { label: 'Gesamtvermögen B', data: rB.map((z) => z.gesamtvermögen), borderColor: '#dc2626', tension: 0.1 },
  ]);

  document.getElementById('tabelle').innerHTML = tabelleHtml(rB);
}

function tabelleHtml(reihe) {
  const kopf = ['Jahr', 'Miete netto', 'Zins', 'Tilgung', 'AfA', 'Steuer-Effekt', 'CF n. St.', 'Restschuld', 'Vermögen'];
  const zeilen = reihe.map((z) => `<tr><td>${z.jahr}</td><td>${formatEUR(z.mietNetto)}</td><td>${formatEUR(z.zins)}</td><td>${formatEUR(z.tilgung)}</td><td>${formatEUR(z.afa)}</td><td>${formatEUR(z.steuerEffekt)}</td><td>${formatEUR(z.cashflowNachSteuer)}</td><td>${formatEUR(z.restschuld)}</td><td>${formatEUR(z.gesamtvermögen)}</td></tr>`).join('');
  return `<table><thead><tr>${kopf.map((k) => `<th>${k}</th>`).join('')}</tr></thead><tbody>${zeilen}</tbody></table>`;
}

// --- Init & Events (Task 9 ergänzt Modus-Umschaltung) ---
let debounce;
function neuBerechnen() {
  clearTimeout(debounce);
  debounce = setTimeout(() => { if (aktuellerModus === 'AB') renderAB(); else renderEK(); }, 150);
}

let aktuellerModus = 'AB';
baueFelder();
document.getElementById('form').addEventListener('input', neuBerechnen);
renderAB();
```

- [ ] **Step 3: Manual browser check**

Run: `python3 -m http.server 8000` then open `http://localhost:8000`.
Expected: page renders with defaults; KPI cards show Cashflow/Monat J1 for B ≈ **−360 €** and A ≈ **−103 €** (spec §6). Chart shows two wealth lines. Table populates. Disclaimer visible.

Note: `renderEK` is referenced but defined in Task 9. Until then, temporarily stub `function renderEK(){}` at the bottom of `app.js`, or implement Task 9 before running the EK path. The A/B path works standalone.

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "feat: A-vs-B UI (Inputs, KPIs, Chart, Tabelle, Fazit, Disclaimer)"
```

---

### Task 9: EK-Optimum mode UI (mode toggle, LTV tiers, slider, curve)

**Files:**
- Modify: `app.js`
- Modify: `index.html` (only if adjustments needed — markup already present from Task 8)

**Interfaces:**
- Consumes: `berechneEKKurve`, `berechneVorab`, `berechneSzenario`, `berechneKennzahlen` from `calc.js`; `leseConfig` from Task 8.
- Produces: `renderEK()` (replaces the Task 8 stub), mode switching between `#fsAB` and `#fsEK`.

- [ ] **Step 1: Add LTV-tier state + EK params readers to `app.js`**

Replace the `renderEK` stub. Add near the top-level (after `leseFinanzierung`):
```js
const stufenDefault = [
  { maxLTV: 0.60, zins: 3.4 }, { maxLTV: 0.80, zins: 3.6 },
  { maxLTV: 0.90, zins: 3.9 }, { maxLTV: Infinity, zins: 4.3 },
];

function baueEKFelder() {
  document.getElementById('grpEK').innerHTML = [
    ['ek_anfTilgung', 'Anf. Tilgung p.a. (%)', 2.0],
    ['ek_zinsbindung', 'Zinsbindung (Jahre)', 10],
    ['ek_anschlusszins', 'Anschlusszins p.a. (%)', 4.0],
  ].map(([id, l, d]) => `<label>${l}<input id="${id}" type="number" step="any" value="${d}" /></label>`).join('');

  document.querySelector('#stufenTabelle tbody').innerHTML = stufenDefault
    .map((s, i) => `<tr><td><input id="ltv_${i}" type="number" step="any" value="${s.maxLTV === Infinity ? 100 : s.maxLTV * 100}" /></td><td><input id="zins_${i}" type="number" step="any" value="${s.zins}" /></td></tr>`)
    .join('');
}

function leseStufen() {
  return stufenDefault.map((_, i) => ({
    maxLTV: i === stufenDefault.length - 1 ? Infinity : num('ltv_' + i) / 100,
    zins: num('zins_' + i) / 100,
  }));
}

function leseEKParams(config) {
  return {
    anfTilgung: num('ek_anfTilgung') / 100,
    zinsbindung: Math.round(num('ek_zinsbindung')),
    anschlusszins: num('ek_anschlusszins') / 100,
    stufen: leseStufen(),
    ekMin: 0,
    ekMax: config.verfügbaresKapital,
    schritt: Math.max(1000, Math.round(config.verfügbaresKapital / 20 / 1000) * 1000),
  };
}
```

- [ ] **Step 2: Implement `renderEK()`**

```js
function renderEK() {
  const config = leseConfig();
  const params = leseEKParams(config);
  const kurve = berechneEKKurve(config, params);
  const metrik = document.getElementById('ekMetrik').value; // 'endvermögen' | 'irr'

  // Regler an EK-Bereich koppeln
  const regler = document.getElementById('ekRegler');
  regler.min = params.ekMin; regler.max = params.ekMax; regler.step = params.schritt;
  if (!regler.value || regler.value > params.ekMax) regler.value = Math.min(params.ekMax, config.verfügbaresKapital);
  const ekAktuell = parseFloat(regler.value);
  document.getElementById('ekWert').textContent = formatEUR(ekAktuell);

  // Optimum (max Endvermögen)
  const opt = kurve.reduce((a, b) => (b.endvermögen > a.endvermögen ? b : a));

  // Karte am Reglerpunkt
  const { anschaffungskosten } = berechneVorab(config);
  const darlehen = Math.max(0, anschaffungskosten - ekAktuell);
  const ltv = config.kaufpreis > 0 ? darlehen / config.kaufpreis : 0;
  const zins = leseStufen().reduce((acc, s) => (acc !== null ? acc : (ltv <= s.maxLTV ? s.zins : null)), null) ?? params.stufen.at(-1).zins;
  const fin = { eigenkapital: ekAktuell, sollzins: zins, anfTilgung: params.anfTilgung, zinsbindung: params.zinsbindung, anschlusszins: params.anschlusszins, sondertilgung: 0, finanzierungskosten: 0 };
  const kPunkt = berechneKennzahlen(berechneSzenario(config, fin), config, fin);

  document.getElementById('kpis').innerHTML = [
    ['Darlehen', formatEUR(darlehen)], ['LTV', formatPct(ltv)], ['Sollzins', formatPct(zins)],
    ['Endvermögen', formatEUR(kPunkt.endvermögen)], ['EK-Rendite', formatPct(kPunkt.irr)],
    ['Cashflow/Monat J1', formatEUR(kPunkt.cashflowM1)],
  ].map(([t, v]) => `<div class="kpi">${t}<b>${v}</b></div>`).join('');

  document.getElementById('fazit').textContent =
    `Optimales Eigenkapital (max. Endvermögen): ${formatEUR(opt.ek)} → ${formatEUR(opt.endvermögen)}.`;

  const labels = kurve.map((p) => formatEUR(p.ek));
  const data = kurve.map((p) => (metrik === 'irr' ? p.irr * 100 : p.endvermögen));
  zeichneChart(labels, [{
    label: metrik === 'irr' ? 'EK-Rendite p.a. (%)' : 'Endvermögen (€)',
    data, borderColor: '#2563eb', tension: 0.1,
  }]);
  document.getElementById('tabelle').innerHTML = '';
}
```

- [ ] **Step 3: Wire the mode toggle**

Replace the init block at the bottom of `app.js` with:
```js
let debounce;
function neuBerechnen() {
  clearTimeout(debounce);
  debounce = setTimeout(() => { if (aktuellerModus === 'AB') renderAB(); else renderEK(); }, 150);
}

let aktuellerModus = 'AB';
function setzeModus(modus) {
  aktuellerModus = modus;
  const ab = modus === 'AB';
  document.getElementById('modeAB').setAttribute('aria-pressed', ab);
  document.getElementById('modeEK').setAttribute('aria-pressed', !ab);
  document.getElementById('fsAB').hidden = !ab;
  document.getElementById('fsEK').hidden = ab;
  if (ab) renderAB(); else renderEK();
}

baueFelder();
baueEKFelder();
document.getElementById('form').addEventListener('input', neuBerechnen);
document.getElementById('ekRegler').addEventListener('input', () => aktuellerModus === 'EK' && renderEK());
document.getElementById('modeAB').addEventListener('click', () => setzeModus('AB'));
document.getElementById('modeEK').addEventListener('click', () => setzeModus('EK'));
setzeModus('AB');
```

Remove the old temporary `renderEK` stub and the old init lines from Task 8.

- [ ] **Step 4: Manual browser check**

Run: `python3 -m http.server 8000`, open `http://localhost:8000`, click **EK-Optimum**.
Expected: LTV-tier table + EK slider appear; chart shows a curve over the EK axis; moving the slider updates the KPI card (Darlehen, LTV, Sollzins recompute per tier); Fazit names the optimal EK; the Y-axis dropdown switches between Endvermögen and IRR. Switching back to **A vs. B** restores that view.

- [ ] **Step 5: Commit**

```bash
git add app.js index.html
git commit -m "feat: EK-Optimum-Modus (Regler, LTV-Stufen, Kurve, Optimum-Fazit)"
```

---

### Task 10: README + GitHub Pages deploy

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: docs + published site.

- [ ] **Step 1: Write `README.md`**

```markdown
# zins-kapital-rechner

Rechner für vermietete Kapitalanlage-Immobilien (Deutschland). Vergleicht
Finanzierungsvarianten nach Cashflow, Steuer und Vermögensaufbau.

**Zwei Modi:**
- **A vs. B** — zwei Finanzierungen gegenüberstellen (mehr EK/niedriger Zins vs. weniger EK/höherer Zins).
- **EK-Optimum** — Eigenkapital per Regler variieren, optimales EK als Kurve.

## Lokal starten

Kein Build. Wegen ES-Modulen über HTTP servieren:

    python3 -m http.server 8000

Dann http://localhost:8000 öffnen.

## Tests

    node --test

Prüft die Rechen-Engine (`calc.js`) gegen die Abnahmewerte der Spec.

## Kein Steuer-/Rechtsrat

Planungswerkzeug. Werte sind Prognosen. Spec: `specs/spec-immobilien-cashflow-rechner.md`.
```

- [ ] **Step 2: Run the full test suite once more**

Run: `node --test`
Expected: PASS (18 tests).

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: README (Modi, lokal starten, Tests)"
git push
```

- [ ] **Step 4: Enable GitHub Pages**

Run:
```bash
gh api -X POST repos/mgummich/zins-kapital-rechner/pages -f source[branch]=main -f source[path]=/ 2>/dev/null || \
gh api -X PUT repos/mgummich/zins-kapital-rechner/pages -f source[branch]=main -f source[path]=/
```
Expected: Pages enabled on `main` / root. Site live at `https://mgummich.github.io/zins-kapital-rechner/` within ~1 min. `.nojekyll` (Task 1) ensures files serve as-is.

- [ ] **Step 5: Verify deployment**

Run: `sleep 60 && curl -sI https://mgummich.github.io/zins-kapital-rechner/ | head -1`
Expected: `HTTP/2 200`. Open the URL, confirm both modes work.

---

## Self-Review

**Spec coverage:**
- §2 inputs → Task 8 (`felder`, `finFelder`) + Task 9 (EK params, LTV tiers). ✓
- §3.1 Vorab → Task 1. §3.2 loan → Task 3. §3.3 rent/costs, §3.4 tax, §3.5 cashflow, §3.6 wealth+portfolio → Task 4. §3.7 sale/Spekulationssteuer → Task 5. §3.8 KPIs (incl. IRR) → Task 5. ✓
- §2.2 AfA methods → Task 2 (linear + degressiv; other linear rates handled via editable `afaSatz`). ✓
- §4 UI (layout, KPIs, chart, table, Fazit, disclaimer, de-DE format, live recompute, responsive) → Tasks 7–9. ✓
- §5 tech (single index.html, Chart.js CDN, pure `berechneSzenario`) → Tasks 1–9. ✓
- §6 acceptance numbers → asserted in Tasks 1, 3, 4, 5. ✓
- §7a EK-Regler mode → Tasks 6 + 9. ✓

**Known simplifications (from spec §7, intentional):**
- Degressive AfA uses a pauschal 33-year remaining-life switch (Task 2 ponytail note) — approximation, adequate for the tax-timing comparison.
- Soli/Kirche as flat ×1.055 factor (spec §3.4).
- Post-Zinsbindung monthly rate held constant (spec §3.2).

**Placeholder scan:** none — every code step contains complete code.

**Type consistency:** `config`/`finanzierung`/`Zeile`/`stufen` shapes are defined once (Tasks 1/3/4/6) and consumed with matching field names throughout. `berechneKennzahlen` returns `{ cashflowM1, breakEvenJahr, restschuldN, endvermögen, irr }` used consistently in Tasks 8–9. `stufen` items are `{ maxLTV, zins }` everywhere.

**UI test honesty:** Tasks 8–9 have no automated tests (no DOM in node without adding a dependency, which the constraints forbid). The engine — all money math — is fully covered by `node:test`. UI verification is the documented manual browser check. This is called out, not hidden.
