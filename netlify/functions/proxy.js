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
  // lotteria-nazionale.com: numeri separati da punto centrale (·)
  // Formato testo: "Concorso 55/26 · 1 · 7 · 13 · ... · 86 · Numero Oro: 81 ..."
  // Date nel formato: "Sabato 4 aprile 2026" oppure link con data
  const results = [];
  const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};

  const testo = stripHtml(html) + ' FINE_ARCHIVIO';

  // Split per "Concorso NNN/YY" — ogni blocco è una estrazione
  const blocchi = testo.split(/(?=Concorso\s+\d+\/\d{2,4})/i);

  for (const blocco of blocchi) {
    // Cerca data nel blocco precedente o nel testo circostante
    let data = null;
    const dataITA = blocco.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (dataITA) {
      data = dataITA[3]+'-'+mesi[dataITA[2].toLowerCase()]+'-'+dataITA[1].padStart(2,'0');
    }
    const dataDMY = blocco.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!data && dataDMY) data = dataDMY[3]+'-'+dataDMY[2]+'-'+dataDMY[1];
    if (!data) continue;
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;

    // Estrae numeri dalla sequenza separata da ·
    const segmenti = blocco.split(/\u00b7|\·/);
    const nums = segmenti
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 1 && n <= 90);
    const unici = [...new Set(nums)];

    if (unici.length >= 20) {
      const oroM = blocco.match(/[Nn]umero\s+[Oo]ro[^0-9]*(\d+)/);
      results.push({ data, numeri: unici.slice(0,20), oro: oroM ? parseInt(oroM[1]) : null, extra: [] });
    }
  }

  return results;
}

function parseMillionDay(html) {
  // Parser per milliondaylotto.it/archivio/{anno}
  // Date dai link href="/estrazioni/DD-MM-YYYY", numeri nei tag <li>
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
      results.push({ data, numeri: unici.slice(0, 5), extra: [], orario: '20:30' });
    }
  }
  return results;
}

function parseLotto(html, ruota) {
  // lotteria-nazionale.com: numeri separati da · per ogni ruota
  // Formato: "Genova · 35 · 77 · 61 · 40 · 86"
  const results = [];
  const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};

  const testo = stripHtml(html) + ' FINE_ARCHIVIO';
  const blocchi = testo.split(/(?=Concorso\s+\d+\/\d{2,4})/i);

  for (const blocco of blocchi) {
    let data = null;
    const dataITA = blocco.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (dataITA) {
      data = dataITA[3]+'-'+mesi[dataITA[2].toLowerCase()]+'-'+dataITA[1].padStart(2,'0');
    }
    const dataDMY = blocco.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!data && dataDMY) data = dataDMY[3]+'-'+dataDMY[2]+'-'+dataDMY[1];
    if (!data) continue;
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;

    // Cerca la ruota e prende i 5 numeri successivi separati da ·
    const re = new RegExp(ruota + '\\s*(?:·\\s*)(\\d+)\\s*·\\s*(\\d+)\\s*·\\s*(\\d+)\\s*·\\s*(\\d+)\\s*·\\s*(\\d+)', 'i');
    const m = blocco.match(re);
    if (m) {
      const numeri = [m[1],m[2],m[3],m[4],m[5]].map(n=>parseInt(n)).filter(n=>n>=1&&n<=90);
      if (numeri.length === 5) results.push({ data, numeri });
    }
  }

  // Fallback: cerca con spazi invece di ·
  if (results.length === 0) {
    const blocchi2 = testo.split(/(?=(?:Lunedì|Martedì|Mercoledì|Giovedì|Venerdì|Sabato|Domenica)\s+\d+)/i);
    for (const blocco of blocchi2) {
      const dataITA = blocco.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
      if (!dataITA) continue;
      const data = dataITA[3]+'-'+mesi[dataITA[2].toLowerCase()]+'-'+dataITA[1].padStart(2,'0');
      if (new Date(data+'T12:00:00').getDay() !== 6) continue;
      const re = new RegExp(ruota+'[^0-9]*(\\d+)[^0-9]+(\\d+)[^0-9]+(\\d+)[^0-9]+(\\d+)[^0-9]+(\\d+)', 'i');
      const m = blocco.match(re);
      if (m) {
        const numeri = [m[1],m[2],m[3],m[4],m[5]].map(n=>parseInt(n)).filter(n=>n>=1&&n<=90);
        if (numeri.length === 5) results.push({ data, numeri });
      }
    }
  }

  return results;
}

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
  const anno  = params.anno  || new Date().getFullYear();
  const ruota = params.ruota || 'Genova';

  const urlMap = {
    '10elotto':   'https://www.lotteria-nazionale.com/10elotto/estrazioni/archivio-' + anno,
    'millionday': 'https://milliondaylotto.it/archivio/' + anno,
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
        debugHtml: parsed.length === 0 ? stripHtml(html).slice(0, 1500) : undefined
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
