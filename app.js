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
