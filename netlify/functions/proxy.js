// netlify/functions/proxy.js
// Fonte: estrazionilotto.it per Lotto e 10eLotto, milliondaylotto.it per MillionDay
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
      timeout: 12000
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
// PARSER LOTTO — fonte: estrazionilotto.it/lotto/archivio-storico/YYYY
// Formato HTML: tabella con "Ruota 1° 2° 3° 4° 5°" per ogni estrazione
// Ogni estrazione ha heading "Estrazione Lotto n. NNN" + data "giorno DD mese YYYY"
// ============================================================
function parseLottoAnno(html, ruota) {
  const results = [];
  const testo = stripHtml(html);
  const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',
    luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};

  // Split per ogni estrazione — separata da "Estrazione Lotto n."
  const blocchi = testo.split(/Estrazione Lotto n\.\s*\d+/i);

  for (const blocco of blocchi) {
    // Cerca la data nel formato "sabato 4 aprile 2026" o "martedì 30 dicembre 2025"
    const dataM = blocco.match(/(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (!dataM) continue;
    const data = dataM[3]+'-'+mesi[dataM[2].toLowerCase()]+'-'+dataM[1].padStart(2,'0');
    if (new Date(data+'T12:00:00').getDay() !== 6) continue; // solo sabati

    // Cerca la riga della ruota: "Genova N1 N2 N3 N4 N5"
    const re = new RegExp(ruota + '\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})', 'i');
    const m = blocco.match(re);
    if (m) {
      const numeri = [m[1],m[2],m[3],m[4],m[5]].map(n=>parseInt(n)).filter(n=>n>=1&&n<=90);
      if (numeri.length === 5) {
        results.push({ data, numeri: numeri.sort((a,b)=>a-b) });
      }
    }
  }
  return results;
}

// ============================================================
// PARSER 10eLotto — fonte: estrazionilotto.it/10-e-lotto/archivio-storico/YYYY
// Formato: blocchi con data + 20 numeri separati da spazio
// ============================================================
function parse10eLottoAnno(html) {
  const results = [];
  const testo = stripHtml(html);
  const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',
    luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};

  // Split per ogni estrazione
  const blocchi = testo.split(/Estrazione\s+(?:10\s*e\s*Lotto|10eLotto)\s+n\.\s*\d+/i);

  for (const blocco of blocchi) {
    const dataM = blocco.match(/(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (!dataM) continue;
    const data = dataM[3]+'-'+mesi[dataM[2].toLowerCase()]+'-'+dataM[1].padStart(2,'0');
    if (new Date(data+'T12:00:00').getDay() !== 6) continue; // solo sabati

    // Cerca il numero Oro
    const oroM = blocco.match(/[Nn]umero\s+[Oo]ro[:\s]+(\d{1,2})/);
    const oro = oroM ? parseInt(oroM[1]) : null;

    // Estrae tutti i numeri del blocco (1-90), prende i primi 20 unici
    const nums = [...blocco.matchAll(/\b(\d{1,2})\b/g)]
      .map(m => parseInt(m[1]))
      .filter(n => n >= 1 && n <= 90);
    const unici = [...new Set(nums)];
    if (unici.length >= 20) {
      results.push({ data, numeri: unici.slice(0,20).sort((a,b)=>a-b), oro, extra: [] });
    }
  }
  return results;
}

// ============================================================
// PARSER MillionDay — fonte: milliondaylotto.it/archivio/YYYY
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
      results.push({ data, numeri: unici.slice(0, 5).sort((a,b)=>a-b), extra: [], orario: '20:30' });
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

  // Carica sempre 2 anni: anno richiesto + anno precedente
  const anni = [anno, anno - 1];

  try {
    let parsed = [];

    if (tipo === '10elotto') {
      const htmls = await Promise.all(
        anni.map(a => fetchUrl('https://www.estrazionilotto.it/10-e-lotto/archivio-storico/' + a)
          .catch(() => ''))
      );
      for (const html of htmls) {
        if (html) parsed = parsed.concat(parse10eLottoAnno(html));
      }
      parsed.sort((a,b) => new Date(b.data) - new Date(a.data));

    } else if (tipo === 'millionday') {
      const htmls = await Promise.all(
        anni.map(a => fetchUrl('https://milliondaylotto.it/archivio/' + a)
          .catch(() => ''))
      );
      for (const html of htmls) {
        if (html) parsed = parsed.concat(parseMillionDay(html));
      }
      parsed.sort((a,b) => new Date(b.data) - new Date(a.data));

    } else if (tipo === 'lotto') {
      const htmls = await Promise.all(
        anni.map(a => fetchUrl('https://www.estrazionilotto.it/lotto/archivio-storico/' + a)
          .catch(() => ''))
      );
      for (const html of htmls) {
        if (html) parsed = parsed.concat(parseLottoAnno(html, ruota));
      }
      parsed.sort((a,b) => new Date(b.data) - new Date(a.data));

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
        debugHtml: parsed.length === 0 ? 'Nessun dato trovato' : undefined
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
