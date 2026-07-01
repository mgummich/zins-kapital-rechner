# Spec: Immobilien-Cashflow-Vergleichsrechner (Kapitalanlage)

**Version:** 1.3
**Zweck:** Ein interaktiver Rechner, der für dieselbe vermietete Immobilie zwei Finanzierungsvarianten gegenüberstellt (z. B. „mehr Eigenkapital, niedriger Zins" vs. „weniger Eigenkapital, höherer Zins") und über einen frei wählbaren Zeitraum den vollständigen Cashflow nach Steuern, die Vermögensentwicklung und die Eigenkapitalrendite berechnet. Kernfrage: **Lohnt sich höheres Eigenkapital, oder ist ein etwas höherer Zins wegen Steuervorteil + freiem Kapital am Ende besser?**

**Zielgruppe der Ausgabe:** Privatanleger:innen in Deutschland mit vermieteter Kapitalanlage-Immobilie.

> **Wichtiger Hinweis für die Umsetzung:** Der Rechner ist ein Planungswerkzeug, keine Steuer- oder Rechtsberatung. Dieser Disclaimer muss sichtbar im UI stehen.

---

## 1. Überblick der Funktionalität

Der Nutzer gibt einmalig die Objekt-, Miet-, Kosten- und Steuerdaten ein sowie ein gemeinsames „verfügbares Kapital". Für zwei Finanzierungsszenarien (A und B) gibt er jeweils Eigenkapital, Sollzins, anfängliche Tilgung und Zinsbindung ein. Der Rechner berechnet Jahr für Jahr für beide Szenarien parallel:

- Mieteinnahmen (mit Steigerung und Leerstand)
- Zins- und Tilgungsanteil (Annuitätendarlehen, monatliche Berechnung)
- AfA (Gebäudeabschreibung)
- steuerliches Ergebnis aus Vermietung und Verpachtung und daraus die Steuerersparnis/-last
- Cashflow vor und nach Steuern
- Restschuld, Immobilienwert, Immobilien-Eigenkapital
- ein „Seitenportfolio" aus nicht gebundenem Kapital, das zur Alternativrendite angelegt wird (macht Szenarien mit unterschiedlichem EK-Einsatz fair vergleichbar)
- optional: Verkauf am Ende inkl. Spekulationssteuer

Ausgabe: KPI-Karten, ein Verlaufs-Chart (kumuliertes Vermögen beider Szenarien), eine Jahres-Tabelle und ein Fazit-Banner, welches Szenario mehr Vermögen aufbaut bzw. den besseren Cashflow liefert.

---

## 2. Eingabefelder

### 2.1 Objekt & Kauf (gemeinsam)

| Feld | Typ | Default | Hinweis |
|---|---|---|---|
| Kaufpreis | € | 300.000 | reiner Kaufpreis der Immobilie |
| Grundstücksanteil | % | 25 | nicht abschreibbar; Rest = Gebäudeanteil. **Regionsabhängig:** ländlich ~15–25 %, Städte 30–45 %. Maßgeblich ist die reale Kaufpreisaufteilung (notariell/BMF-Arbeitshilfe „Kaufpreisaufteilung", oft mit FA strittig). Zu niedriger Wert → überhöhte AfA-Basis → überschätzter Steuervorteil |
| Grunderwerbsteuer | % | 6,0 | je Bundesland 3,5–6,5 % |
| Notar & Grundbuch | % | 1,5 | vom Kaufpreis |
| Maklerprovision | % | 3,57 | Käuferanteil, 0 wenn ohne Makler |

Abgeleitet: `Kaufnebenkosten = Kaufpreis × (GrESt% + Notar% + Makler%)`, `Anschaffungskosten_gesamt = Kaufpreis + Kaufnebenkosten`.

### 2.2 AfA (Abschreibung, gemeinsam)

| Feld | Typ | Default | Hinweis |
|---|---|---|---|
| AfA-Methode | Auswahl | linear 2 % | Optionen unten |
| AfA-Satz (bei linear) | % | 2,0 | wählbar |

AfA-Methoden-Optionen (als Dropdown):
- **linear 2 %** — Standard für Gebäude, Fertigstellung ab 1925 (§ 7 Abs. 4 EStG)
- **linear 2,5 %** — Gebäude vor 1925
- **linear 3 %** — Neubau mit Fertigstellung/Bauantrag ab 2023
- **degressiv 5 %** — Wohn-Neubau, Baubeginn/Kauf im Zeitfenster 10/2023–09/2029; 5 % vom jeweiligen Restbuchwert, mit optionalem Wechsel zu linear wenn günstiger
- **individuell** — Nutzer gibt eigenen Satz ein

### 2.3 Miete & Einnahmen (gemeinsam)

| Feld | Typ | Default | Hinweis |
|---|---|---|---|
| Kaltmiete pro Monat | € | 1.000 | Netto-Kaltmiete |
| Mietsteigerung p.a. | % | 1,5 | jährliche Steigerung |
| Leerstandsquote | % | 2 | Anteil ausfallender Miete |

### 2.4 Laufende Kosten (nicht umlagefähig, gemeinsam)

| Feld | Typ | Default | Hinweis |
|---|---|---|---|
| Nicht umlagefähige Verwaltung p.a. | € | 300 | z. B. WEG-Verwaltervergütung; sofort abziehbare Werbungskosten |
| Instandhaltung / Erhaltungsaufwand p.a. (sofort absetzbar) | € | 1.200 | tatsächliche Reparaturen / laufende Instandhaltung → sofort abziehbare Werbungskosten. **Achtung anschaffungsnahe Herstellungskosten (§ 6 Abs. 1 Nr. 1a EStG):** übersteigen Instandsetzungen in den ersten 3 Jahren nach Kauf 15 % der Gebäude-Anschaffungskosten (netto), sind sie zu aktivieren und nur über AfA absetzbar — dann nicht hier eintragen |
| Zuführung Erhaltungsrücklage p.a. | € | 0 | Einzahlung in die WEG-Erhaltungsrücklage: liquiditätswirksamer Abfluss, aber **erst bei tatsächlicher Verausgabung durch die WEG als Werbungskosten absetzbar** (BFH IX R 19/21; Rücklage ist seit WEG-Reform 2020 Vermögen der GdWE) → hier **nicht** als Werbungskosten, nur im Cashflow |
| Kostensteigerung p.a. | % | 1,5 | optional, wächst mit den Jahren; gilt für Verwaltung, Instandhaltung und Rücklage |

### 2.5 Steuer (gemeinsam)

| Feld | Typ | Default | Hinweis |
|---|---|---|---|
| Persönlicher Grenzsteuersatz | % | 42 | Spitzensteuersatz einsetzbar |
| Soli & Kirchensteuer berücksichtigen | Ja/Nein | Nein | grober Aufschlag ×1,055. **Soli seit 2021 für ~90 % abgeschafft** (greift erst nahe Spitzensteuersatz); Kirchensteuer (8–9 %) ist zudem als Sonderausgabe abziehbar. Nur Daumenwert — im Zweifel aus lassen |

### 2.6 Annahmen & Zeitraum (gemeinsam)

| Feld | Typ | Default | Hinweis |
|---|---|---|---|
| Betrachtungszeitraum | Jahre | 20 | z. B. 10 / 20 / 30 |
| Wertsteigerung Immobilie p.a. | % | 2,0 | für Vermögensberechnung |
| Alternativrendite (netto) | % | 5,0 | Rendite des nicht gebundenen Kapitals nach Steuer |
| Sollzins bei Unterdeckung | % | 9,0 | Zins auf ein **negatives** Seitenportfolio (Dispo/Lombard). Verhindert, dass laufende Unterdeckung fälschlich zur Anlagerendite „finanziert" wird — sonst systematische Verzerrung zugunsten hohen Hebels |
| Verfügbares Kapital gesamt | € | 100.000 | Basis für den fairen Vergleich; EK pro Szenario ≤ dieser Wert |
| Verkauf am Ende simulieren | Ja/Nein | Nein | inkl. Spekulationssteuer |
| Veräußerungskosten bei Verkauf | € | 0 | Makler, Vorfälligkeitsentschädigung (bei Verkauf während der Zinsbindung real teuer), Notar/Löschung — mindern Nettoerlös **und** steuerpflichtigen Veräußerungsgewinn |

### 2.7 Finanzierung (pro Szenario A und B)

| Feld | Typ | Default A | Default B | Hinweis |
|---|---|---|---|---|
| Eigenkapital | € | 100.000 | 40.000 | fließt in Darlehen ein |
| Sollzins p.a. | % | 3,5 | 3,9 | Nominalzins |
| Anfängliche Tilgung p.a. | % | 2,0 | 2,0 | für die Annuität |
| Zinsbindung | Jahre | 10 | 10 | danach Anschlussfinanzierung |
| Anschlusszins p.a. | % | 4,0 | 4,0 | Zins nach Zinsbindung |
| Jährliche Sondertilgung | € | 0 | 0 | optional |
| Finanzierungskosten (einmalig) | € | 0 | 0 | Disagio/Damnum, Bereitstellungszinsen, Schätz-/Grundschuldkosten → im Jahr 1 sofort abziehbare Werbungskosten |

Abgeleitet: `Darlehen = Anschaffungskosten_gesamt − Eigenkapital` (wenn negativ → 0 und Warnung).

---

## 3. Rechenlogik

Alle Beträge in Euro, Zinssätze als Dezimalzahl (z. B. 3,5 % → 0,035). Die Kern-Schleife läuft pro Jahr `t = 1 … N`; das Darlehen wird monatlich abgerechnet (genauer als jährlich).

### 3.1 Vorab (einmalig, gemeinsam)

```
gebäudeanteil        = 1 − grundstücksanteil
kaufnebenkosten      = kaufpreis × (grEStSatz + notarSatz + maklerSatz)
anschaffungskosten   = kaufpreis + kaufnebenkosten
afaBasis             = anschaffungskosten × gebäudeanteil
afaJahr_linear       = afaBasis × afaSatz            // konstant bei linearer AfA
```

Bei **degressiver AfA (5 %)**: `afa_t = afaSatz × restbuchwert_{t-1}`, wobei `restbuchwert_0 = afaBasis`. Sobald `afaJahr_linear_verbleibend > afa_t`, auf lineare AfA des Restbuchwerts umstellen (Standard-Wahlrecht). Kumulierte AfA für die Spekulationssteuer mitführen.

### 3.2 Darlehen: monatliche Annuitätsberechnung (pro Szenario)

```
monatsrate     = darlehen × (sollzins + anfTilgung) / 12
restschuld     = darlehen

// Re-Annuisierung beim Anschluss: zu Beginn des Jahres t == zinsbindung+1 wird die
// Rate neu aus der Restschuld und dem Anschlusszins bestimmt (reale Anschlussfinanzierung).
// Verhindert negative Amortisation bei hohem Anschlusszins + fixer Rate.
wenn t == zinsbindung + 1:
    monatsrate = restschuld × (anschlusszins + anfTilgung) / 12

für jeden Monat m im Jahr t:
    zinsMonat     = restschuld × (aktuellerZins / 12)
    tilgungMonat  = monatsrate − zinsMonat
    restschuld    = restschuld − tilgungMonat
    zinsJahr     += zinsMonat
    tilgungJahr  += tilgungMonat

// am Jahresende optionale Sondertilgung:
restschuld   = max(restschuld − sondertilgung, 0)
tilgungJahr += min(sondertilgung, restschuld_vor_sondertilgung)
```

`aktuellerZins = sollzins` solange `t ≤ zinsbindung`, danach `= anschlusszins`. Beim Anschluss (`t = zinsbindung+1`) wird die Rate **einmal neu annuisiert** (Restschuld × (anschlusszins + anfTilgung)); danach bleibt sie bis Laufzeitende konstant. Das entspricht einer realen Anschlussfinanzierung mit unveränderter Anfangstilgung und verhindert negative Amortisation. Als Vereinfachung dokumentieren, dass Anfangstilgung und Restlaufzeit-Konditionen frei gewählt werden könnten. Wird die Restschuld 0, enden Zins und Tilgung.

### 3.3 Miete & Kosten pro Jahr

```
kaltmieteJahr_t         = kaltmieteMonat × 12 × (1 + mietsteigerung)^(t−1)
mietNetto_t             = kaltmieteJahr_t × (1 − leerstand)
steigerung              = (1 + kostensteigerung)^(t−1)
// absetzbare Bewirtschaftung (Werbungskosten): Verwaltung + tatsächliche Instandhaltung
bewirtschaftungAbzieh_t = (verwaltung + instandhaltung) × steigerung
// zusätzlicher, NICHT absetzbarer Liquiditätsabfluss: Zuführung Erhaltungsrücklage
ruecklage_t             = ruecklageZufuehrung × steigerung
```

> Trennung wichtig (§ 3.4/§ 3.5): `bewirtschaftungAbzieh_t` geht in die Werbungskosten, `ruecklage_t` **nur** in den Cashflow. Die Rücklagen-Zuführung ist erst bei tatsächlicher Verausgabung durch die WEG absetzbar (BFH IX R 19/21) — diese spätere Verausgabung bildet der Rechner bewusst nicht ab (Vereinfachung, § 7).

### 3.4 Steuerliche Betrachtung (Einkünfte aus V&V)

Wichtig: **Tilgung ist nicht absetzbar** (Rückzahlung), **AfA ist absetzbar aber nicht liquiditätswirksam**.

```
finKostenAbzieh_t  = (t == 1) ? finanzierungskosten : 0     // Disagio etc. sofort in Jahr 1
werbungskosten_t   = zinsJahr_t + afa_t + bewirtschaftungAbzieh_t + finKostenAbzieh_t
steuerErgebnis_t   = mietNetto_t − werbungskosten_t
steuerEffekt_t     = − steuerErgebnis_t × grenzsteuersatz_eff
```

- **Rücklagen-Zuführung `ruecklage_t` ist hier NICHT enthalten** (nicht absetzbar bei Einzahlung).
- `grenzsteuersatz_eff = grenzsteuersatz × 1,055` wenn Soli/Kirche aktiviert (grober Daumenwert; Soli seit 2021 meist entfallen, Kirchensteuer als Sonderausgabe abziehbar), sonst `= grenzsteuersatz`.
- `steuerErgebnis_t` negativ (Verlust) → `steuerEffekt_t` positiv = **Steuererstattung**.
- `steuerErgebnis_t` positiv → `steuerEffekt_t` negativ = **Steuerzahlung**.
- Annahme (dokumentieren): Verluste sind mit anderen Einkünften verrechenbar (Regelfall bei Vermietung).

### 3.5 Cashflow pro Jahr

```
kapitaldienst_t     = zinsJahr_t + tilgungJahr_t          // + sondertilgung
// Liquiditätswirksam: absetzbare Bewirtschaftung + Rücklagen-Zuführung + einmalige Finanzierungskosten
liquiKosten_t       = bewirtschaftungAbzieh_t + ruecklage_t + finKostenAbzieh_t
cashflowVorSteuer_t = mietNetto_t − liquiKosten_t − kapitaldienst_t
cashflowNachSteuer_t= cashflowVorSteuer_t + steuerEffekt_t
```

### 3.6 Vermögensentwicklung pro Jahr

```
immobilienwert_t     = kaufpreis × (1 + wertsteigerung)^t
immobilienEK_t       = immobilienwert_t − restschuld_t
```

**Seitenportfolio** (macht die Szenarien fair vergleichbar): Das beim Kauf nicht eingesetzte Kapital plus laufende Cashflow-Überschüsse werden zur Alternativrendite angelegt; negative Cashflows werden aus dem Portfolio gedeckt.

```
freiesKapital_start = verfügbaresKapital − eigenkapital     // ggf. 0
portfolio_0         = freiesKapital_start
für t = 1 … N:
    // positives Portfolio wächst mit altRendite; negatives (Unterdeckung)
    // wird zum teureren sollzinsUnterdeckung fortgeschrieben
    satz_t      = (portfolio_{t−1} ≥ 0) ? altRendite : sollzinsUnterdeckung
    portfolio_t = portfolio_{t−1} × (1 + satz_t) + cashflowNachSteuer_t
gesamtvermögen_t    = immobilienEK_t + portfolio_t
```

> Hinweis: Setzt der Nutzer in beiden Szenarien dasselbe Eigenkapital, ist `freiesKapital_start` gleich und der Vergleich läuft rein über Cashflow und Entschuldung. Setzt er unterschiedliches EK, bildet das Seitenportfolio den Opportunitätsvorteil des freieren Kapitals ab.

### 3.7 Optionaler Verkauf am Ende (Jahr N)

```
wenn verkaufAktiv:
    verkaufspreis   = immobilienwert_N
    wenn N < 10:                                            // Spekulationsfrist §23 EStG
        // Veräußerungskosten mindern den steuerpflichtigen Gewinn
        veräußerungsgewinn = verkaufspreis − (anschaffungskosten − afaKumuliert_N) − veräußerungskosten
        spekusteuer        = max(veräußerungsgewinn, 0) × grenzsteuersatz_eff
    sonst:                                                  // > 10 Jahre → steuerfrei
        spekusteuer        = 0
    nettoVerkaufserlös = verkaufspreis − restschuld_N − spekusteuer − veräußerungskosten
    endvermögen        = portfolio_N + nettoVerkaufserlös
sonst:
    endvermögen        = gesamtvermögen_N
```

Beachte: Die kumulierte AfA mindert die Anschaffungskosten-Basis und **erhöht** damit den steuerpflichtigen Veräußerungsgewinn innerhalb der 10-Jahres-Frist.

### 3.8 Kennzahlen (pro Szenario)

- **Cashflow nach Steuer, Jahr 1** (monatlich): `cashflowNachSteuer_1 / 12`
- **Break-even Cashflow-Jahr:** erstes `t` mit `cashflowNachSteuer_t ≥ 0` (Jahr, ab dem der laufende Cashflow positiv wird — **nicht** Amortisation des Eigenkapitals).
- **Amortisations-Jahr (kumulativ):** erstes `t` mit `Σ_{i≤t} cashflowNachSteuer_i ≥ 0` (kumulierte Überschüsse gleichen kumulierte Unterdeckungen aus); `null`, falls im Zeitraum nicht erreicht.
- **Restschuld nach N Jahren:** `restschuld_N`
- **Immobilien-Eigenkapital nach N Jahren:** `immobilienEK_N` (Buchwert, unrealisiert — vor Verkaufskosten/latenter Steuer).
- **Endvermögen nach N Jahren:** `endvermögen` — **Primärmetrik** für den Szenariovergleich (hält das verfügbare Kapital konstant, bildet Steuervorteil, Entschuldung, Wertzuwachs und Alternativanlage in einer Zahl ab).
- **Netto-Liquidationswert bei Verkauf in N:** `terminalNetto = immobilienEK_N − veräußerungskosten − latenteSpekusteuer`, mit `latenteSpekusteuer = (N < 10) ? max(immobilienwert_N − (anschaffungskosten − afaKumuliert_N) − veräußerungskosten, 0) × grenzsteuersatz_eff : 0`. Zeigt, was nach Realisierung bliebe.
- **Eigenkapitalrendite p.a. (IRR):** interner Zinsfuß der Zahlungsreihe
  `[−eigenkapital, cashflowNachSteuer_1, …, cashflowNachSteuer_{N−1}, cashflowNachSteuer_N + T]`,
  wobei `T = nettoVerkaufserlös` (wenn Verkauf aktiv) bzw. `T = portfolio-neutraler terminalNetto` (wenn kein Verkauf → fiktive **Netto**-Liquidation, damit beide IRR-Varianten vergleichbar sind). Per Bisektion lösen.
  **Caveat:** Bei mehrfachem Vorzeichenwechsel der Cashflows ist der IRR nicht eindeutig; zudem ignoriert er, dass Unterdeckungen aus dem Portfolio finanziert werden. Deshalb ist **Endvermögen die maßgebliche Zielgröße**, IRR nur ergänzend.
- **Kritische Alternativrendite (A↔B):** die Alternativrendite, bei der `endvermögen_A = endvermögen_B`. Per Bisektion über `altRendite ∈ [0, 0.20]` lösen (beide Szenarien mit derselben Variation neu rechnen). Ergebnis: „Unterhalb X % gewinnt Szenario mit mehr EK, oberhalb das mit weniger EK." Kein Vorzeichenwechsel im Intervall → `null` (ein Szenario dominiert durchgängig). **Kernzahl der Entscheidung.**

---

## 4. Ausgabe / UI

### 4.1 Layout

1. **Eingabe-Bereich** oben, in aufklappbaren Gruppen: *Objekt & Kauf*, *AfA*, *Miete*, *Kosten*, *Steuer*, *Annahmen*. Darunter zwei Spalten *Finanzierung A* / *Finanzierung B*.
2. **KPI-Karten** (Grid, für A und B nebeneinander): Cashflow/Monat Jahr 1, Break-even Cashflow-Jahr, Amortisations-Jahr, Restschuld nach N Jahren, **Endvermögen nach N Jahren** (hervorgehoben als Primärmetrik), EK-Rendite p.a. (mit dezentem Hinweis „ergänzend"). Zusätzlich **eine gemeinsame Karte „Kritische Alternativrendite (A↔B)"**.
3. **Verlaufs-Chart** (Liniendiagramm): Gesamtvermögen A vs. B über die Jahre; optional umschaltbar auf „kumulierter Cashflow" und „Restschuld".
4. **Jahres-Tabelle** (aufklappbar): pro Jahr Spalten Miete netto, Zins, Tilgung, AfA, Steuer-Effekt, Cashflow n. St., Restschuld, Vermögen — je Szenario umschaltbar oder als zwei Tabellen.
5. **Fazit-Banner:** vergleicht `endvermögen` (primär) und den Cashflow; nennt die Differenz in € und den Treiber (Steuervorteil, Alternativrendite, Zinsdifferenz) sowie die kritische Alternativrendite („ab X % kippt das Ergebnis").
6. **Disclaimer** unten: keine Steuer-/Rechtsberatung; Zinsen nur bei Vermietung absetzbar; Werte sind Prognosen.

### 4.2 Formatierung & Verhalten

- Zahlen im `de-DE`-Format, Euro ohne Nachkommastellen (`Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0})`), Prozent mit einer Nachkommastelle.
- Live-Neuberechnung bei jeder Eingabeänderung (Debounce ~150 ms).
- Eingabevalidierung: keine negativen Werte außer bei Cashflow-Ergebnissen; EK > Anschaffungskosten → Hinweis; Grenzsteuersatz 0–45 %.
- Tooltips/Infotexte an erklärungsbedürftigen Feldern: Grenzsteuersatz, AfA-Methode, Alternativrendite, verfügbares Kapital, Spekulationsfrist.
- Sinnvolle Defaults (siehe Tabellen), damit direkt beim Öffnen ein plausibles Ergebnis erscheint.
- Barrierefreiheit: Labels mit `for`/`id`, ausreichender Kontrast, Chart mit Text-Alternative (Tabelle).
- Responsiv: zwei Spalten auf Desktop, gestapelt auf Mobile.

---

## 5. Technische Umsetzung (Empfehlung)

Da das Format offen ist, empfehle ich für maximale Verbreitbarkeit **eine einzelne, in sich geschlossene `index.html`** — kein Build-Schritt, überall einbettbar (eigene Website, `<iframe>`, WordPress-Custom-HTML-Block, GitHub Pages).

- **Struktur:** eine HTML-Datei mit `<style>`, dem Markup und einem `<script>`.
- **Charts:** Chart.js via CDN (`<script src="https://cdn.jsdelivr.net/npm/chart.js">`). Alternativ reines Canvas/SVG ohne Abhängigkeit.
- **State:** ein einziges Config-Objekt; eine reine Funktion `berechneSzenario(config, finanzierung) → jahresreihe[]`, zweimal aufgerufen (A/B). Keine globalen Seiteneffekte in der Rechenfunktion → leicht testbar.
- **Kein Framework nötig.** Wer React bevorzugt: dieselbe `berechneSzenario`-Funktion in einen Hook packen, Inputs als kontrollierte Felder, Recharts statt Chart.js. Die Rechenlogik bleibt identisch.
- **Persistenz (optional):** Eingaben in der URL als Query-Parameter kodieren → teilbare Links; oder Export als PDF/Druckansicht via `window.print()`.

### 5.1 Empfohlene Funktionssignaturen

```
berechneVorab(config) → { afaBasis, anschaffungskosten, gebäudeanteil, ... }
berechneDarlehenJahr(state, finanzierung, jahr) → { zinsJahr, tilgungJahr, restschuldEnde }
berechneSzenario(config, finanzierung) → Array<{
    jahr, mietNetto, bewirtschaftungAbzieh, ruecklage, zins, tilgung, afa,
    steuerErgebnis, steuerEffekt, cashflowVorSteuer, cashflowNachSteuer,
    restschuld, immobilienwert, immobilienEK, portfolio, gesamtvermögen
}>
// bewirtschaftungAbzieh = absetzbar (Werbungskosten); ruecklage = nicht absetzbar, nur Cashflow
berechneKennzahlen(reihe, config, finanzierung) → { cashflowM1, breakEvenJahr, amortisationJahr, restschuldN, immobilienEK_N, endvermögen, terminalNetto, irr }
kritischeAltRendite(config, finA, finB) → number | null   // altRendite mit endvermögen_A = endvermögen_B (Bisektion 0…20%)
formatEUR(n), formatPct(n)
```

---

## 6. Testfälle zum Validieren (Jahr 1)

Mit diesen Eingaben muss der Rechner näherungsweise (monatliche Zinsberechnung → kleine Abweichungen) folgende Werte liefern. Nutze das als Abnahmekriterium.

**Gemeinsame Annahmen:** Kaufpreis 300.000; Grundstücksanteil 20 % (in diesem Abnahmefall bewusst 20 %, nicht der neue Default 25 %); GrESt 6 %; Notar 1,5 %; Makler 3,57 %; AfA linear 2 %; Kaltmiete 1.000 €/Monat; Leerstand 2 %; Verwaltung 300 + Instandhaltung 1.200 (beide absetzbar); **Zuführung Erhaltungsrücklage 0; Finanzierungskosten 0; Veräußerungskosten 0**; Grenzsteuersatz 42 % (ohne Soli). Mit diesen Nullwerten bleiben die unten genannten Zahlen unverändert gültig. `sollzinsUnterdeckung`, Re-Annuisierung und `beleihungswertAbschlag` betreffen nur spätere Jahre bzw. den EK-Modus und ändern die hier geprüften **Jahr-1**-Werte nicht.

Abgeleitet:
- Kaufnebenkosten = 300.000 × 11,07 % = **33.210 €**
- Anschaffungskosten = **333.210 €**
- AfA-Basis = 333.210 × 0,8 = 266.568 €; **AfA/Jahr ≈ 5.331 €**
- Miete netto Jahr 1 = 12.000 × 0,98 = **11.760 €**
- Bewirtschaftung = **1.500 €**

**Szenario B** (EK 40.000; Zins 3,9 %; Tilgung 2 %):
- Darlehen = 333.210 − 40.000 = **293.210 €**
- Annuität = 293.210 × 5,9 % ≈ 17.299 €/Jahr
- Zins Jahr 1 ≈ **11.400 €** (monatlich gerechnet etwas unter 293.210 × 3,9 %)
- Tilgung Jahr 1 ≈ **5.900 €**
- Werbungskosten ≈ 11.400 + 5.331 + 1.500 = **18.231 €**
- Steuerl. Ergebnis ≈ 11.760 − 18.231 = **−6.471 €** → Steuererstattung ≈ **2.718 €**
- Cashflow vor Steuer ≈ 11.760 − 1.500 − 17.299 = **−7.039 €**
- **Cashflow nach Steuer ≈ −4.321 €/Jahr ≈ −360 €/Monat**

**Szenario A** (EK 100.000; Zins 3,5 %; Tilgung 2 %):
- Darlehen = **233.210 €**; Annuität = 233.210 × 5,5 % ≈ 12.827 €/Jahr
- Zins Jahr 1 ≈ **8.100 €**; Tilgung ≈ **4.700 €**
- Werbungskosten ≈ 8.100 + 5.331 + 1.500 = **14.931 €**
- Steuerl. Ergebnis ≈ 11.760 − 14.931 = **−3.171 €** → Erstattung ≈ **1.332 €**
- Cashflow vor Steuer ≈ 11.760 − 1.500 − 12.827 = **−2.567 €**
- **Cashflow nach Steuer ≈ −1.235 €/Jahr ≈ −103 €/Monat**

Erwartetes qualitatives Ergebnis: Szenario A hat den besseren laufenden Cashflow (weniger Zinslast), Szenario B nutzt den Steuervorteil stärker und hält 60.000 € Kapital frei. Welches am Ende mehr Vermögen aufbaut, hängt an der **Alternativrendite**: Übersteigt sie den effektiven Nachsteuerzins von B (`3,9 % × (1 − 0,42) ≈ 2,26 %`), zieht B über die Jahre im Gesamtvermögen an A vorbei. Genau dieser Umschlagpunkt ist der Kern des Rechners und sollte im Testlauf sichtbar werden, wenn man die Alternativrendite variiert.

---

## 7. Bewusste Vereinfachungen (im UI transparent machen)

- Zinsberechnung monatlich, aber ohne unterjährige Mietsteigerung (jährliche Schritte).
- Beim Anschluss wird die Rate einmal neu annuisiert (Restschuld × (anschlusszins + anfTilgung)) und bleibt danach konstant; eine reale Anschlussfinanzierung kann Tilgung/Laufzeit anders wählen. Diese Annahme verhindert negative Amortisation bei hohem Anschlusszins.
- Unterdeckung (negatives Seitenportfolio) wird mit `sollzinsUnterdeckung` fortgeschrieben; reale Finanzierungskosten einer Liquiditätslücke können abweichen. Ohne diese Trennung würde das Modell hohen Hebel systematisch bevorteilen.
- **IRR nicht eindeutig** bei mehrfachem Vorzeichenwechsel; er ignoriert die Finanzierung von Unterdeckungen. Endvermögen ist die maßgebliche Zielgröße, IRR nur ergänzend.
- LTV im EK-Modus wird auf den Beleihungswert (Kaufpreis − Abschlag) bezogen; der reale Beleihungswert je Bank kann abweichen.
- Erhaltungsaufwand/Modernisierung, Sonder-AfA (z. B. § 7b, Denkmal § 7h/7i) und Einbauten sind nicht abgebildet — als optionale Erweiterung vorsehen.
- Steuerlicher Verlust wird voll mit anderen Einkünften verrechnet (Regelfall, aber nicht garantiert).
- Kirchensteuer/Soli nur als grober Aufschlag (Soli seit 2021 meist entfallen; Kirchensteuer als Sonderausgabe nicht abgebildet).
- **Erhaltungsrücklage-Zuführung** wird als nicht absetzbarer Cashflow geführt; die spätere absetzbare Verausgabung durch die WEG bildet der Rechner nicht ab (konservativ). Anschaffungsnahe Herstellungskosten (§ 6 Abs. 1 Nr. 1a EStG) werden nicht automatisch erkannt — nur als Hinweis am Eingabefeld.
- **Finanzierungskosten** (Disagio, Bereitstellungszinsen) werden vereinfacht komplett im Jahr 1 abgesetzt; ein Disagio ist real ggf. über die Zinsbindung zu verteilen.
- **Kaufpreisaufteilung** Grund/Gebäude wird als fester Prozentsatz eingegeben; die reale, mit dem Finanzamt abgestimmte Aufteilung kann abweichen und ändert die AfA-Basis spürbar.
- Keine Inflationsbereinigung der Endwerte (nominal gerechnet); optionale reale Darstellung möglich.

---

## 7a. Zusatzmodus: EK-Regler (Eigenkapital-Optimum)

Zweite Ansicht **auf derselben `berechneSzenario`-Engine**. Statt zwei diskreter Szenarien A/B: **ein** Objekt, Eigenkapital über einen Regler variabel, Ergebnis als Kurve über der EK-Achse. Beantwortet „wieviel Eigenkapital ist optimal?" statt nur „A oder B?".

### 7a.1 Umschaltung

- Modus-Toggle oben: **„A vs. B"** (Abschnitte 2–6) und **„EK-Optimum"**.
- Alle gemeinsamen Inputs (Objekt, AfA, Miete, Kosten, Steuer, Annahmen inkl. **Alternativrendite** und **verfügbarem Kapital**) gelten in beiden Modi unverändert.

### 7a.2 Eingaben (nur EK-Modus)

Statt des A/B-Finanzierungsblocks (2.7):

| Feld | Typ | Default | Hinweis |
|---|---|---|---|
| Anfängliche Tilgung p.a. | % | 2,0 | für die Annuität |
| Zinsbindung | Jahre | 10 | wie 2.7 |
| Anschlusszins p.a. | % | 4,0 | wie 2.7 |
| Beleihungswert-Abschlag | % | 10 | Banken bemessen den LTV am Beleihungswert (≈ Kaufpreis − Abschlag), nicht am Kaufpreis → reale LTV höher, Zinsstufe schlechter. 0 = LTV auf Kaufpreis |
| EK-Regler | € | — | 0 … verfügbares Kapital; Schrittweite z. B. 5.000 € |
| **LTV→Zins-Stufen** | Tabelle | s. u. | editierbar; Nutzer-Stufen |

**Sollzins wird nicht eingegeben** — er ergibt sich je EK aus dem Beleihungsauslauf (LTV) über die Stufen-Tabelle. Default-Stufen (editierbar):

| Beleihungsauslauf LTV | Sollzins p.a. |
|---|---|
| ≤ 60 % | 3,4 % |
| ≤ 80 % | 3,6 % |
| ≤ 90 % | 3,9 % |
| > 90 % | 4,3 % |

```
beleihungswert = kaufpreis × (1 − beleihungswertAbschlag)
LTV       = darlehen / beleihungswert     // Nebenkosten nicht beleihbar; Basis = Beleihungswert
sollzins  = erste Stufe mit LTV ≤ stufe.maxLTV   // sonst höchste Stufe
```

### 7a.3 Berechnung

Für jeden EK-Stützpunkt `ek` im Reglerbereich:
```
darlehen  = anschaffungskosten − ek        // wie 2.7; < 0 → 0
sollzins  = stufe(darlehen / kaufpreis)
finanzierung = { eigenkapital: ek, sollzins, anfTilgung, zinsbindung, anschlusszins, sondertilgung: 0 }
reihe     = berechneSzenario(config, finanzierung)   // identische Engine
kennz     = berechneKennzahlen(reihe, config, finanzierung)
punkt     = { ek, endvermögen: kennz.endvermögen, irr: kennz.irr }
```

Stützpunkte über den ganzen Reglerbereich (Schrittweite z. B. 5.000 €) → Kurve.

### 7a.4 Ausgabe (EK-Modus)

- **Kurve** (Chart.js): X = Eigenkapital. Y **umschaltbar**, Default **Endvermögen nach N Jahren**; Zweit-Toggle **EK-Rendite p.a. (IRR)**.
  - Begründung: Endvermögen hält das verfügbare Kapital konstant und zeigt das echte Optimum (Umschlagpunkt Alternativrendite vs. Nachsteuerzins) als **Maximum** der Kurve. IRR allein trügt — durch den Hebel meist monoton fallend, empfiehlt stumpf minimales EK; daher nur als Sekundärmetrik.
- **Marker** am aktuellen Reglerpunkt + Optimum-Marker (EK mit maximalem Endvermögen).
- **Karte** am Reglerpunkt: Darlehen, LTV, resultierender Sollzins, Endvermögen, IRR, Cashflow/Monat Jahr 1.
- Disclaimer wie A/B-Modus.

### 7a.5 Zusätzliche Funktionssignaturen

```
stufenZins(ltv, stufen[]) → sollzins
berechneEKKurve(config, ekModusParams) → Array<{ ek, endvermögen, irr }>
```

`berechneEKKurve` ruft je Stützpunkt `berechneSzenario` + `berechneKennzahlen` auf — keine neue Rechenlogik, nur Iteration über EK.

---

## 8. Mögliche Erweiterungen (Backlog)

- Drittes Szenario / freie Anzahl.
- Erhaltungsaufwand pro Jahr + größere Modernisierung in Jahr X.
- Sonderabschreibungen (§ 7b, Denkmalschutz).
- Sensitivitäts-Analyse (Slider für Zins, Wertsteigerung, Leerstand → Tornado-Chart).
- Teilbarer Link via URL-Parameter und PDF-Export.
- Vergleich gegen „gar nicht kaufen, alles in ETF" als Referenzlinie.
