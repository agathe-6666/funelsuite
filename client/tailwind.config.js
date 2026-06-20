/** @type {import('tailwindcss').Config} */
// Charte graphique FUNEL suite (§8) — couleurs nommées.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nuit: '#1700ab',     // bleu nuit — principal (jauges, barres)
        or: '#FDC751',       // or / soleil — accent (alertes, seuils atteints)
        poudre: '#dceefd',   // bleu poudré — fonds de cartes
        creme: '#F2F1EB',    // crème — fond de page
      },
      fontFamily: {
        titre: ['"Tenor Sans"', 'Georgia', 'serif'],
        corps: ['"Clear Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        carte: '0 1px 3px rgba(23,0,171,0.08), 0 1px 2px rgba(23,0,171,0.04)',
      },
    },
  },
  plugins: [],
};
