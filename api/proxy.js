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
// Struttura reale: "Estrazione 10eLotto n. 99 sabato 20 giugno 2026 7 8 17 ... Numero Oro 10eLotto 90"
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
// MillionDay — fonte: archiviomillionday.it
// Struttura tabella HTML:
//   <td>20/6/2026</td> <td>342</td> <td>13 18 25 42 43</td> <td>20 21 35 51 52</td>
// Prendo solo estrazione sera (concorso pari = 20:30, dispari = 13:00)
// In realtà il concorso pari corrisponde alla sera basandosi sui dati osservati:
//   342 (20:30) = 13 18 25 42 43 → concorso pari
//   341 (13:00) = 3 9 13 25 40   → concorso dispari
// Quindi: concorso pari = sera, concorso dispari = mattina
// ============================================================
function parseMillionDay(html) {
  const results = [];
  // Cerca righe tabella: <tr> con link alla data e numeri
  const righe = html.split(/<tr[\s>]/i);
  for (const riga of righe) {
    // Cerca data nel formato DD/M/YYYY o D/M/YYYY nel link href o nel testo
    const dataM = riga.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!dataM) continue;
    const giorno = dataM[1].padStart(2,'0');
    const mese = dataM[2].padStart(2,'0');
    const anno = dataM[3];
    const data = anno+'-'+mese+'-'+giorno;
    // Solo sabati
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;
    // Cerca numero concorso
    const concorsoM = riga.match(/concorso[^0-9]*(\d+)/i);
    if (!concorsoM) continue;
    const concorso = parseInt(concorsoM[1]);
    // Solo concorsi pari = sera (20:30)
    if (concorso % 2 !== 0) continue;
    // Cerca numeri nella colonna "Numeri estratti": celle <td> con sequenza di numeri 1-55
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
// Lotto — fonte: estrazionilotto.it
// Struttura reale: "Estrazione Lotto n. 99 sabato 20 giugno 2026 ... Genova 17 24 43 89 22 ..."
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
// Struttura tabella HTML:
//   | 100 | 23/06/2026 | 1 | 12 | 17 | 27 | 66 | 84 | Jolly: 61 | SS: 4 |
// Ogni riga: <td>concorso</td><td>DD/MM/YYYY</td><td>n1</td>...<td>n6</td><td>jolly</td><td>ss</td>
// ============================================================
function parseSuperEnalottoAnno(html) {
  const results = [];
  const righe = html.split(/<tr[\s>]/i);
  for (const riga of righe) {
    // Cerca data nel formato DD/MM/YYYY
    const dataM = riga.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!dataM) continue;
    const data = dataM[3]+'-'+dataM[2]+'-'+dataM[1];
    // Solo sabati
    if (new Date(data+'T12:00:00').getDay() !== 6) continue;
    // Estrai tutti i numeri dalle celle <td>
    const celle = [...riga.matchAll(/<td[^>]*>\s*(\d{1,2})\s*<\/td>/gi)].map(m => parseInt(m[1]));
    // La struttura attesa è: [concorso, (ignorato-già nella data), n1,n2,n3,n4,n5,n6, jolly, superstar]
    // ma la data è in formato testo, non numero, quindi celle contiene solo numeri puri
    // celle[0] = numero concorso (es. 99 o 100)
    // celle[1..6] = sei numeri estrazione
    // celle[7] = jolly
    // celle[8] = superstar
    if (celle.length < 9) continue;
    const numeri = celle.slice(1,7).filter(n => n >= 1 && n <= 90);
    const jolly = celle[7] || null;
    const superstar = celle[8] || null;
    if (numeri.length === 6) {
      results.push({ data, numeri: numeri.sort((a,b)=>a-b), jolly, superstar });
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
        anni.map(a => fetchUrl('https://www.estrazionilotto.it/10-e-lotto/archivio-storico/'+a).catch(() => ''))
      );
      for (const html of htmls) if (html) parsed = parsed.concat(parse10eLottoAnno(html));
      parsed.sort((a,b) => new Date(b.data)-new Date(a.data));

    } else if (tipo === 'millionday') {
      // archiviomillionday.it - archivio 2026 completo in una pagina
      const htmls = await Promise.all(
        anni.map(a => fetchUrl('https://archiviomillionday.it/archivio-million-day.php?anno='+a).catch(() => ''))
      );
      // Fallback: pagina principale contiene sempre l'anno corrente
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
      // tuttosuperenalotto.it - archivio ultimo anno sempre aggiornato
      const html = await fetchUrl('https://www.tuttosuperenalotto.it/superenalotto-archivio-risultati-per-anno.asp').catch(() => '');
      if (html) parsed = parseSuperEnalottoAnno(html);
      // Se serve anche l'anno precedente
      if (anni.length > 1) {
        const html2 = await fetchUrl('https://www.tuttosuperenalotto.it/superenalotto-archivio-storico-dal-1997-ad-oggi.asp?anno='+(annoNum-1)).catch(() => '');
        if (html2) parsed = parsed.concat(parseSuperEnalottoAnno(html2));
      }
      parsed.sort((a,b) => new Date(b.data)-new Date(a.data));

    } else {
      return res.status(400).json({ ok: false, error: 'Tipo non valido' });
    }

    // Rimuove duplicati per data
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
