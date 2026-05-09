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

// 10eLotto
function parse10eLottoAnno(html) {
  const results = [];
  const testo = stripHtml(html);
  const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',
    luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};
  const blocchi = testo.split(/Estrazione\s+(?:10\s*e\s*Lotto|10eLotto)\s+n\.\s*\d+/i);
  for (const blocco of blocchi) {
    const dataM = blocco.match(/(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (!dataM) continue;
    const data = dataM[3]+'-'+mesi[dataM[2].toLowerCase()]+'-'+dataM[1].padStart(2,'0');
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;
    const oroM = blocco.match(/Numero Oro 10eLotto[^0-9]*(\d{1,2})/);
    const oro = oroM ? parseInt(oroM[1]) : null;
    const nums = [...blocco.matchAll(/\b(\d{1,2})\b/g)].map(m => parseInt(m[1])).filter(n => n >= 1 && n <= 90);
    const unici = [...new Set(nums)];
    if (unici.length >= 20) {
      results.push({ data, numeri: unici.slice(0,20).sort((a,b)=>a-b), oro, extra: [] });
    }
  }
  return results;
}

// MillionDay
function parseMillionDay(html) {
  const results = [];
  const righe = html.split(/<tr[\s>]/i);
  for (const riga of righe) {
    const hrefM = riga.match(/\/estrazioni\/(\d{2})-(\d{2})-(\d{4})/);
    if (!hrefM) continue;
    const data = hrefM[3] + '-' + hrefM[2] + '-' + hrefM[1];
    const numeriLi = [...riga.matchAll(/<li[^>]*>\s*(\d{1,2})\s*<\/li>/gi)].map(m => parseInt(m[1])).filter(n => n >= 1 && n <= 55);
    const unici = [...new Set(numeriLi)];
    if (unici.length >= 5) {
      results.push({ data, numeri: unici.slice(0, 5).sort((a,b)=>a-b), extra: [], orario: '20:30' });
    }
  }
  return results;
}

// Lotto
function parseLottoAnno(html, ruota) {
  const results = [];
  const testo = stripHtml(html);
  const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',
    luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};
  const blocchi = testo.split(/Estrazione Lotto n\.\s*\d+/i);
  for (const blocco of blocchi) {
    const dataM = blocco.match(/(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (!dataM) continue;
    const data = dataM[3]+'-'+mesi[dataM[2].toLowerCase()]+'-'+dataM[1].padStart(2,'0');
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;
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

// SuperEnalotto — NUOVO
function parseSuperEnalottoAnno(html) {
  const results = [];
  const testo = stripHtml(html);
  const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',
    luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};
  const blocchi = testo.split(/Estrazione\s+(?:SuperEnalotto|Super\s*Enalotto)\s+n\.\s*\d+/i);
  for (const blocco of blocchi) {
    const dataM = blocco.match(/(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (!dataM) continue;
    const data = dataM[3]+'-'+mesi[dataM[2].toLowerCase()]+'-'+dataM[1].padStart(2,'0');
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;
    const nums = [...blocco.matchAll(/\b(\d{1,2})\b/g)].map(m => parseInt(m[1])).filter(n => n >= 1 && n <= 90);
    const unici = [...new Set(nums)];
    if (unici.length >= 6) {
      const numeri = unici.slice(0,6).sort((a,b)=>a-b);
      const jollyM = blocco.match(/Jolly[^0-9]*(\d{1,2})/i);
      const jolly = jollyM ? parseInt(jollyM[1]) : null;
      const superstarM = blocco.match(/SuperStar[^0-9]*(\d{1,2})/i);
      const superstar = superstarM ? parseInt(superstarM[1]) : null;
      results.push({ data, numeri, jolly, superstar });
    }
  }
  return results;
}

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
      const htmls = await Promise.all(anni.map(a => fetchUrl('https://www.estrazionilotto.it/10-e-lotto/archivio-storico/' + a).catch(() => '')));
      for (const html of htmls) if (html) parsed = parsed.concat(parse10eLottoAnno(html));
      parsed.sort((a,b) => new Date(b.data) - new Date(a.data));

    } else if (tipo === 'millionday') {
      const htmls = await Promise.all(anni.map(a => fetchUrl('https://milliondaylotto.it/archivio/' + a).catch(() => '')));
      for (const html of htmls) if (html) parsed = parsed.concat(parseMillionDay(html));
      parsed.sort((a,b) => new Date(b.data) - new Date(a.data));

    } else if (tipo === 'lotto') {
      const htmls = await Promise.all(anni.map(a => fetchUrl('https://www.estrazionilotto.it/lotto/archivio-storico/' + a).catch(() => '')));
      for (const html of htmls) if (html) parsed = parsed.concat(parseLottoAnno(html, ruota));
      parsed.sort((a,b) => new Date(b.data) - new Date(a.data));

    } else if (tipo === 'superenalotto') {
      const htmls = await Promise.all(anni.map(a => fetchUrl('https://www.estrazionilotto.it/superenalotto/archivio-storico/' + a).catch(() => '')));
      for (const html of htmls) if (html) parsed = parsed.concat(parseSuperEnalottoAnno(html));
      parsed.sort((a,b) => new Date(b.data) - new Date(a.data));

    } else {
      return res.status(400).json({ ok: false, error: 'Tipo non valido' });
    }

    return res.status(200).json({
      ok: parsed.length > 0,
      tipo, anno: annoNum,
      count: parsed.length,
      estrazioni: parsed
    });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message, tipo, anno: annoNum });
  }
}