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
  return str.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/·/g, ' ').replace(/\s+/g, ' ').trim();
}

// ============================================================
// 10eLotto — fonte: estrazionilotto.it (INVARIATO - funziona)
// ============================================================
function parse10eLottoAnno(html) {
  const results = [];
  const testo = stripHtml(html);
  const mesi = {
    gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',
    maggio:'05',giugno:'06',luglio:'07',agosto:'08',
    settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'
  };
  const blocchi = testo.split(/Estrazione\s+10eLotto\s+n\.\s*\d+/i);
  for (const blocco of blocchi) {
    const dataM = blocco.match(/(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (!dataM) continue;
    const data = dataM[3]+'-'+mesi[dataM[2].toLowerCase()]+'-'+dataM[1].padStart(2,'0');
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;
    const oroM = blocco.match(/Numero\s+Oro\s+10eLotto\s+(\d{1,2})/i);
    const oro = oroM ? parseInt(oroM[1]) : null;
    const partePrima = oroM ? blocco.substring(0, blocco.search(/Numero\s+Oro\s+10eLotto/i)) : blocco;
    const nums = [...partePrima.matchAll(/\b([1-9]|[1-8][0-9]|90)\b/g)].map(m => parseInt(m[1])).filter(n => n >= 1 && n <= 90);
    const unici = [...new Set(nums)];
    if (unici.length >= 20) {
      results.push({ data, numeri: unici.slice(0,20).sort((a,b)=>a-b), oro, extra: [] });
    }
  }
  return results;
}

// ============================================================
// MillionDay — fonte: archiviomillionday.it (INVARIATO - logica corretta)
// ============================================================
function parseMillionDay(html) {
  const results = [];
  const righe = html.split(/<tr[\s>]/i);
  for (const riga of righe) {
    const dataM = riga.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!dataM) continue;
    const giorno = dataM[1].padStart(2,'0');
    const mese = dataM[2].padStart(2,'0');
    const anno = dataM[3];
    const data = anno+'-'+mese+'-'+giorno;
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;
    const concorsoM = riga.match(/concorso[^0-9]*(\d+)/i);
    if (!concorsoM) continue;
    const concorso = parseInt(concorsoM[1]);
    if (concorso % 2 !== 0) continue;
    const celle = riga.match(/<td[^>]*>([\s\d]+)<\/td>/gi);
    if (!celle) continue;
    for (const cella of celle) {
      const testo = stripHtml(cella);
      const nums = testo.trim().split(/\s+/).map(n => parseInt(n)).filter(n => n >= 1 && n <= 55);
      if (nums.length === 5) {
        results.push({ data, numeri: nums.sort((a,b)=>a-b), extra: [], orario: '20:30' });
        break;
      }
    }
  }
  return results;
}

// ============================================================
// Lotto — fonte: estrazionilotto.it (INVARIATO - funziona)
// ============================================================
function parseLottoAnno(html, ruota) {
  const results = [];
  const testo = stripHtml(html);
  const mesi = {
    gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',
    maggio:'05',giugno:'06',luglio:'07',agosto:'08',
    settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'
  };
  const blocchi = testo.split(/Estrazione\s+Lotto\s+n\.\s*\d+/i);
  for (const blocco of blocchi) {
    const dataM = blocco.match(/(?:lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i);
    if (!dataM) continue;
    const data = dataM[3]+'-'+mesi[dataM[2].toLowerCase()]+'-'+dataM[1].padStart(2,'0');
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;
    const re = new RegExp(ruota+'\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(\\d{1,2})','i');
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
// SuperEnalotto — fonte: tuttosuperenalotto.it
//
// HTML reale di ogni riga:
//   <tr>
//     <td><a href="...?dt=20260620...">99</a></td>  ← link, NON numero nudo
//     <td>20/06/2026</td>
//     <td>14</td><td>59</td><td>69</td><td>71</td><td>82</td><td>89</td>
//     <td>47</td>   ← Jolly
//     <td>3</td>    ← SuperStar
//   </tr>
//
// Strategia: cerco la data DD/MM/YYYY nel link href (?dt=YYYYMMDD) o nel testo cella,
// poi raccolgo tutti i <td> con numero puro (senza tag figli) = 8 celle numeriche
// ============================================================
function parseSuperEnalottoAnno(html) {
  const results = [];

  // Divide per righe <tr>
  const righe = html.split(/<tr[\s>]/i);

  for (const riga of righe) {
    // Cerca data nel formato ?dt=YYYYMMDD nel link
    const dtM = riga.match(/\?dt=(\d{4})(\d{2})(\d{2})/);
    if (!dtM) continue;

    const data = dtM[1]+'-'+dtM[2]+'-'+dtM[3];

    // Solo sabati (getDay() === 6)
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;

    // Raccogli SOLO le celle <td> che contengono esclusivamente un numero
    // (senza tag figli come <a>) → pattern: <td>SPAZI numero SPAZI</td>
    const numeriCelle = [...riga.matchAll(/<td[^>]*>\s*(\d{1,2})\s*<\/td>/gi)]
      .map(m => parseInt(m[1]))
      .filter(n => n >= 1 && n <= 90);

    // Devono essere esattamente 8: 6 numeri + jolly + superstar
    if (numeriCelle.length < 8) continue;

    const numeri = numeriCelle.slice(0, 6).sort((a,b) => a-b);
    const jolly = numeriCelle[6] || null;
    const superstar = numeriCelle[7] || null;

    results.push({ data, numeri, jolly, superstar });
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
        anni.map(a => fetchUrl('https://www.estrazionilotto.it/10-e-lotto/archivio-storico/'+a).catch(() => ''))
      );
      for (const html of htmls) if (html) parsed = parsed.concat(parse10eLottoAnno(html));
      parsed.sort((a,b) => new Date(b.data)-new Date(a.data));

    } else if (tipo === 'millionday') {
      const htmls = await Promise.all(
        anni.map(a => fetchUrl('https://archiviomillionday.it/archivio-million-day.php?anno='+a).catch(() => ''))
      );
      if (!htmls[0]) {
        const main = await fetchUrl('https://archiviomillionday.it/archivio-million-day.php').catch(() => '');
        if (main) htmls[0] = main;
      }
      for (const html of htmls) if (html) parsed = parsed.concat(parseMillionDay(html));
      parsed.sort((a,b) => new Date(b.data)-new Date(a.data));

    } else if (tipo === 'lotto') {
      const htmls = await Promise.all(
        anni.map(a => fetchUrl('https://www.estrazionilotto.it/lotto/archivio-storico/'+a).catch(() => ''))
      );
      for (const html of htmls) if (html) parsed = parsed.concat(parseLottoAnno(html, ruota));
      parsed.sort((a,b) => new Date(b.data)-new Date(a.data));

    } else if (tipo === 'superenalotto') {
      // Pagina "ultimo anno" sempre aggiornata — non serve passare l'anno
      const html = await fetchUrl('https://www.tuttosuperenalotto.it/superenalotto-archivio-risultati-per-anno.asp').catch(() => '');
      if (html) parsed = parseSuperEnalottoAnno(html);
      parsed.sort((a,b) => new Date(b.data)-new Date(a.data));

    } else {
      return res.status(400).json({ ok: false, error: 'Tipo non valido' });
    }

    // Deduplicazione per data
    const visti = new Set();
    parsed = parsed.filter(e => {
      if (visti.has(e.data)) return false;
      visti.add(e.data);
      return true;
    });

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
