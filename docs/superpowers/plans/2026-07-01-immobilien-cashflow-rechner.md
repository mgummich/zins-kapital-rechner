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

test('berechneDarlehen: hoher Anschlusszins → keine negative Amortisation (Re-Annuisierung)', () => {
  const d = berechneDarlehen({ ...finB, zinsbindung: 5, anschlusszins: 0.12 }, 333210, 15);
  // trotz 12% Anschlusszins muss die Restschuld weiter fallen, nie wachsen
  for (let i = 1; i < d.restschuld.length; i++) {
    assert.ok(d.restschuld[i] <= d.restschuld[i - 1] + 1e-6, `Jahr ${i + 1}: Restschuld steigt`);
  }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (7 tests total).

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (12 tests total).

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
  - `berechneKennzahlen(reihe, config, finanzierung) → { cashflowM1, breakEvenJahr, amortisationJahr, restschuldN, immobilienEK_N, endvermögen, terminalNetto, irr }`. `breakEvenJahr` = first year (1-based) with annual `cashflowNachSteuer ≥ 0`; `amortisationJahr` = first year where cumulative `cashflowNachSteuer ≥ 0`; both `null` if never. `terminalNetto` = net liquidation value (used as IRR terminal in BOTH sale/no-sale for comparability). `endvermögen` = realized net if `verkaufAktiv`, else gross book `gesamtvermögen`.
  - `kritischeAltRendite(config, finA, finB) → number | null` — the `altRendite` where `endvermögen_A = endvermögen_B` (bisection over [0, 0.20]); `null` if one scenario dominates across the whole range.

- [ ] **Step 1: Write the failing test**

Append to `test.mjs`:
```js
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
  const r = berechneSzenario({ ...basisConfig, verkaufAktiv: true }, finB);
  const kMitVerkauf = berechneKennzahlen(r, { ...basisConfig, verkaufAktiv: true }, finB);
  const kOhne = berechneKennzahlen(berechneSzenario(basisConfig, finB), basisConfig, finB);
  assert.notEqual(Math.round(kMitVerkauf.endvermögen), Math.round(kOhne.endvermögen));
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

  // Endvermögen: bei Verkauf realisiert (netto), sonst Buchwert-Vermögen (Halten, unrealisiert).
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (17 tests total).

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
  - `berechneEKKurve(config, ekParams) → { ek, endvermögen, irr }[]`. `ekParams = { anfTilgung, zinsbindung, anschlusszins, beleihungswertAbschlag, stufen, ekMin, ekMax, schritt }`. LTV base = `kaufpreis × (1 − beleihungswertAbschlag)` (default 0).

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
  const beleihungswert = config.kaufpreis * (1 - (ekParams.beleihungswertAbschlag || 0));
  const punkte = [];
  for (let ek = ekParams.ekMin; ek <= ekParams.ekMax + 1e-6; ek += ekParams.schritt) {
    const darlehen = Math.max(0, anschaffungskosten - ek);
    const ltv = beleihungswert > 0 ? darlehen / beleihungswert : 0; // Basis Beleihungswert (F6)
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
Expected: PASS (19 tests total).

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
Expected: PASS (21 tests total). Note: `Intl` de-DE uses a non-breaking space before `€`/`%`; if an assertion fails on the space character, copy the actual output into the expected string.

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
import { berechneSzenario, berechneKennzahlen, berechneEKKurve, berechneVorab, kritischeAltRendite } from './calc.js';
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
    ['sollzinsUnterdeckung', 'Sollzins bei Unterdeckung (%)', 9.0, { pct: true }],
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
    sollzinsUnterdeckung: pct('sollzinsUnterdeckung'),
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

  const kr = kritischeAltRendite(config, leseFinanzierung('A'), leseFinanzierung('B'));
  document.getElementById('kpis').innerHTML = [
    ['Cashflow/Monat J1 A', formatEUR(kA.cashflowM1)], ['Cashflow/Monat J1 B', formatEUR(kB.cashflowM1)],
    ['Endvermögen A ★', formatEUR(kA.endvermögen)], ['Endvermögen B ★', formatEUR(kB.endvermögen)],
    ['EK-Rendite A (ergänzend)', formatPct(kA.irr)], ['EK-Rendite B (ergänzend)', formatPct(kB.irr)],
    ['Kritische Alternativrendite (A↔B)', kr === null ? '—' : formatPct(kr)],
  ].map(([t, v]) => `<div class="kpi">${t}<b>${v}</b></div>`).join('');

  const diff = kB.endvermögen - kA.endvermögen;
  const sieger = diff >= 0 ? 'B' : 'A';
  const krText = kr === null ? '' : ` Umschlagpunkt bei ${formatPct(kr)} Alternativrendite.`;
  document.getElementById('fazit').textContent =
    `Szenario ${sieger} baut nach ${config.jahre} Jahren ${formatEUR(Math.abs(diff))} mehr Vermögen auf (Primärmetrik Endvermögen).${krText}`;

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
    ['ek_beleihungswertAbschlag', 'Beleihungswert-Abschlag (%)', 10],
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
    beleihungswertAbschlag: num('ek_beleihungswertAbschlag') / 100,
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
  const beleihungswert = config.kaufpreis * (1 - params.beleihungswertAbschlag); // F6
  const ltv = beleihungswert > 0 ? darlehen / beleihungswert : 0;
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
Expected: PASS (21 tests).

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
- Finanz-Review v1.3: Unterdeckungszins (F1) → Task 4; kritische Alternativrendite (F2) → Task 5 + 8; Netto-Terminal/IRR-Vergleichbarkeit (F3) → Task 5; Re-Annuisierung (F4) → Task 3; Endvermögen-Primärmetrik + IRR-Caveat (F5) → Tasks 5/8; Beleihungswert-LTV (F6) → Tasks 6/9; Break-even vs. Amortisation (F7) → Task 5. ✓

**Known simplifications (from spec §7, intentional):**
- Degressive AfA uses a pauschal 33-year remaining-life switch (Task 2 ponytail note) — approximation, adequate for the tax-timing comparison.
- Soli/Kirche as flat ×1.055 factor (spec §3.4).
- Post-Zinsbindung monthly rate held constant (spec §3.2).

**Placeholder scan:** none — every code step contains complete code.

**Type consistency:** `config`/`finanzierung`/`Zeile`/`stufen` shapes are defined once (Tasks 1/3/4/6) and consumed with matching field names throughout. `berechneKennzahlen` returns `{ cashflowM1, breakEvenJahr, restschuldN, endvermögen, irr }` used consistently in Tasks 8–9. `stufen` items are `{ maxLTV, zins }` everywhere.

**UI test honesty:** Tasks 8–9 have no automated tests (no DOM in node without adding a dependency, which the constraints forbid). The engine — all money math — is fully covered by `node:test`. UI verification is the documented manual browser check. This is called out, not hidden.

---

# v1.4 Extension: Verständlichkeit, Design & Visualisierung

> Implements spec v1.4 §4.3–4.5. Builds on the shipped app (branch off current `main`). Tasks 11, 12, 14 are UI (manual browser check + screenshot; no unit tests per the standing constraint). Task 13 is an engine change (TDD, extends the suite to 22 tests). Base each task on the CURRENT `app.js`/`index.html`/`calc.js` on `main`, not the original Task 8/9 code.

## Global Constraints (v1.4)

- Leitprinzip: eine Person OHNE Immobilien-/Steuervorwissen muss jedes Feld allein korrekt ausfüllen und das Ergebnis in eigenen Worten erklären können.
- Jedes Eingabefeld (alle in `felder`, `finFelder`, die Select-Felder, die EK-Modus-Felder und die LTV-Stufen) bekommt einen laienverständlichen Hilfetext. Kein Feld ohne Erklärung.
- Fachbegriffe in Hilfetexten sofort in Klammern erklären. Ton: Alltagssprache, Beispiel/Richtwert nennen.
- de-DE Format bleibt; Prozentfelder werden als Prozent eingegeben (nicht Dezimal) — Hilfetexte dürfen das nicht widersprechen.
- Kein Build-Schritt, keine neue Runtime-Dependency. Chart.js (bereits via CDN mit SRI) darf für neue Diagrammtypen genutzt werden.
- calc.js bleibt PUR (kein DOM/Intl).

---

### Task 11: Feld-Hilfetexte + Glossar + Klartext-Ergebnis

**Files:**
- Modify: `app.js`
- Modify: `index.html` (add `#klartext` element and `#glossar` panel)

**Interfaces:**
- Consumes: existing `felder`, `finFelder`, `renderAB`, `renderEK`, `leseConfig`.
- Produces: a `hilfe` map (field id → plain-language string), a `hilfeHtml(id)` helper, a `glossar` array rendered into `#glossarInhalt`, and a plain-language sentence written to `#klartext` in both render modes.

- [ ] **Step 1: Add the `hilfe` map to `app.js`** (top level, after the imports)

```js
// Laienverständliche Hilfetexte je Feld-Id (spec §4.3). Kein Feld ohne Erklärung.
const hilfe = {
  kaufpreis: 'Reiner Kaufpreis der Immobilie ohne Nebenkosten. Steht im Kaufvertrag oder Exposé. Beispiel: 300.000 €.',
  grundstücksanteil: 'Anteil des Preises, der auf Grund und Boden entfällt (nicht abschreibbar) — Rest ist das Gebäude. In Städten oft 30–45 %, auf dem Land weniger. Unsicher? 25 % lassen.',
  grEStSatz: 'Grunderwerbsteuer — zahlst du einmalig beim Kauf ans Finanzamt. Je Bundesland 3,5 % (Bayern/Sachsen) bis 6,5 % (u. a. NRW). Berlin/Hessen 6 %.',
  notarSatz: 'Notar und Grundbucheintrag beim Kauf, üblich rund 1,5 % vom Kaufpreis.',
  maklerSatz: 'Maklerprovision, dein Käuferanteil. Häufig 3,57 %. Ohne Makler: 0.',
  afaMethode: 'Abschreibungsmethode. „linear" = jedes Jahr gleich viel (Standard). „degressiv" = am Anfang mehr (nur für bestimmte Neubauten). Im Zweifel: linear.',
  afaSatz: 'AfA = Abschreibung: den Gebäudewert darfst du jährlich steuerlich abziehen, obwohl du nichts zahlst. Altbau ab 1925: 2 %. Vor 1925: 2,5 %. Neubau ab 2023: 3 %.',
  kaltmieteMonat: 'Monatliche Netto-Kaltmiete (ohne Neben-/Betriebskosten). Aus dem Mietvertrag oder Angebot.',
  mietsteigerung: 'Wie stark die Miete jährlich steigt (Schätzung). Vorsichtig etwa 1,5 %.',
  leerstand: 'Anteil der Miete, der durch Leerstand oder Mietausfall wegfällt. Vorsichtig etwa 2 %.',
  verwaltung: 'Kosten für die Hausverwaltung pro Jahr, die du nicht auf Mieter umlegen kannst (z. B. WEG-Verwalter). Grob 300 €.',
  instandhaltung: 'Tatsächliche Reparaturen/Instandhaltung pro Jahr — sofort steuerlich absetzbar. Faustregel ~1 €/m²/Monat.',
  ruecklageZufuehrung: 'Einzahlung in die Erhaltungsrücklage der Eigentümergemeinschaft. Geld fließt ab, ist aber erst absetzbar, wenn die Gemeinschaft es ausgibt — daher separat. Kein Wert? 0.',
  kostensteigerung: 'Wie stark die laufenden Kosten jährlich steigen. Etwa 1,5 %.',
  grenzsteuersatz: 'Der Anteil, den du auf jeden zusätzlich verdienten Euro an Steuer zahlst (nicht dein Durchschnitt). Anhalt: ~40.000 € Einkommen → ca. 30 %, ~60.000 € → ca. 42 %. Steht im Steuerbescheid.',
  soliKirche: 'Soli und Kirchensteuer grob mitrechnen? Soli zahlen seit 2021 nur noch Topverdiener. Im Zweifel: Nein.',
  jahre: 'Über wie viele Jahre gerechnet wird, z. B. 10, 20 oder 30.',
  wertsteigerung: 'Wie stark die Immobilie pro Jahr im Wert steigt (Annahme). Vorsichtig etwa 2 %.',
  altRendite: 'Was dein nicht ins Objekt gestecktes Geld sonst bringen würde — z. B. breit gestreute ETFs langfristig ~5 % nach Steuer. Dieser Wert entscheidet oft, ob mehr oder weniger Eigenkapital lohnt.',
  sollzinsUnterdeckung: 'Zinssatz, falls dein Puffer aufgebraucht ist und du die monatliche Unterdeckung per Kredit (Dispo/Lombard) decken musst. Realistisch 8–11 %. Verhindert schöngerechnete Ergebnisse.',
  verfügbaresKapital: 'Wie viel Geld du insgesamt hast (fürs Objekt UND zum Anlegen). Basis für den fairen Vergleich; Eigenkapital je Szenario darf nicht höher sein.',
  veräußerungskosten: 'Kosten beim späteren Verkauf: Makler, evtl. Vorfälligkeitsentschädigung an die Bank. Nur relevant bei „Verkauf am Ende = Ja". Sonst 0.',
  verkaufAktiv: 'Soll am Ende des Zeitraums ein Verkauf simuliert werden? (inkl. Steuer bei Verkauf unter 10 Jahren Haltedauer.)',
  eigenkapital: 'Wie viel eigenes Geld du in dieses Szenario steckst. Der Rest wird über einen Kredit finanziert.',
  sollzins: 'Zinssatz, den die Bank fürs Darlehen verlangt. Steht im Finanzierungsangebot.',
  anfTilgung: 'Anfängliche Tilgung — wie viel Prozent des Kredits du im ersten Jahr zurückzahlst. Üblich 2–3 %.',
  zinsbindung: 'Wie viele Jahre der Zinssatz fest gilt (z. B. 10). Danach gilt ein neuer Zins.',
  anschlusszins: 'Geschätzter Zinssatz nach Ablauf der Zinsbindung. Unbekannt — vorsichtig etwas höher ansetzen.',
  finanzierungskosten: 'Einmalige Nebenkosten der Finanzierung (z. B. Disagio, Bereitstellungszinsen). Meist 0.',
  ek_anfTilgung: 'Anfängliche Tilgung — wie viel Prozent des Kredits du im ersten Jahr zurückzahlst. Üblich 2–3 %.',
  ek_zinsbindung: 'Wie viele Jahre der Zinssatz fest gilt (z. B. 10).',
  ek_anschlusszins: 'Geschätzter Zinssatz nach der Zinsbindung. Vorsichtig etwas höher ansetzen.',
  ek_beleihungswertAbschlag: 'Banken rechnen nicht mit dem Kaufpreis, sondern einem vorsichtigeren Wert (meist ~10 % niedriger). Dadurch ist der Beleihungsauslauf höher und der Zins etwas teurer. Unsicher? 10 % lassen.',
};

function hilfeHtml(id) {
  return hilfe[id] ? `<small class="hilfe">${hilfe[id]}</small>` : '';
}
```

- [ ] **Step 2: Render the help text under every field**

Replace `feldHtml` and the string-built fields in `app.js` so each carries its help text.

```js
function feldHtml(id, label, def, opt) {
  return `<label>${label}<input id="${id}" type="number" step="any" value="${def}" />${hilfeHtml(id)}</label>`;
}
```

In `baueFelder`, add the help to the three select fields and the A/B financing inputs:

```js
  const soli = `<label>Soli & Kirchensteuer<select id="soliKirche"><option value="0">Nein</option><option value="1">Ja</option></select>${hilfeHtml('soliKirche')}</label>`;
  document.getElementById('grpSteuer').insertAdjacentHTML('beforeend', soli);
  const afaMethode = `<label>AfA-Methode<select id="afaMethode"><option value="linear">linear</option><option value="degressiv">degressiv 5%</option></select>${hilfeHtml('afaMethode')}</label>`;
  document.getElementById('grpAfa').insertAdjacentHTML('afterbegin', afaMethode);
  const verkauf = `<label>Verkauf am Ende<select id="verkaufAktiv"><option value="0">Nein</option><option value="1">Ja</option></select>${hilfeHtml('verkaufAktiv')}</label>`;
  document.getElementById('grpAnnahmen').insertAdjacentHTML('beforeend', verkauf);
  for (const suffix of ['A', 'B']) {
    document.getElementById('grpFin' + suffix).innerHTML = finFelder
      .map(([id, l], i) => `<label>${l}<input id="${id}_${suffix}" type="number" step="any" value="${finDefaults[suffix][i]}" />${hilfeHtml(id)}</label>`)
      .join('');
  }
```

In `baueEKFelder`, add help to the EK-mode fields and a note above the LTV table:

```js
  document.getElementById('grpEK').innerHTML = [
    ['ek_anfTilgung', 'Anf. Tilgung p.a. (%)', 2.0],
    ['ek_zinsbindung', 'Zinsbindung (Jahre)', 10],
    ['ek_anschlusszins', 'Anschlusszins p.a. (%)', 4.0],
    ['ek_beleihungswertAbschlag', 'Beleihungswert-Abschlag (%)', 10],
  ].map(([id, l, d]) => `<label>${l}<input id="${id}" type="number" step="any" value="${d}" />${hilfeHtml(id)}</label>`).join('');
```

Add, right after the `#grpEK` line above, a caption for the LTV table (the `#stufenTabelle` already exists in markup):

```js
  document.querySelector('#stufenTabelle').insertAdjacentHTML('beforebegin',
    '<small class="hilfe">Beleihungsauslauf (LTV) = Kredit ÷ Beleihungswert. Je höher der Kreditanteil, desto höher der Zins. Diese Tabelle bildet die Zins-Staffel deiner Bank ab — Werte anpassen, falls dein Angebot abweicht.</small>');
```

- [ ] **Step 3: Add `#klartext` and `#glossar` to `index.html`**

In `index.html`, immediately AFTER the `<div id="fazit"></div>` line add:
```html
  <p id="klartext"></p>
```
And immediately BEFORE the disclaimer `<p class="disclaimer">` add:
```html
  <details id="glossar">
    <summary>Begriffe einfach erklärt</summary>
    <dl id="glossarInhalt"></dl>
  </details>
```

- [ ] **Step 4: Populate the glossary and the plain-language result in `app.js`**

Add the glossary data and a fill function (call it once during init):

```js
const glossar = [
  ['Cashflow', 'Was am Monatsende real übrig bleibt oder fehlt: Miete minus laufende Kosten, Zins und Tilgung, nach Steuer.'],
  ['Eigenkapital', 'Das eigene Geld, das du einbringst. Der Rest wird über einen Kredit finanziert.'],
  ['Eigenkapitalrendite (IRR)', 'Verzinsung deines eingesetzten Eigenkapitals pro Jahr über die gesamte Laufzeit. Ergänzende Kennzahl — kann durch Hebel hoch aussehen; maßgeblich ist das Endvermögen.'],
  ['Endvermögen', 'Was am Ende des Zeitraums insgesamt übrig ist: Wert der Immobilie minus Restschuld plus dein separat angelegtes Geld. Die wichtigste Vergleichszahl.'],
  ['Restschuld', 'Wie viel vom Kredit nach dem Zeitraum noch offen ist.'],
  ['Werbungskosten', 'Kosten rund um die Vermietung, die du von der Steuer absetzen darfst (Zinsen, Abschreibung, Verwaltung). Tilgung zählt NICHT dazu.'],
  ['Spekulationssteuer', 'Steuer auf den Gewinn, wenn du innerhalb von 10 Jahren verkaufst. Nach 10 Jahren steuerfrei.'],
  ['Kritische Alternativrendite', 'Der Punkt, ab dem sich das Ergebnis dreht: Bringt dein frei angelegtes Geld mehr als diesen Wert, lohnt weniger Eigenkapital; darunter mehr Eigenkapital.'],
  ['Seitenportfolio', 'Das Geld, das du NICHT ins Objekt steckst und stattdessen anlegst. Macht Szenarien mit unterschiedlichem Eigenkapital fair vergleichbar.'],
  ['Beleihungsauslauf (LTV)', 'Wie viel Prozent des Beleihungswerts über Kredit finanziert sind. Höher = teurerer Zins.'],
];

function baueGlossar() {
  document.getElementById('glossarInhalt').innerHTML = glossar
    .map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('');
}
```

At the end of `renderAB` (after the table line), add a plain-language sentence:
```js
  const mehrEK = kA.eigenkapital >= kB.eigenkapital ? 'A' : 'B'; // (see note below)
  const cfBesser = kA.cashflowM1 >= kB.cashflowM1 ? 'A' : 'B';
  document.getElementById('klartext').textContent =
    `In Klartext: Szenario ${cfBesser} belastet dich monatlich weniger, Szenario ${sieger} steht nach ${config.jahre} Jahren mit ${formatEUR(Math.abs(diff))} mehr Vermögen da. ` +
    (kr === null
      ? 'Über alle hier geprüften Alternativrenditen hinweg gewinnt dasselbe Szenario.'
      : `Ab einer Alternativrendite von ${formatPct(kr)} dreht sich das Ergebnis: Bringt dein frei angelegtes Geld mehr, lohnt weniger Eigenkapital.`);
```
Note: `kA`/`kB` don't expose `eigenkapital`; read it directly instead — replace the `mehrEK` line's source by using `leseFinanzierung('A').eigenkapital` if you need it. The snippet above only uses `cfBesser` and `sieger`, so `mehrEK` can be dropped — remove that unused line.

At the end of `renderEK` (after clearing the table), add:
```js
  document.getElementById('klartext').textContent =
    `In Klartext: Bei ${formatEUR(opt.ek)} Eigenkapital ist dein Endvermögen am größten. Weniger Eigenkapital bedeutet mehr Hebel und mehr frei angelegtes Geld, aber eine höhere monatliche Belastung; mehr Eigenkapital senkt die Rate, bindet aber Kapital.`;
```

Call `baueGlossar()` in the init block (next to `baueFelder(); baueEKFelder();`).

- [ ] **Step 5: Verify (manual browser check)**

Run: `node --check app.js` (syntax OK). Start `python3 -m http.server 8000`, open the page.
Expected: every input shows a small help line beneath it; the "Begriffe einfach erklärt" panel expands with all terms; a plain-language sentence appears under the Fazit in both modes; switching modes updates it. Confirm no field is left without help (scan each fieldset). Stop the server.

- [ ] **Step 6: Commit**

```bash
git add app.js index.html
git commit -m "feat: laienverständliche Feld-Hilfetexte, Glossar, Klartext-Ergebnis (spec §4.3)"
```

---

### Task 12: Design-Überarbeitung (schön, klar, responsiv, Dark Mode)

**Files:**
- Modify: `index.html` (`<style>` block; add `inputmode` is done in app.js)
- Modify: `app.js` (numeric inputs get `inputmode="decimal"`; progressive disclosure for advanced fields)

**Interfaces:**
- Consumes: existing markup structure (ids/classes unchanged so app.js keeps working). Adds CSS only + `inputmode` + optional `<details>` grouping. Must NOT rename any element id that app.js reads.

- [ ] **Step 1: Replace the `<style>` block in `index.html`** with a modern, accessible design (CSS variables, light/dark via `prefers-color-scheme`, cards, spacing, responsive). Keep all existing selectors that markup uses (`.grid`, `.kpi`, `.modus`, `#fazit`, `.disclaimer`, `.szenarien`, `.kpis`, `table`) and add `.hilfe`, `#klartext`, `#glossar`.

```html
  <style>
    :root {
      --bg: #f6f7f9; --surface: #ffffff; --text: #1a1d24; --muted: #667085;
      --line: #e4e7ec; --accent: #2563eb; --a: #2563eb; --b: #dc2626;
      --pos: #16a34a; --neg: #dc2626; --radius: 14px; --gap: 16px;
      --shadow: 0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04);
    }
    @media (prefers-color-scheme: dark) {
      :root { --bg:#0f1218; --surface:#171b23; --text:#e6e8ec; --muted:#98a2b3;
        --line:#2a303b; --shadow:0 1px 3px rgba(0,0,0,.4); }
    }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      margin: 0; padding: 24px 16px 64px; max-width: 1120px; margin-inline: auto;
      background: var(--bg); color: var(--text); line-height: 1.5; }
    h1 { font-size: 1.6rem; letter-spacing: -0.02em; margin: 0 0 4px; }
    .untertitel { color: var(--muted); margin: 0 0 20px; }
    fieldset { border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--surface); box-shadow: var(--shadow); margin-bottom: var(--gap);
      padding: 16px; }
    legend { font-weight: 650; padding: 0 6px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--gap); }
    label { display: flex; flex-direction: column; font-size: .85rem; font-weight: 550; gap: 4px; }
    input, select { padding: 9px 10px; font-size: .95rem; border: 1px solid var(--line);
      border-radius: 9px; background: var(--surface); color: var(--text); }
    input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
    .hilfe { font-weight: 400; font-size: .76rem; color: var(--muted); line-height: 1.35; }
    .szenarien { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap); }
    .szenarien h3 { margin: 4px 0 10px; font-size: 1rem; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--gap); margin: var(--gap) 0; }
    .kpi { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px;
      background: var(--surface); box-shadow: var(--shadow); font-size: .8rem; color: var(--muted); }
    .kpi b { display: block; font-size: 1.3rem; color: var(--text); margin-top: 4px; letter-spacing: -0.01em; }
    .kpi.primär { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), var(--shadow); }
    .modus { display: inline-flex; gap: 4px; margin-bottom: var(--gap); background: var(--surface);
      padding: 4px; border-radius: 12px; border: 1px solid var(--line); }
    .modus button { padding: 8px 16px; cursor: pointer; border: 0; background: transparent;
      color: var(--muted); border-radius: 9px; font-size: .9rem; font-weight: 600; }
    .modus button[aria-pressed="true"] { background: var(--accent); color: #fff; }
    #fazit { padding: 16px; border-radius: var(--radius); background: color-mix(in srgb, var(--accent) 8%, var(--surface));
      border: 1px solid color-mix(in srgb, var(--accent) 25%, var(--line)); margin: var(--gap) 0 8px; font-weight: 550; }
    #klartext { color: var(--muted); margin: 0 0 var(--gap); }
    canvas { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
      padding: 12px; box-shadow: var(--shadow); }
    #glossar { margin-top: 28px; border: 1px solid var(--line); border-radius: var(--radius);
      background: var(--surface); padding: 12px 16px; }
    #glossar summary { cursor: pointer; font-weight: 650; }
    #glossar dt { font-weight: 650; margin-top: 10px; }
    #glossar dd { margin: 2px 0 0; color: var(--muted); }
    details.erweitert { grid-column: 1 / -1; }
    details.erweitert > summary { cursor: pointer; color: var(--muted); font-size: .85rem; margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; font-size: .8rem; }
    th, td { border: 1px solid var(--line); padding: 5px 7px; text-align: right; }
    th { background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
    .disclaimer { font-size: .75rem; color: var(--muted); border-top: 1px solid var(--line); margin-top: 28px; padding-top: 14px; }
    @media (max-width: 720px) { .szenarien { grid-template-columns: 1fr; } body { padding: 16px 12px 48px; } }
  </style>
```

- [ ] **Step 2: Add a subtitle in `index.html`** under the `<h1>` for a more finished look:
```html
  <p class="untertitel">Lohnt sich mehr Eigenkapital — oder ein höherer Zins mit Steuervorteil? Vergleich für vermietete Immobilien.</p>
```

- [ ] **Step 3: `inputmode` + mark the primary KPI in `app.js`**

Give numeric inputs a mobile-friendly keypad. In `feldHtml` and the string-built inputs, add `inputmode="decimal"` to every `<input type="number" ...>`. Example for `feldHtml`:
```js
function feldHtml(id, label, def, opt) {
  return `<label>${label}<input id="${id}" type="number" inputmode="decimal" step="any" value="${def}" />${hilfeHtml(id)}</label>`;
}
```
Do the same for the A/B financing inputs, the EK-mode inputs, and the LTV-stufen inputs.

Mark the Endvermögen KPI cards as primary: in both `renderAB` and `renderEK`, when building the KPI HTML, add the class `primär` to the Endvermögen card(s). Simplest: give each KPI entry an optional flag and render `class="kpi${primär ? ' primär' : ''}"`. In `renderAB`:
```js
  const kpiDaten = [
    ['Cashflow/Monat J1 A', formatEUR(kA.cashflowM1)], ['Cashflow/Monat J1 B', formatEUR(kB.cashflowM1)],
    ['Endvermögen A ★', formatEUR(kA.endvermögen), true], ['Endvermögen B ★', formatEUR(kB.endvermögen), true],
    ['EK-Rendite A (ergänzend)', formatPct(kA.irr)], ['EK-Rendite B (ergänzend)', formatPct(kB.irr)],
    ['Kritische Alternativrendite (A↔B)', kr === null ? '—' : formatPct(kr)],
  ];
  document.getElementById('kpis').innerHTML = kpiDaten
    .map(([t, v, p]) => `<div class="kpi${p ? ' primär' : ''}">${t}<b>${v}</b></div>`).join('');
```
Apply the same `[label, value, primär?]` shape + join in `renderEK`, marking the `Endvermögen` card primary.

- [ ] **Step 4: Progressive disclosure for advanced fields in `app.js`**

Wrap rarely-needed fields in a collapsible `<details class="erweitert">` so beginners aren't overwhelmed. Implement for the A/B financing block: split `finFelder` into basic (eigenkapital, sollzins, anfTilgung, zinsbindung) and advanced (anschlusszins, finanzierungskosten), rendering the advanced ones inside a details:
```js
  for (const suffix of ['A', 'B']) {
    const feld = (id, l, i) => `<label>${l}<input id="${id}_${suffix}" type="number" inputmode="decimal" step="any" value="${finDefaults[suffix][i]}" />${hilfeHtml(id)}</label>`;
    const basis = finFelder.slice(0, 4).map(([id, l], i) => feld(id, l, i)).join('');
    const erweitert = finFelder.slice(4).map(([id, l], i) => feld(id, l, i + 4)).join('');
    document.getElementById('grpFin' + suffix).innerHTML =
      basis + `<details class="erweitert"><summary>Erweitert (Anschluss, Finanzierungskosten)</summary><div class="grid">${erweitert}</div></details>`;
  }
```
(Beginners see the four core fields; the rest is one click away, still with help texts.)

- [ ] **Step 5: Verify (manual browser check + screenshot)**

Run: `node --check app.js`. Start the server, open the page in light and dark mode (OS toggle or devtools emulate). Resize to mobile width.
Expected: clean modern layout, cards with subtle shadow, Endvermögen cards visually emphasized, readable in dark mode, single-column and usable on mobile, numeric keypad on mobile inputs, advanced financing fields collapsed by default. Take a screenshot for the record. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add index.html app.js
git commit -m "feat: hochwertiges Design, Dark Mode, Mobile, progressive disclosure (spec §4.4)"
```

---

### Task 13: Engine — `berechneEKKurve` liefert Vermögens-Zusammensetzung

**Files:**
- Modify: `calc.js`
- Modify: `test.mjs`

**Interfaces:**
- Consumes: existing `berechneEKKurve`, `berechneSzenario`, `berechneKennzahlen`.
- Produces: each curve point additionally carries `immobilienEK` and `portfolio` (both at year N), so the UI can draw a stacked composition of the wealth. New point shape: `{ ek, endvermögen, irr, immobilienEK, portfolio }`.

- [ ] **Step 1: Write the failing test** (append to `test.mjs`)

```js
test('berechneEKKurve: Punkte tragen Vermögens-Zusammensetzung', () => {
  const params = { anfTilgung: 0.02, zinsbindung: 10, anschlusszins: 0.04, stufen, ekMin: 0, ekMax: 100000, schritt: 25000 };
  const kurve = berechneEKKurve(basisConfig, params);
  assert.ok(kurve.every((p) => typeof p.immobilienEK === 'number' && typeof p.portfolio === 'number'));
  // ohne Verkauf: Endvermögen = Immobilien-EK + Portfolio (Buchwert-Vermögen)
  for (const p of kurve) {
    assert.ok(Math.abs(p.endvermögen - (p.immobilienEK + p.portfolio)) < 0.01, `Zerlegung bei ek=${p.ek}`);
  }
});
```
(`stufen` and `basisConfig` are already defined earlier in `test.mjs`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `p.immobilienEK` / `p.portfolio` are `undefined`.

- [ ] **Step 3: Implement** — extend the pushed point in `berechneEKKurve` (`calc.js`)

Locate the loop body's `punkte.push({ ek, endvermögen: k.endvermögen, irr: k.irr });` and replace with:
```js
    const letzte = reihe[reihe.length - 1];
    punkte.push({ ek, endvermögen: k.endvermögen, irr: k.irr, immobilienEK: letzte.immobilienEK, portfolio: letzte.portfolio });
```
(The `reihe` variable already exists in that loop from `const reihe = berechneSzenario(config, finanzierung);`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (22 tests total). Note: the `endvermögen = immobilienEK + portfolio` identity holds because `berechneEKKurve` runs scenarios with `verkaufAktiv` from `config`; `basisConfig` has `verkaufAktiv: false`, so `endvermögen = gesamtvermögen_N = immobilienEK_N + portfolio_N`.

- [ ] **Step 5: Commit**

```bash
git add calc.js test.mjs
git commit -m "feat: berechneEKKurve liefert Immobilien-EK + Portfolio je Punkt (Viz)"
```

---

### Task 14: Visualisierung — Balkenvergleich, Umschlagpunkt, Optimum-Marker, gestapelte Zusammensetzung

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `renderAB`, `renderEK`, the new `immobilienEK`/`portfolio` point fields from Task 13, `kritischeAltRendite`. Uses Chart.js (already loaded).
- Produces: richer charts — consistent A/B colors, a second canvas for the A/B Endvermögen bar comparison, an Umschlagpunkt annotation on the wealth line, and in EK mode an optimum marker plus a stacked-area composition (Immobilien-EK vs. Seitenportfolio) when the Endvermögen metric is shown.

- [ ] **Step 1: Add a second canvas for the bar comparison in `index.html`**

Immediately AFTER the existing `<canvas id="chart" height="120"></canvas>` add:
```html
  <canvas id="chartBalken" height="90"></canvas>
```

- [ ] **Step 2: Generalise the chart helper in `app.js`** to manage two charts and accept a type/options.

Replace the current single-chart helper:
```js
const charts = {};
function zeichneChartEl(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}
```
(Remove the old `let chart; function zeichneChart(...)`. Update its two call sites below.)

- [ ] **Step 3: `renderAB` — consistent colors, Umschlagpunkt marker, bar comparison**

Replace the wealth-line render (the old `zeichneChart(labels, [...])` call) and add the bar chart. Fixed scenario colors: A = `#2563eb`, B = `#dc2626`.
```js
  const labels = rA.map((z) => 'J' + z.jahr);
  const annA = { label: 'Vermögen A', data: rA.map((z) => z.gesamtvermögen), borderColor: '#2563eb', backgroundColor: '#2563eb22', tension: .15 };
  const annB = { label: 'Vermögen B', data: rB.map((z) => z.gesamtvermögen), borderColor: '#dc2626', backgroundColor: '#dc262622', tension: .15 };
  zeichneChartEl('chart', {
    type: 'line', data: { labels, datasets: [annA, annB] },
    options: { responsive: true, plugins: { title: { display: true,
      text: kr === null ? 'Vermögensverlauf A vs. B' : `Vermögensverlauf A vs. B — Umschlagpunkt bei ${formatPct(kr)} Alternativrendite` } },
      scales: { y: { title: { display: true, text: 'Vermögen (€)' } }, x: { title: { display: true, text: 'Jahr' } } } },
  });
  // Balkenvergleich Endvermögen A vs. B, Gewinner farbig
  zeichneChartEl('chartBalken', {
    type: 'bar',
    data: { labels: ['Endvermögen A', 'Endvermögen B'],
      datasets: [{ label: 'Endvermögen (€)', data: [kA.endvermögen, kB.endvermögen], backgroundColor: ['#2563eb', '#dc2626'] }] },
    options: { responsive: true, plugins: { legend: { display: false }, title: { display: true, text: 'Endvermögen im Vergleich' } },
      scales: { y: { title: { display: true, text: '€' } } } },
  });
```
(The "Umschlagpunkt" is conveyed in the title — no annotation plugin dependency added, per the no-new-dependency constraint.)

- [ ] **Step 4: `renderEK` — optimum marker + stacked composition**

Replace the EK line render. When the metric is `endvermögen`, draw a stacked area of `immobilienEK` + `portfolio` (so the user sees what the wealth is made of) plus a point dataset marking the optimum; when `irr`, keep a single line. Hide the second bar canvas in EK mode.
```js
  document.getElementById('chartBalken').style.display = 'none'; // Balken nur im A/B-Modus
  const labels = kurve.map((p) => formatEUR(p.ek));
  if (metrik === 'irr') {
    zeichneChartEl('chart', {
      type: 'line', data: { labels, datasets: [{ label: 'EK-Rendite p.a. (%)', data: kurve.map((p) => p.irr * 100), borderColor: '#2563eb', tension: .15 }] },
      options: { responsive: true, plugins: { title: { display: true, text: 'EK-Rendite je Eigenkapital' } },
        scales: { y: { title: { display: true, text: '% p.a.' } }, x: { title: { display: true, text: 'Eigenkapital' } } } },
    });
  } else {
    const optIdx = kurve.indexOf(opt);
    zeichneChartEl('chart', {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Immobilien-Eigenkapital', data: kurve.map((p) => p.immobilienEK), borderColor: '#2563eb', backgroundColor: '#2563eb33', fill: true, stack: 's', tension: .1 },
        { label: 'Seitenportfolio', data: kurve.map((p) => p.portfolio), borderColor: '#16a34a', backgroundColor: '#16a34a33', fill: true, stack: 's', tension: .1 },
        { label: 'Optimum', data: kurve.map((p, i) => (i === optIdx ? p.endvermögen : null)), borderColor: '#f59e0b', backgroundColor: '#f59e0b', pointRadius: 6, showLine: false },
      ] },
      options: { responsive: true, plugins: { title: { display: true, text: `Endvermögen je Eigenkapital — Optimum bei ${formatEUR(opt.ek)}` } },
        scales: { y: { stacked: true, title: { display: true, text: 'Vermögen (€)' } }, x: { title: { display: true, text: 'Eigenkapital' } } } },
    });
  }
```
When switching back to A/B, `renderAB` must re-show the bar canvas — add at the top of `renderAB`:
```js
  document.getElementById('chartBalken').style.display = '';
```

- [ ] **Step 5: Verify (manual browser check + screenshots)**

Run: `node --check app.js`. Start server, open page.
Expected (A/B): wealth line with axis titles + a title naming the Umschlagpunkt; a bar chart comparing Endvermögen A vs B with A blue / B red. (EK-Optimum, Endvermögen metric): stacked area of Immobilien-EK (blue) + Seitenportfolio (green) over the EK axis, an orange optimum dot at the max; switching the Y-axis dropdown to IRR shows a single line and no bars. Colors for A/B are consistent everywhere. Screenshot both modes. Stop server.

- [ ] **Step 6: Commit**

```bash
git add index.html app.js
git commit -m "feat: Visualisierung — Balkenvergleich, Umschlagpunkt, EK-Optimum-Marker + Zusammensetzung (spec §4.4)"
```

---

## v1.4 Extension — Self-Review

**Spec coverage:** §4.3 field help (Task 11 `hilfe` covers every id in `felder`/`finFelder`/selects/EK-fields), glossary + Klartext (Task 11), progressive disclosure (Task 12 Step 4). §4.4 design/dark/mobile (Task 12), visualization — wealth line + Umschlagpunkt + bar + EK optimum marker + stacked composition (Tasks 13–14). §4.5 acceptance = the manual browser checks in Tasks 11/12/14.

**Placeholder scan:** none — help texts and code are complete. One explicit self-correction noted in Task 11 Step 4 (drop the unused `mehrEK` line).

**Type consistency:** Task 13 adds `immobilienEK`/`portfolio` to the curve point; Task 14 consumes exactly those names. KPI render switches to a `[label, value, primär?]` tuple consistently in both modes. Chart helper renamed `zeichneChartEl(id, config)` with both call sites updated.

**UI test honesty:** Tasks 11, 12, 14 are UI — verified by manual browser check + screenshots (documented constraint). Only Task 13 (engine) adds an automated test (→ 22 total).
