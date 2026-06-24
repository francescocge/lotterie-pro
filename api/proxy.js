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
// 10eLotto — fonte: estrazionilotto.it
// Struttura reale dopo stripHtml:
//   "Estrazione 10eLotto n. 99 sabato 20 giugno 2026 7 8 17 ... Numero Oro 10eLotto 90 ..."
// ============================================================
function parse10eLottoAnno(html) {
  const results = [];
  const testo = stripHtml(html);

  const mesi = {
    gennaio:'01', febbraio:'02', marzo:'03', aprile:'04',
    maggio:'05', giugno:'06', luglio:'07', agosto:'08',
    settembre:'09', ottobre:'10', novembre:'11', dicembre:'12'
  };

  // Divide per "Estrazione 10eLotto n." (struttura reale del sito)
  const blocchi = testo.split(/Estrazione\s+10eLotto\s+n\.\s*\d+/i);

  for (const blocco of blocchi) {
    // Cerca data: "sabato 20 giugno 2026"
    const dataM = blocco.match(
      /(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i
    );
    if (!dataM) continue;

    const data = dataM[3] + '-' + mesi[dataM[2].toLowerCase()] + '-' + dataM[1].padStart(2, '0');

    // Solo sabati
    if (new Date(data + 'T12:00:00').getDay() !== 6) continue;

    // Numero Oro: primo numero dopo "Numero Oro 10eLotto"
    const oroM = blocco.match(/Numero\s+Oro\s+10eLotto\s+(\d{1,2})/i);
    const oro = oroM ? parseInt(oroM[1]) : null;

    // Prendi tutti i numeri 1-90 nel blocco prima di "Numero Oro"
    const partePrima = oroM
      ? blocco.substring(0, blocco.indexOf('Numero Oro 10eLotto'))
      : blocco;

    const nums = [...partePrima.matchAll(/\b([1-9]|[1-8][0-9]|90)\b/g)]
      .map(m => parseInt(m[1]))
      .filter(n => n >= 1 && n <= 90);

    const unici = [...new Set(nums)];

    if (unici.length >= 20) {
      results.push({
        data,
        numeri: unici.slice(0, 20).sort((a, b) => a - b),
        oro,
        extra: []
      });
    }
  }

  return results;
}

// ============================================================
// MillionDay — fonte: estrazionilotto.it/millionday/archivio-storico
// Struttura reale dopo stripHtml:
//   "Estrazione MillionDay n. XX sabato 20 giugno 2026 13 18 25 42 43 ..."
// ============================================================
function parseMillionDay(html) {
  const results = [];
  const testo = stripHtml(html);

  const mesi = {
    gennaio:'01', febbraio:'02', marzo:'03', aprile:'04',
    maggio:'05', giugno:'06', luglio:'07', agosto:'08',
    settembre:'09', ottobre:'10', novembre:'11', dicembre:'12'
  };

  // Divide per "Estrazione MillionDay n." o "Estrazione MillionDAY n."
  const blocchi = testo.split(/Estrazione\s+MillionD(?:ay|AY)\s+n\.\s*\d+/i);

  for (const blocco of blocchi) {
    const dataM = blocco.match(
      /(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i
    );
    if (!dataM) continue;

    const data = dataM[3] + '-' + mesi[dataM[2].toLowerCase()] + '-' + dataM[1].padStart(2, '0');

    // Solo sabati
    if (new Date(data + 'T12:00:00').getDay() !== 6) continue;

    // Prendi numeri 1-55
    const nums = [...blocco.matchAll(/\b([1-9]|[1-4][0-9]|5[0-5])\b/g)]
      .map(m => parseInt(m[1]))
      .filter(n => n >= 1 && n <= 55);

    const unici = [...new Set(nums)];

    if (unici.length >= 5) {
      results.push({
        data,
        numeri: unici.slice(0, 5).sort((a, b) => a - b),
        extra: [],
        orario: '20:30'
      });
    }
  }

  return results;
}

// ============================================================
// Lotto — fonte: estrazionilotto.it/lotto/archivio-storico
// Struttura reale dopo stripHtml:
//   "Estrazione Lotto n. 99 sabato 20 giugno 2026 Ruota Bari 90 24 74 14 75
//    Cagliari 79 37 ... Genova 17 24 43 89 22 ..."
// ============================================================
function parseLottoAnno(html, ruota) {
  const results = [];
  const testo = stripHtml(html);

  const mesi = {
    gennaio:'01', febbraio:'02', marzo:'03', aprile:'04',
    maggio:'05', giugno:'06', luglio:'07', agosto:'08',
    settembre:'09', ottobre:'10', novembre:'11', dicembre:'12'
  };

  // Divide per "Estrazione Lotto n."
  const blocchi = testo.split(/Estrazione\s+Lotto\s+n\.\s*\d+/i);

  for (const blocco of blocchi) {
    const dataM = blocco.match(
      /(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i
    );
    if (!dataM) continue;

    const data = dataM[3] + '-' + mesi[dataM[2].toLowerCase()] + '-' + dataM[1].padStart(2, '0');

    // Solo sabati
    if (new Date(data + 'T12:00:00').getDay() !== 6) continue;

    // Cerca la ruota richiesta (es. "Genova") e prende i 5 numeri che seguono
    // Pattern: "Genova 17 24 43 89 22"
    const re = new RegExp(ruota + '\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})', 'i');
    const m = blocco.match(re);

    if (m) {
      const numeri = [m[1], m[2], m[3], m[4], m[5]]
        .map(n => parseInt(n))
        .filter(n => n >= 1 && n <= 90);

      if (numeri.length === 5) {
        results.push({
          data,
          numeri: numeri.sort((a, b) => a - b)
        });
      }
    }
  }

  return results;
}

// ============================================================
// SuperEnalotto — fonte: estrazionilotto.it/superenalotto/archivio-storico
// Struttura reale dopo stripHtml:
//   "Estrazione SuperEnalotto n. 99 sabato 20 giugno 2026 14 59 69 71 82 89
//    Jolly 47 SuperStar 3 ..."
// ============================================================
function parseSuperEnalottoAnno(html) {
  const results = [];
  const testo = stripHtml(html);

  const mesi = {
    gennaio:'01', febbraio:'02', marzo:'03', aprile:'04',
    maggio:'05', giugno:'06', luglio:'07', agosto:'08',
    settembre:'09', ottobre:'10', novembre:'11', dicembre:'12'
  };

  // Divide per "Estrazione SuperEnalotto n."
  const blocchi = testo.split(/Estrazione\s+SuperEnalotto\s+n\.\s*\d+/i);

  for (const blocco of blocchi) {
    const dataM = blocco.match(
      /(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i
    );
    if (!dataM) continue;

    const data = dataM[3] + '-' + mesi[dataM[2].toLowerCase()] + '-' + dataM[1].padStart(2, '0');

    // Solo sabati
    if (new Date(data + 'T12:00:00').getDay() !== 6) continue;

    // Jolly e SuperStar
    const jollyM = blocco.match(/Jolly\s+(\d{1,2})/i);
    const jolly = jollyM ? parseInt(jollyM[1]) : null;
    const superstarM = blocco.match(/SuperStar\s+(\d{1,2})/i);
    const superstar = superstarM ? parseInt(superstarM[1]) : null;

    // Prendi numeri 1-90 prima del Jolly
    const partePrima = jollyM
      ? blocco.substring(0, blocco.search(/Jolly/i))
      : blocco;

    const nums = [...partePrima.matchAll(/\b([1-9]|[1-8][0-9]|90)\b/g)]
      .map(m => parseInt(m[1]))
      .filter(n => n >= 1 && n <= 90);

    const unici = [...new Set(nums)];

    if (unici.length >= 6) {
      results.push({
        data,
        numeri: unici.slice(0, 6).sort((a, b) => a - b),
        jolly,
        superstar
      });
    }
  }

  return results;
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { tipo = '10elotto', anno, ruota = 'Genova' } = req.query;
  const annoNum = parseInt(anno || new Date().getFullYear());
  const anni = [annoNum, annoNum - 1];

  try {
    let parsed = [];

    if (tipo === '10elotto') {
      const htmls = await Promise.all(
        anni.map(a =>
          fetchUrl('https://www.estrazionilotto.it/10-e-lotto/archivio-storico/' + a)
            .catch(() => '')
        )
      );
      for (const html of htmls) if (html) parsed = parsed.concat(parse10eLottoAnno(html));
      parsed.sort((a, b) => new Date(b.data) - new Date(a.data));

    } else if (tipo === 'millionday') {
      const htmls = await Promise.all(
        anni.map(a =>
          fetchUrl('https://www.estrazionilotto.it/millionday/archivio-storico/' + a)
            .catch(() => '')
        )
      );
      for (const html of htmls) if (html) parsed = parsed.concat(parseMillionDay(html));
      parsed.sort((a, b) => new Date(b.data) - new Date(a.data));

    } else if (tipo === 'lotto') {
      const htmls = await Promise.all(
        anni.map(a =>
          fetchUrl('https://www.estrazionilotto.it/lotto/archivio-storico/' + a)
            .catch(() => '')
        )
      );
      for (const html of htmls) if (html) parsed = parsed.concat(parseLottoAnno(html, ruota));
      parsed.sort((a, b) => new Date(b.data) - new Date(a.data));

    } else if (tipo === 'superenalotto') {
      const htmls = await Promise.all(
        anni.map(a =>
          fetchUrl('https://www.estrazionilotto.it/superenalotto/archivio-storico/' + a)
            .catch(() => '')
        )
      );
      for (const html of htmls) if (html) parsed = parsed.concat(parseSuperEnalottoAnno(html));
      parsed.sort((a, b) => new Date(b.data) - new Date(a.data));

    } else {
      return res.status(400).json({ ok: false, error: 'Tipo non valido' });
    }

    return res.status(200).json({
      ok: parsed.length > 0,
      tipo,
      anno: annoNum,
      count: parsed.length,
      estrazioni: parsed
    });

  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message, tipo, anno: annoNum });
  }
}
