// api/proxy.js — Vercel Serverless Function
// Fonte: estrazionilotto.it per Lotto e 10eLotto, milliondaylotto.it per MillionDay
// NOTA: netlify/functions/proxy.js conservato separatamente per uso futuro su Netlify
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
// ============================================================
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

// ============================================================
// PARSER 10eLotto — fonte: estrazionilotto.it/10-e-lotto/archivio-storico/YYYY
// ============================================================
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
// HTML: | Data | Concorso n. XXX (13:00) * 24 * 36 * 37 * 40 * 53 Concorso n. YYY (20:30) * ... |
// Esclude Extra MillionDay
// ============================================================
function parseMillionDay(html) {
  const results = [];
  const testo = stripHtml(html);
  const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',
    luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};
  
  const righe = testo.split(/\n/);
  let currentData = null;
  
  for (const riga of righe) {
    // Saltare righe Extra
    if (riga.match(/Extra\s+MillionDay/i)) continue;
    
    // Cercare data nella riga
    const dataM = riga.match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (dataM) {
      const giorno = dataM[1].padStart(2, '0');
      const mese = mesi[dataM[2].toLowerCase()];
      const anno = dataM[3];
      currentData = anno + '-' + mese + '-' + giorno;
    }
    
    // Se abbiamo data, cercare TUTTI i concorsi nella riga (fino a Extra)
    if (currentData) {
      // Dividi per "Extra" per escludere quella parte
      const parteNonExtra = riga.split(/Extra\s+MillionDay/i)[0];
      
      // Regex: "Concorso n. 203 (13:00) * 24 * 36 * ... * 53"
      const concorsiRegex = /Concorso n\.\s*(\d+)\s*\((\d{2}:\d{2})\)([\d\s*]+?)(?=Concorso|$)/gi;
      let match;
      
      while ((match = concorsiRegex.exec(parteNonExtra)) !== null) {
        const concorso = parseInt(match[1]);
        const orario = match[2];
        const numeriStr = match[3];
        
        // Estrarre numeri dal blocco: "* 24 * 36 * 37 * 40 * 53"
        const numeriMatch = numeriStr.match(/\*\s*(\d{1,2})\s*(?=\*|$)/g) || [];
        const numeri = numeriMatch
          .map(s => parseInt(s.replace(/\*/g, '').trim()))
          .filter(n => n >= 1 && n <= 55 && !isNaN(n));
        
        const unici = [...new Set(numeri)];
        if (unici.length >= 5) {
          results.push({
            data: currentData,
            numeri: unici.slice(0, 5).sort((a, b) => a - b),
            orario,
            concorso,
            extra: []
          });
        }
      }
    }
  }
  
  return results;
}

// ============================================================
// HANDLER VERCEL — formato: export default function(req, res)
// ============================================================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const tipo  = req.query.tipo  || '10elotto';
  const anno  = parseInt(req.query.anno  || new Date().getFullYear());
  const ruota = req.query.ruota || 'Genova';
  const anni  = [anno, anno - 1];

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
      res.status(400).json({ ok: false, error: 'Tipo non valido' });
      return;
    }

    res.status(200).json({
      ok: parsed.length > 0,
      tipo, anno,
      count: parsed.length,
      estrazioni: parsed,
      debugHtml: parsed.length === 0 ? 'Nessun dato trovato' : undefined
    });

  } catch (err) {
    res.status(503).json({ ok: false, error: err.message, tipo, anno });
  }
};
