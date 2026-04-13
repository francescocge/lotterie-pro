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

    // Cerca i 20 numeri estratti (escludendo rumore)
    const allNums = [...blocco.matchAll(/\b(\d{1,2})\b/g)]
      .map(m => parseInt(m[1]))
      .filter(n => n >= 1 && n <= 90);
    
    // Filtra numeri spuri (giorno, mese, anno della data)
    const giorno = parseInt(dataM[1]);
    const mese = parseInt(mesi[dataM[2].toLowerCase()]);
    const anno = parseInt(dataM[3]);
    
    const filtrati = allNums.filter(n => 
      n !== giorno && n !== mese && n !== anno && 
      n !== (anno - 2000) && n !== (anno % 100)
    );
    
    const unici = [...new Set(filtrati)];
    if (unici.length >= 20) {
      results.push({ data, numeri: unici.slice(0,20).sort((a,b)=>a-b), oro, extra: [] });
    }
  }
  return results;
}

// ============================================================
// PARSER MillionDay — fonte: milliondaylotto.it/archivio/YYYY
// Pattern HTML reale: `| [12 aprile 2026] | Concorso n. 203 (13:00) * 24 * 36 * 37 * 40 * 53`
// ============================================================
function parseMillionDay(html) {
  const results = [];
  const mesi = {gennaio:'01',febbraio:'02',marzo:'03',aprile:'04',maggio:'05',giugno:'06',
    luglio:'07',agosto:'08',settembre:'09',ottobre:'10',novembre:'11',dicembre:'12'};
  
  // Regex per catturare blocchi data + concorsi
  // Pattern: "[12 aprile 2026]" poi una o più righe di "Concorso n. XXX (HH:MM) * NUM * NUM ..."
  const blockRegex = /\[(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})\][^\[]*?(?=\[|$)/gi;
  
  let match;
  while ((match = blockRegex.exec(html)) !== null) {
    const giorno = match[1].padStart(2, '0');
    const mese = mesi[match[2].toLowerCase()];
    const anno = match[3];
    const data = anno + '-' + mese + '-' + giorno;
    
    const blockContent = match[0];
    
    // Dentro il blocco, cerca tutti i "Concorso n. XXX (HH:MM)"
    // Ma SOLO quelli che NON contengono "Extra"
    const preExtra = blockContent.split(/\*\*Extra/i)[0];
    
    // Regex per ogni concorso: "Concorso n. 203 (13:00) * 24 * 36 ..."
    const concorsoRegex = /Concorso n\.\s*(\d+)\s*\((\d{2}:\d{2})\)\s*([\d\s\*]+?)(?=Concorso|$)/gi;
    let concMatch;
    
    while ((concMatch = concorsoRegex.exec(preExtra)) !== null) {
      const concorso = parseInt(concMatch[1]);
      const orario = concMatch[2];
      const numeriStr = concMatch[3];
      
      // Estrai numeri: "* 24 * 36 * 37 * 40 * 53"
      const numeri = [];
      const numRegex = /\*\s*(\d{1,2})\s*/g;
      let numMatch;
      while ((numMatch = numRegex.exec(numeriStr)) !== null) {
        const n = parseInt(numMatch[1]);
        if (n >= 1 && n <= 55 && !numeri.includes(n)) {
          numeri.push(n);
        }
      }
      
      if (numeri.length >= 5) {
        results.push({
          data,
          numeri: numeri.slice(0, 5).sort((a, b) => a - b),
          orario,
          concorso,
          extra: []
        });
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
      // MillionDay — dati hardcoded stabili (aggiorna manualmente ogni settimana)
      const millionDayData = [
        {data:'2026-04-12',numeri:[24,36,37,40,53],orario:'13:00',concorso:203,extra:[]},
        {data:'2026-04-12',numeri:[24,36,37,40,53],orario:'13:00',concorso:203,extra:[]},
        {data:'2026-04-11',numeri:[14,16,31,33,45],orario:'20:30',concorso:202,extra:[]},
        {data:'2026-04-11',numeri:[7,11,15,27,55],orario:'13:00',concorso:201,extra:[]},
        {data:'2026-04-10',numeri:[4,19,27,33,46],orario:'20:30',concorso:200,extra:[]},
        {data:'2026-04-10',numeri:[7,34,36,43,46],orario:'13:00',concorso:199,extra:[]},
        {data:'2026-04-09',numeri:[22,32,34,40,49],orario:'20:30',concorso:198,extra:[]},
        {data:'2026-04-09',numeri:[18,34,42,52,55],orario:'13:00',concorso:197,extra:[]},
        {data:'2026-04-08',numeri:[5,24,32,35,38],orario:'20:30',concorso:196,extra:[]},
        {data:'2026-04-08',numeri:[3,25,35,49,50],orario:'13:00',concorso:195,extra:[]},
        {data:'2026-04-07',numeri:[18,28,36,40,51],orario:'20:30',concorso:194,extra:[]},
        {data:'2026-04-07',numeri:[15,27,36,41,47],orario:'13:00',concorso:193,extra:[]},
        {data:'2026-04-06',numeri:[2,20,28,31,50],orario:'20:30',concorso:192,extra:[]},
        {data:'2026-04-06',numeri:[7,10,28,39,51],orario:'13:00',concorso:191,extra:[]},
        {data:'2026-04-05',numeri:[13,24,32,34,55],orario:'20:30',concorso:190,extra:[]},
        {data:'2026-04-05',numeri:[6,21,25,34,47],orario:'13:00',concorso:189,extra:[]},
        {data:'2026-04-04',numeri:[15,23,34,40,49],orario:'20:30',concorso:188,extra:[]},
        {data:'2026-04-04',numeri:[27,32,33,41,51],orario:'13:00',concorso:187,extra:[]},
        {data:'2026-04-03',numeri:[1,3,43,50,52],orario:'20:30',concorso:186,extra:[]},
        {data:'2026-04-03',numeri:[12,34,41,44,49],orario:'13:00',concorso:185,extra:[]}
      ];
      
      parsed = millionDayData.filter(e => {
        const d = new Date(e.data + 'T12:00:00');
        return d.getFullYear() === anno;
      });
      
      // Log per debug
      console.log(`MillionDay ${anno}: ${parsed.length} estrazioni trovate`);

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
      debugHtml: parsed.length === 0 ? 'Nessun dato trovato — controlla la risposta della console del server' : undefined
    });

  } catch (err) {
    res.status(503).json({ ok: false, error: err.message, tipo, anno });
  }
};
