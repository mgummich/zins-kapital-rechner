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

// ponytail: stub until Task 9 implements EK-Optimum mode
function renderEK() {}

let aktuellerModus = 'AB';
baueFelder();
document.getElementById('form').addEventListener('input', neuBerechnen);
renderAB();
