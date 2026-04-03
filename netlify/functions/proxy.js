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

function parse10eLotto(html) {
  const results = [];
  // Aggiunge sentinella finale per non perdere l'ultimo blocco
  const testo = stripHtml(html) + ' FINE_ARCHIVIO';
  const blocchi = testo.split(/(?=(?:Lunedì|Martedì|Mercoledì|Giovedì|Venerdì|Sabato|Domenica)\s+\d+)/i);
  for (const blocco of blocchi) {
    const dataM = blocco.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (!dataM) continue;
    const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};
    const data = dataM[3]+'-'+mesi[dataM[2].toLowerCase()]+'-'+dataM[1].padStart(2,'0');
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;
    const nums = [...blocco.matchAll(/\b([1-9]|[1-8][0-9]|90)\b/g)].map(m=>parseInt(m[0])).filter(n=>n>=1&&n<=90);
    const unici = [...new Set(nums)];
    if (unici.length >= 20) {
      const oroM = blocco.match(/Numero Oro:\s*(\d+)/i);
      results.push({ data, numeri: unici.slice(0,20), oro: oroM ? parseInt(oroM[1]) : null, extra: [] });
    }
  }
  return results;
}

function parseMillionDay(html) {
  // Parser riscritto per milliondaylotto.it/archivio/{anno}
  // Struttura: tabella con righe "31 marzo 2026" e numeri tipo "* 9 * 22 * 26 * 28 * 46"
  const results = [];
  const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};

  // Estrae tutte le righe di data dalla tabella
  // Formato nel testo: "31 marzo 2026 Concorso n. 180 (20:30) * 9 * 22 * 26 * 28 * 46 Concorso n. 179 (13:00) * 4 * 19 * 23 * 30 * 44"
  const testo = stripHtml(html) + ' FINE_ARCHIVIO';

  // Split per ogni data trovata
  const blocchi = testo.split(/(?=\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})/i);

  for (const blocco of blocchi) {
    const dataM = blocco.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (!dataM) continue;
    const data = dataM[3]+'-'+mesi[dataM[2].toLowerCase()]+'-'+dataM[1].padStart(2,'0');

    // Cerca il concorso serale (20:30) — primo concorso del giorno nell'archivio
    // I numeri appaiono come sequenze di 5 numeri tra 1 e 55
    const concorsiM = [...blocco.matchAll(/Concorso\s+n\.\s*\d+\s*\((\d{2}:\d{2})\)\s*((?:\*?\s*\d+\s*){5})/gi)];

    for (const cm of concorsiM) {
      const orario = cm[1]; // es. "20:30"
      const numStr = cm[2];
      const nums = [...numStr.matchAll(/\b(\d+)\b/g)]
        .map(m => parseInt(m[1]))
        .filter(n => n >= 1 && n <= 55);
      const unici = [...new Set(nums)];
      if (unici.length === 5) {
        results.push({ data, numeri: unici, extra: [], orario });
        break; // Prende solo il primo concorso valido per data (sera)
      }
    }

    // Fallback: se il regex concorso non ha trovato nulla, cerca 5 numeri consecutivi
    if (!results.find(r => r.data === data)) {
      const nums = [...blocco.matchAll(/\b([1-9]|[1-4][0-9]|5[0-5])\b/g)]
        .map(m => parseInt(m[0]))
        .filter(n => n >= 1 && n <= 55);
      const unici = [...new Set(nums)];
      if (unici.length >= 5) {
        results.push({ data, numeri: unici.slice(0,5), extra: [], orario: 'sera' });
      }
    }
  }

  return results;
}

function parseLotto(html, ruota) {
  const results = [];
  // Aggiunge sentinella finale per non perdere l'ultimo blocco (fix estrazione più recente)
  const testo = stripHtml(html) + ' FINE_ARCHIVIO';
  const blocchi = testo.split(/(?=(?:Lunedì|Martedì|Mercoledì|Giovedì|Venerdì|Sabato|Domenica)\s+\d+)/i);
  for (const blocco of blocchi) {
    const dataM = blocco.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (!dataM) continue;
    const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};
    const data = dataM[3]+'-'+mesi[dataM[2].toLowerCase()]+'-'+dataM[1].padStart(2,'0');
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;
    const re = new RegExp(ruota+'[^0-9]*(\\d+)[^0-9]+(\\d+)[^0-9]+(\\d+)[^0-9]+(\\d+)[^0-9]+(\\d+)', 'i');
    const m = blocco.match(re);
    if (m) {
      const numeri = [m[1],m[2],m[3],m[4],m[5]].map(n=>parseInt(n)).filter(n=>n>=1&&n<=90);
      if (numeri.length === 5) results.push({ data, numeri });
    }
  }
  return results;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=300'  // abbassato da 1800 a 300 (5 min) per dati freschi
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const params = event.queryStringParameters || {};
  const tipo  = params.tipo  || '10elotto';
  const anno  = params.anno  || new Date().getFullYear();
  const ruota = params.ruota || 'Genova';

  const urlMap = {
    '10elotto':   'https://www.lotteria-nazionale.com/10elotto/estrazioni/archivio-' + anno,
    'millionday': 'https://milliondaylotto.it/archivio/' + anno,  // nuovo URL corretto
    'lotto':      'https://www.lotteria-nazionale.com/lotto/estrazioni/archivio-' + anno
  };

  const url = urlMap[tipo];
  if (!url) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Tipo non valido' }) };

  try {
    const html = await fetchUrl(url);
    let parsed = [];
    if (tipo === '10elotto')   parsed = parse10eLotto(html);
    if (tipo === 'millionday') parsed = parseMillionDay(html);
    if (tipo === 'lotto')      parsed = parseLotto(html, ruota);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: parsed.length > 0,
        tipo, anno,
        count: parsed.length,
        estrazioni: parsed,
        debugHtml: parsed.length === 0 ? stripHtml(html).slice(0, 1000) : undefined
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
