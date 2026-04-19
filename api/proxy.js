export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { tipo, anno, ruota } = req.query;
  if (!tipo || !anno) return res.status(400).json({ ok: false, error: 'Parametri mancanti' });

  console.log(`🎯 Parsing ${tipo} anno ${anno}${ruota ? ' ruota ' + ruota : ''}`);

  try {
    let estrazioni = [];
    if (tipo === '10elotto')       estrazioni = await parse10eLottoAnno(anno);
    else if (tipo === 'millionday') estrazioni = await parseMillionDayAnno(anno);
    else if (tipo === 'lotto') {
      if (!ruota) return res.status(400).json({ ok: false, error: 'Parametro ruota mancante' });
      estrazioni = await parseLottoAnno(anno, ruota);
    }
    else if (tipo === 'superenalotto') estrazioni = await parseSuperEnalottoAnno(anno);
    else return res.status(400).json({ ok: false, error: 'Tipo non valido: ' + tipo });

    console.log(`✅ Trovate ${estrazioni.length} estrazioni per ${tipo}`);
    return res.status(200).json({ ok: true, estrazioni });
  } catch (err) {
    console.error('❌ Errore proxy:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ============================================================
// HELPER fetch con User-Agent e timeout
// ============================================================
async function fetchHtml(url) {
  console.log('📡 Fetch:', url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// HELPER: estrae blocchi "Estrazione n. X / data / numeri"
// Struttura del sito estrazionedellotto.it:
//   Estrazione n. 134\n**08/03/2026**\n* Principale\n* 28\n* 53...
// ============================================================
function estraiBloccoDati(html) {
  // Rimuovi tag HTML, normalizza spazi/newline
  const testo = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  return testo;
}

// ============================================================
// PARSER MILLIONDAY
// URL: /million-day/risultati/archivio-millionday-YYYY
// Pattern testo estratto:
//   "Estrazione n. 134 08/03/2026 Principale 28 53 13 39 23 Extra 33 18 20 47 26"
// ============================================================
async function parseMillionDayAnno(anno) {
  const url = `https://www.estrazionedellotto.it/million-day/risultati/archivio-millionday-${anno}`;
  const html = await fetchHtml(url);
  const testo = estraiBloccoDati(html);

  // Pattern: data DD/MM/YYYY seguita da "Principale" poi 5 numeri
  const regex = /(\d{2}\/\d{2}\/\d{4})\s+Principale\s+((?:\d{1,2}\s*){5})/gi;
  const results = [];
  let match;

  while ((match = regex.exec(testo)) !== null) {
    const dataRaw = match[1];
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    const numeri = match[2].trim().split(/\s+/).map(Number).filter(n => n >= 1 && n <= 55);
    if (numeri.length === 5) {
      results.push({ data, numeri });
    }
  }

  console.log(`MillionDay: trovate ${results.length} estrazioni`);
  return results;
}

// ============================================================
// PARSER 10eLOTTO
// URL: /10elotto/risultati/archivio-10elotto-YYYY
// ============================================================
async function parse10eLottoAnno(anno) {
  const url = `https://www.estrazionedellotto.it/10elotto/risultati/archivio-10elotto-${anno}`;
  const html = await fetchHtml(url);
  const testo = estraiBloccoDati(html);

  // Cerca data + blocco di 20 numeri 1-90
  // Pattern flessibile: data poi sequenza di numeri separati da spazi
  const regex = /(\d{2}\/\d{2}\/\d{4})\s+((?:\d{1,2}\s+){15,20})/g;
  const results = [];
  let match;

  while ((match = regex.exec(testo)) !== null) {
    const dataRaw = match[1];
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    const numeri = match[2].trim().split(/\s+/).map(Number)
      .filter(n => n >= 1 && n <= 90)
      .filter(n => n !== parseInt(giorno) && n !== parseInt(mese));

    if (numeri.length >= 15 && numeri.length <= 22) {
      results.push({
        data,
        numeri: numeri.slice(0, 20),
        oro: numeri[0] || null,
        doppioro: numeri[1] || null,
        extra: []
      });
    }
  }

  console.log(`10eLotto: trovate ${results.length} estrazioni`);
  return results;
}

// ============================================================
// PARSER LOTTO
// URL: /risultati/archivio-lotto-YYYY
// ============================================================
async function parseLottoAnno(anno, ruota) {
  const url = `https://www.estrazionedellotto.it/risultati/archivio-lotto-${anno}`;
  const html = await fetchHtml(url);
  const testo = estraiBloccoDati(html);

  // Cerca pattern: data poi nome ruota poi 5 numeri
  // Es: "17/04/2026 Bari 31 34 54 63 51"
  const ruotaCapitalized = ruota.charAt(0).toUpperCase() + ruota.slice(1).toLowerCase();
  const regexRuota = new RegExp(
    `(\\d{2}\\/\\d{2}\\/\\d{4})(?:.*?)${ruotaCapitalized}\\s+((?:\\d{1,2}\\s*){5})`,
    'gi'
  );
  const results = [];
  let match;

  while ((match = regexRuota.exec(testo)) !== null) {
    const dataRaw = match[1];
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    const numeri = match[2].trim().split(/\s+/).map(Number).filter(n => n >= 1 && n <= 90);
    if (numeri.length === 5) {
      results.push({ data, numeri, ruota });
    }
  }

  // Fallback: se ruota specifica non trovata, prova pattern generico
  if (results.length === 0) {
    console.log(`⚠️ Lotto ${ruota}: pattern ruota non trovato, uso fallback generico`);
    const regex2 = /(\d{2}\/\d{2}\/\d{4})\s+((?:\d{1,2}\s+){4}\d{1,2})/g;
    let match2;
    while ((match2 = regex2.exec(testo)) !== null) {
      const dataRaw = match2[1];
      const [giorno, mese, annoStr] = dataRaw.split('/');
      const data = `${annoStr}-${mese}-${giorno}`;
      const numeri = match2[2].trim().split(/\s+/).map(Number).filter(n => n >= 1 && n <= 90);
      if (numeri.length === 5) {
        results.push({ data, numeri, ruota });
      }
    }
  }

  console.log(`Lotto ${ruota}: trovate ${results.length} estrazioni`);
  return results;
}

// ============================================================
// PARSER SUPERENALOTTO
// URL: /superenalotto/risultati/archivio-superenalotto-YYYY
// Pattern testo:
//   "DD/MM/YYYY  n1 n2 n3 n4 n5 n6  Jolly: J  SuperStar: SS"
// ============================================================
async function parseSuperEnalottoAnno(anno) {
  const url = `https://www.estrazionedellotto.it/superenalotto/risultati/archivio-superenalotto-${anno}`;
  const html = await fetchHtml(url);
  const testo = estraiBloccoDati(html);

  // Pattern con Jolly e SuperStar espliciti
  const regex = /(\d{2}\/\d{2}\/\d{4})\s+((?:\d{1,2}\s+){6})(?:.*?)[Jj]olly[:\s]+(\d{1,2})(?:.*?)[Ss]uper[Ss]tar[:\s]+(\d{1,2})/g;
  const results = [];
  let match;

  while ((match = regex.exec(testo)) !== null) {
    const dataRaw = match[1];
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    const numeri = match[2].trim().split(/\s+/).map(Number)
      .filter(n => n >= 1 && n <= 90)
      .slice(0, 6);
    const jolly = parseInt(match[3]);
    const superstar = parseInt(match[4]);

    if (numeri.length === 6 && jolly >= 1 && jolly <= 90 && superstar >= 1 && superstar <= 90) {
      results.push({ data, numeri, jolly, superstar });
    }
  }

  // Fallback: cerca 8 numeri dopo la data (6 + jolly + superstar)
  if (results.length === 0) {
    console.log('⚠️ SuperEnalotto: pattern Jolly/SS non trovato, uso fallback 8 numeri');
    const regex2 = /(\d{2}\/\d{2}\/\d{4})\s+((?:\d{1,2}\s+){7}\d{1,2})/g;
    let match2;
    while ((match2 = regex2.exec(testo)) !== null) {
      const dataRaw = match2[1];
      const [giorno, mese, annoStr] = dataRaw.split('/');
      const data = `${annoStr}-${mese}-${giorno}`;
      const tutti = match2[2].trim().split(/\s+/).map(Number).filter(n => n >= 1 && n <= 90);
      if (tutti.length >= 8) {
        results.push({
          data,
          numeri: tutti.slice(0, 6),
          jolly: tutti[6] || null,
          superstar: tutti[7] || null
        });
      }
    }
  }

  console.log(`SuperEnalotto: trovate ${results.length} estrazioni`);
  return results;
}
