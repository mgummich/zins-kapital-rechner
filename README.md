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
