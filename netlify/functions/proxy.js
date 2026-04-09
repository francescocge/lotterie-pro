// netlify/functions/proxy.js
const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'it-IT,it;q=0.9',
        'Accept-Encoding': 'identity'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ============================================================
// PARSER LOTTO e 10eLotto — fonte: estrazioninumerilotto.com
// Formato: "56/2026 del 7-4-2026 | 58 | 70 | 12 | 65 | 85"
// ============================================================
function parseRuota(html) {
  // Ritorna mappa { "2026-04-04": [86, 64, 56, 89, 60], ... }
  const testo = stripHtml(html);
  const mappa = {};
  const re = /\d+\/\d{4}\s+del\s+(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})/g;
  let m;
  while ((m = re.exec(testo)) !== null) {
    const data = m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
    const numeri = [m[4],m[5],m[6],m[7],m[8]].map(n => parseInt(n));
    mappa[data] = numeri;
  }
  return mappa;
}

// Slug per ogni ruota su estrazioninumerilotto.com
const RUOTE_SLUG = {
  'bari':      'bari_1',
  'cagliari':  'cagliari_2',
  'firenze':   'firenze_3',
  'genova':    'genova_4',
  'milano':    'milano_5',
  'napoli':    'napoli_6',
  'palermo':   'palermo_7',
  'roma':      'roma_8',
  'torino':    'torino_9',
  'venezia':   'venezia_10'
};

function urlRuota(ruota) {
  const slug = RUOTE_SLUG[ruota.toLowerCase()] || 'genova_4';
  return 'https://www.estrazioninumerilotto.com/estrazioni_numeri_lotto_ruota_' + slug + '.php';
}

// Recupera Lotto per una ruota specifica, filtra solo sabati dell'anno richiesto
async function fetchLotto(ruota, anno) {
  const html = await fetchUrl(urlRuota(ruota));
  const mappa = parseRuota(html);
  return Object.entries(mappa)
    .filter(([data]) => {
      if (!data.startsWith(anno + '')) return false;
      return new Date(data + 'T12:00:00').getDay() === 6;
    })
    .map(([data, numeri]) => ({ data, numeri: numeri.slice().sort((a,b) => a-b) }))
    .sort((a, b) => new Date(b.data) - new Date(a.data));
}

// Recupera 10eLotto: prende tutte le 10 ruote, per ogni sabato
// raccoglie il primo estratto di ogni ruota + aggiunge i successivi
// finché non si arriva a 20 numeri unici (esattamente come funziona il gioco)
async function fetch10eLotto(anno) {
  const ruoteNomi = Object.keys(RUOTE_SLUG);
  const htmls = await Promise.all(ruoteNomi.map(r => fetchUrl(urlRuota(r))));

  // Per ogni ruota costruisce la mappa data -> [5 numeri]
  const tutteRuote = htmls.map(html => parseRuota(html));

  // Raccoglie tutte le date sabato presenti
  const dateSet = new Set();
  for (const mappa of tutteRuote) {
    for (const data of Object.keys(mappa)) {
      if (data.startsWith(anno + '') && new Date(data + 'T12:00:00').getDay() === 6) {
        dateSet.add(data);
      }
    }
  }

  const results = [];
  for (const data of [...dateSet].sort().reverse()) {
    // Per ogni data, prende i numeri di tutte le ruote e li mette in ordine
    // (prima i primi estratti di ogni ruota, poi i secondi, ecc.)
    const pool = [];
    for (let pos = 0; pos < 5; pos++) {
      for (const mappa of tutteRuote) {
        if (mappa[data] && mappa[data][pos] !== undefined) {
          const n = mappa[data][pos];
          if (!pool.includes(n) && n >= 1 && n <= 90) pool.push(n);
        }
      }
      if (pool.length >= 20) break;
    }
    if (pool.length >= 10) {
      // Numero Oro = primo estratto di Bari
      const bariiMappa = tutteRuote[0]; // bari è il primo
      const oro = bariiMappa[data] ? bariiMappa[data][0] : null;
      results.push({ data, numeri: pool.slice(0, 20).sort((a,b) => a-b), oro, extra: [] });
    }
  }

  return results;
}

// ============================================================
// PARSER MillionDay — fonte: milliondaylotto.it
// ============================================================
function parseMillionDay(html) {
  const results = [];
  const righe = html.split(/<tr[\s>]/i);
  for (const riga of righe) {
    const hrefM = riga.match(/\/estrazioni\/(\d{2})-(\d{2})-(\d{4})/);
    if (!hrefM) continue;
    const data = hrefM[3] + '-' + hrefM[2] + '-' + hrefM[1];
    const numeriLi = [...riga.matchAll(/<li[^>]*>\s*(\d{1,2})\s*<\/li>/gi)]
      .map(m => parseInt(m[1]))
      .filter(n => n >= 1 && n <= 55);
    const unici = [...new Set(numeriLi)];
    if (unici.length >= 5) {
      results.push({ data, numeri: unici.slice(0, 5).sort((a,b) => a-b), extra: [], orario: "20:30" });
    }
  }
  return results;
}

// ============================================================
// HANDLER
// ============================================================
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=300'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const params = event.queryStringParameters || {};
  const tipo  = params.tipo  || '10elotto';
  const anno  = parseInt(params.anno  || new Date().getFullYear());
  const ruota = params.ruota || 'Genova';

  try {
    let parsed = [];

    if (tipo === '10elotto') {
      parsed = await fetch10eLotto(anno);

    } else if (tipo === 'millionday') {
      const html = await fetchUrl('https://milliondaylotto.it/archivio/' + anno);
      parsed = parseMillionDay(html);

    } else if (tipo === 'lotto') {
      parsed = await fetchLotto(ruota, anno);

    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Tipo non valido' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: parsed.length > 0,
        tipo, anno,
        count: parsed.length,
        estrazioni: parsed,
        debugHtml: parsed.length === 0 ? 'Nessun dato per anno ' + anno : undefined
      })
    };
  } catch (err) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ ok: false, error: err.message, tipo, anno })
    };
  }
};
