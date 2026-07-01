const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function formatEUR(n) {
  return eur.format(Math.round(n));
}

export function formatPct(n, decimals = 1) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n * 100) + ' %';
}
