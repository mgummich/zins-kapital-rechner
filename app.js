import { berechneSzenario, berechneKennzahlen, berechneEKKurve, berechneVorab, kritischeAltRendite, stufenZins } from './calc.js';
import { formatEUR, formatPct } from './format.js';

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
  if (!hilfe[id]) return '';
  const t = hilfe[id].replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<button type="button" class="tip" aria-label="Erklärung: ${t}" data-tip="${t}">i</button>`;
}

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
  return `<label>${label}<input id="${id}" type="number" inputmode="decimal" step="any" value="${def}" />${hilfeHtml(id)}</label>`;
}

function baueFelder() {
  for (const [grp, liste] of Object.entries(felder)) {
    document.getElementById(grp).innerHTML = liste.map(([id, l, d, o]) => feldHtml(id, l, d, o)).join('');
  }
  const soli = `<details class="erweitert"><summary>Erweitert</summary><div class="grid"><label>Soli & Kirchensteuer<select id="soliKirche"><option value="0">Nein</option><option value="1">Ja</option></select>${hilfeHtml('soliKirche')}</label></div></details>`;
  document.getElementById('grpSteuer').insertAdjacentHTML('beforeend', soli);
  const afaMethode = `<label>AfA-Methode<select id="afaMethode"><option value="linear">linear</option><option value="degressiv">degressiv 5%</option></select>${hilfeHtml('afaMethode')}</label>`;
  document.getElementById('grpAfa').insertAdjacentHTML('afterbegin', afaMethode);
  const verkauf = `<details class="erweitert"><summary>Erweiterte Annahmen</summary><div class="grid"><label>Verkauf am Ende<select id="verkaufAktiv"><option value="0">Nein</option><option value="1">Ja</option></select>${hilfeHtml('verkaufAktiv')}</label></div></details>`;
  document.getElementById('grpAnnahmen').insertAdjacentHTML('beforeend', verkauf);
  for (const suffix of ['A', 'B']) {
    const feld = (id, l, i) => `<label>${l}<input id="${id}_${suffix}" type="number" inputmode="decimal" step="any" value="${finDefaults[suffix][i]}" />${hilfeHtml(id)}</label>`;
    const basis = finFelder.slice(0, 4).map(([id, l], i) => feld(id, l, i)).join('');
    const erweitert = finFelder.slice(4).map(([id, l], i) => feld(id, l, i + 4)).join('');
    document.getElementById('grpFin' + suffix).innerHTML =
      basis + `<details class="erweitert"><summary>Erweitert (Anschluss, Finanzierungskosten)</summary><div class="grid">${erweitert}</div></details>`;
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
  ].map(([id, l, d]) => `<label>${l}<input id="${id}" type="number" inputmode="decimal" step="any" value="${d}" />${hilfeHtml(id)}</label>`).join('');

  document.querySelector('#stufenTabelle').insertAdjacentHTML('beforebegin',
    '<small class="hilfe">Beleihungsauslauf (LTV) = Kredit ÷ Beleihungswert. Je höher der Kreditanteil, desto höher der Zins. Diese Tabelle bildet die Zins-Staffel deiner Bank ab — Werte anpassen, falls dein Angebot abweicht.</small>');

  document.querySelector('#stufenTabelle tbody').innerHTML = stufenDefault
    .map((s, i) => `<tr><td><input id="ltv_${i}" type="number" inputmode="decimal" step="any" value="${s.maxLTV === Infinity ? 100 : s.maxLTV * 100}" /></td><td><input id="zins_${i}" type="number" inputmode="decimal" step="any" value="${s.zins}" /></td></tr>`)
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

// ponytail: dark-mode Chart.js defaults set once at init, before first render
const _dark = matchMedia('(prefers-color-scheme: dark)').matches;
Chart.defaults.color = _dark ? '#98a2b3' : '#667085';
Chart.defaults.borderColor = _dark ? '#2a303b' : '#e4e7ec';

const charts = {};
function zeichneChartEl(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

export function renderAB() {
  document.getElementById('chartBalken').style.display = '';
  const config = leseConfig();
  const rA = berechneSzenario(config, leseFinanzierung('A'));
  const rB = berechneSzenario(config, leseFinanzierung('B'));
  const kA = berechneKennzahlen(rA, config, leseFinanzierung('A'));
  const kB = berechneKennzahlen(rB, config, leseFinanzierung('B'));

  const kr = kritischeAltRendite(config, leseFinanzierung('A'), leseFinanzierung('B'));
  const kpiDaten = [
    ['Cashflow/Monat J1 A', formatEUR(kA.cashflowM1)], ['Cashflow/Monat J1 B', formatEUR(kB.cashflowM1)],
    ['Endvermögen A ★', formatEUR(kA.endvermögen), true], ['Endvermögen B ★', formatEUR(kB.endvermögen), true],
    ['EK-Rendite A (ergänzend)', formatPct(kA.irr)], ['EK-Rendite B (ergänzend)', formatPct(kB.irr)],
    ['Kritische Alternativrendite (A↔B)', kr === null ? '—' : formatPct(kr)],
  ];
  document.getElementById('kpis').innerHTML = kpiDaten
    .map(([t, v, p]) => `<div class="kpi${p ? ' primär' : ''}">${t}<b>${v}</b></div>`).join('');

  const diff = kB.endvermögen - kA.endvermögen;
  const sieger = diff >= 0 ? 'B' : 'A';
  const krText = kr === null ? '' : ` Umschlagpunkt bei ${formatPct(kr)} Alternativrendite.`;
  const treiberText = kr !== null ? ' Treiber: Alternativrendite vs. Nachsteuerzins.' : ' Treiber: Zinsdifferenz und Steuervorteil.';
  document.getElementById('fazit').textContent =
    `Szenario ${sieger} baut nach ${config.jahre} Jahren ${formatEUR(Math.abs(diff))} mehr Vermögen auf (Primärmetrik Endvermögen).${krText}${treiberText}`;

  const labels = rA.map((z) => 'J' + z.jahr);
  const annA = { label: 'Vermögen A', data: rA.map((z) => z.gesamtvermögen), borderColor: '#2563eb', backgroundColor: '#2563eb22', tension: .15 };
  const annB = { label: 'Vermögen B', data: rB.map((z) => z.gesamtvermögen), borderColor: '#dc2626', backgroundColor: '#dc262622', tension: .15 };
  zeichneChartEl('chart', {
    type: 'line', data: { labels, datasets: [annA, annB] },
    options: { responsive: true, plugins: { title: { display: true,
      text: kr === null ? 'Vermögensverlauf A vs. B' : `Vermögensverlauf A vs. B — Umschlagpunkt bei ${formatPct(kr)} Alternativrendite` } },
      scales: { y: { title: { display: true, text: 'Vermögen (€)' } }, x: { title: { display: true, text: 'Jahr' } } } },
  });
  // Balkenvergleich Endvermögen A vs. B
  zeichneChartEl('chartBalken', {
    type: 'bar',
    data: { labels: ['Endvermögen A', 'Endvermögen B'],
      datasets: [{ label: 'Endvermögen (€)', data: [kA.endvermögen, kB.endvermögen], backgroundColor: ['#2563eb', '#dc2626'] }] },
    options: { responsive: true, plugins: { legend: { display: false }, title: { display: true, text: 'Endvermögen im Vergleich' } },
      scales: { y: { title: { display: true, text: '€' } } } },
  });

  document.getElementById('tabelle').innerHTML = tabelleHtml(rB);

  const cfBesser = kA.cashflowM1 >= kB.cashflowM1 ? 'A' : 'B';
  document.getElementById('klartext').textContent =
    `In Klartext: Szenario ${cfBesser} belastet dich monatlich weniger, Szenario ${sieger} steht nach ${config.jahre} Jahren mit ${formatEUR(Math.abs(diff))} mehr Vermögen da. ` +
    (kr === null
      ? 'Über alle hier geprüften Alternativrenditen hinweg gewinnt dasselbe Szenario.'
      : `Ab einer Alternativrendite von ${formatPct(kr)} dreht sich das Ergebnis: Bringt dein frei angelegtes Geld mehr, lohnt weniger Eigenkapital.`);
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
  const zins = stufenZins(ltv, params.stufen);
  const fin = { eigenkapital: ekAktuell, sollzins: zins, anfTilgung: params.anfTilgung, zinsbindung: params.zinsbindung, anschlusszins: params.anschlusszins, sondertilgung: 0, finanzierungskosten: 0 };
  const kPunkt = berechneKennzahlen(berechneSzenario(config, fin), config, fin);

  document.getElementById('kpis').innerHTML = [
    ['Darlehen', formatEUR(darlehen)], ['LTV', formatPct(ltv)], ['Sollzins', formatPct(zins)],
    ['Endvermögen', formatEUR(kPunkt.endvermögen), true], ['EK-Rendite', formatPct(kPunkt.irr)],
    ['Cashflow/Monat J1', formatEUR(kPunkt.cashflowM1)],
  ].map(([t, v, p]) => `<div class="kpi${p ? ' primär' : ''}">${t}<b>${v}</b></div>`).join('');

  document.getElementById('fazit').textContent =
    `Optimales Eigenkapital (max. Endvermögen): ${formatEUR(opt.ek)} → ${formatEUR(opt.endvermögen)}.`;

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
      options: { responsive: true, plugins: { title: { display: true, text: config.verkaufAktiv ? `Vermögens-Zusammensetzung (Buchwert) — Optimum bei ${formatEUR(opt.ek)}` : `Endvermögen je Eigenkapital — Optimum bei ${formatEUR(opt.ek)}` } },
        scales: { y: { stacked: true, title: { display: true, text: 'Vermögen (€)' } }, x: { title: { display: true, text: 'Eigenkapital' } } } },
    });
  }
  document.getElementById('tabelle').innerHTML = '';

  document.getElementById('klartext').textContent =
    `In Klartext: Bei ${formatEUR(opt.ek)} Eigenkapital ist dein Endvermögen am größten. Weniger Eigenkapital bedeutet mehr Hebel und mehr frei angelegtes Geld, aber eine höhere monatliche Belastung; mehr Eigenkapital senkt die Rate, bindet aber Kapital.`;
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
baueGlossar();
document.getElementById('form').addEventListener('input', neuBerechnen);
document.getElementById('ekRegler').addEventListener('input', (e) => { if (aktuellerModus === 'EK') { e.stopPropagation(); renderEK(); } });
document.getElementById('modeAB').addEventListener('click', () => setzeModus('AB'));
document.getElementById('modeEK').addEventListener('click', () => setzeModus('EK'));
setzeModus('AB');
