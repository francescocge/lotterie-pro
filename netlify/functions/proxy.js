//netlify/functions/proxy.js
// Parser riscritti sul formato HTML reale di lottologia.com

const https = require('https');
const http = require('http');

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Troppi redirect'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache'
      },
      timeout: 12000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(fetchUrl(loc, redirectCount + 1));
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' per ' + url));
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

const MESI = {
  'gennaio':1,'febbraio':2,'marzo':3,'aprile':4,'maggio':5,'giugno':6,
  'luglio':7,'agosto':8,'settembre':9,'ottobre':10,'novembre':11,'dicembre':12
};

function parseDataIta(str) {
  const m = str.toLowerCase().match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/);
  if (!m) return null;
  const mese = MESI[m[2]];
  return mese ? m[3] + '-' + String(mese).padStart(2,'0') + '-' + m[1].padStart(2,'0') : null;
}

// ============================================================
// PARSER 10eLotto
// Formato lottologia: "28 Marzo 2026 ... 01.04.07.13.19.26.29..."
// ============================================================
function parse10eLotto(html) {
  const results = [];
  const testo = stripHtml(html);
  const meseRe = '(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)';
  const blocchi = testo.split(new RegExp('(?=\\d{1,2}\\s+' + meseRe + '\\s+\\d{4})', 'i'));

  for (const blocco of blocchi) {
    const data = parseDataIta(blocco);
    if (!data) continue;

    // Cerca sequenza di almeno 15 numeri separati da punto
    const seqs = blocco.match(/(?:\d{1,2}\.){14,}\d{1,2}/g);
    if (seqs) {
      for (const seq of seqs) {
        const numeri = seq.split('.').map(n => parseInt(n,10)).filter(n => n >= 1 && n <= 90);
        const unici = [...new Set(numeri)];
        if (unici.length >= 15) {
          const oroM = blocco.match(/[Oo]ro[:\s]+0*(\d+)/);
          results.push({ data, numeri: unici.slice(0,20), oro: oroM ? parseInt(oroM[1]) : null, extra: [] });
          break;
        }
      }
    }
  }
  return results;
}

// ============================================================
// PARSER MillionDay
// Formato: "28 Marzo 2026 ... 08.21.34.46.53"
// ============================================================
function parseMillionDay(html) {
  const results = [];
  const testo = stripHtml(html);
  const meseRe = '(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)';
  const blocchi = testo.split(new RegExp('(?=\\d{1,2}\\s+' + meseRe + '\\s+\\d{4})', 'i'));

  for (const blocco of blocchi) {
    const data = parseDataIta(blocco);
    if (!data) continue;
    // 5 numeri separati da punto, range 1-55
    const seqs = blocco.match(/\d{1,2}(?:\.\d{1,2}){4}/g);
    if (seqs) {
      for (const seq of seqs) {
        const numeri = seq.split('.').map(n => parseInt(n,10)).filter(n => n >= 1 && n <= 55);
        const unici = [...new Set(numeri)];
        if (unici.length === 5) {
          const isSera = /20:30|serale|sera/i.test(blocco);
          results.push({ data, numeri: unici, extra: [], orario: isSera ? 'sera' : 'mattina' });
          break;
        }
      }
    }
  }
  return results;
}

// ============================================================
// PARSER Lotto Classico
// Formato: ruota + "06.19.44.67.83" per ogni estrazione
// ============================================================
function parseLotto(html, ruota) {
  const results = [];
  const testo = stripHtml(html);
  const meseRe = '(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)';
  const blocchi = testo.split(new RegExp('(?=\\d{1,2}\\s+' + meseRe + '\\s+\\d{4})', 'i'));

  for (const blocco of blocchi) {
    const data = parseDataIta(blocco);
    if (!data) continue;
    // Cerca nome ruota seguito da 5 numeri punto-separati
    const re = new RegExp(ruota + '[^0-9]*(\\d{1,2}\\.\\d{1,2}\\.\\d{1,2}\\.\\d{1,2}\\.\\d{1,2})', 'i');
    const m = blocco.match(re);
    if (m) {
      const numeri = m[1].split('.').map(n => parseInt(n,10)).filter(n => n >= 1 && n <= 90);
      if (numeri.length === 5) results.push({ data, numeri });
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
    'Cache-Control': 'public, max-age=1800'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const params = event.queryStringParameters || {};
  const tipo  = params.tipo  || '10elotto';
  const anno  = params.anno  || new Date().getFullYear();
  const ruota = params.ruota || 'Genova';

  console.log('[proxy] tipo=' + tipo + ' anno=' + anno + ' ruota=' + ruota);

  const urlMap = {
    '10elotto':   'https://www.lottologia.com/10elotto/archivio/' + anno,
    'millionday': 'https://www.lottologia.com/millionday/archivio/' + anno,
    'lotto':      'https://www.lottologia.com/lotto/archivio/' + anno + '/' + ruota.toLowerCase()
  };

  const url = urlMap[tipo];
  if (!url) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Tipo non valido' }) };

  try {
    const html = await fetchUrl(url);
    console.log('[proxy] HTML: ' + html.length + ' chars');

    let parsed = [];
    if (tipo === '10elotto')   parsed = parse10eLotto(html);
    if (tipo === 'millionday') parsed = parseMillionDay(html);
    if (tipo === 'lotto')      parsed = parseLotto(html, ruota);

    console.log('[proxy] Estratte: ' + parsed.length);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: parsed.length > 0,
        tipo, anno,
        ruota: tipo === 'lotto' ? ruota : undefined,
        count: parsed.length,
        estrazioni: parsed,
        // snippet HTML per debug se parser fallisce
        debugHtml: parsed.length === 0 ? stripHtml(html).slice(0, 800) : undefined
      })
    };
  } catch (err) {
    console.error('[proxy] Errore: ' + err.message);
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ ok: false, error: err.message, tipo, anno })
    };
  }
};
