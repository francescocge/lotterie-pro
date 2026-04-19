export default async function handler(req, res) {
  console.log('🔧 Proxy handler chiamato:', req.method, req.url);
  console.log('📋 Query params:', req.query);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { tipo, anno, ruota } = req.query;

  if (!tipo || !anno) {
    return res.status(400).json({ ok: false, error: 'Parametri mancanti: tipo e anno richiesti' });
  }

  console.log(`🎯 Parsing ${tipo} anno ${anno}${ruota ? ' ruota ' + ruota : ''}`);

  try {
    let estrazioni = [];

    if (tipo === '10elotto') {
      estrazioni = await parse10eLottoAnno(anno);
    } else if (tipo === 'millionday') {
      estrazioni = await parseMillionDayAnno(anno);
    } else if (tipo === 'lotto') {
      if (!ruota) return res.status(400).json({ ok: false, error: 'Parametro ruota mancante' });
      estrazioni = await parseLottoAnno(anno, ruota);
    } else if (tipo === 'superenalotto') {
      estrazioni = await parseSuperEnalottoAnno(anno);
    } else {
      return res.status(400).json({ ok: false, error: 'Tipo non valido: ' + tipo });
    }

    console.log(`✅ Trovate ${estrazioni.length} estrazioni per ${tipo}`);
    return res.status(200).json({ ok: true, estrazioni });
  } catch (err) {
    console.error('❌ Errore proxy:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ============================================================
// HELPER: fetch con timeout e User-Agent
// ============================================================
async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'it-IT,it;q=0.9'
      }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// PARSER 10eLOTTO
// URL: /10elotto/risultati/archivio-10elotto-YYYY
// ============================================================
async function parse10eLottoAnno(anno) {
  const url = `https://www.estrazionedellotto.it/10elotto/risultati/archivio-10elotto-${anno}`;
  console.log('📡 10eLotto URL:', url);
  const html = await fetchHtml(url);

  const regex = /(\d{2}\/\d{2}\/\d{4})[^\d]+([\d\s]+)/g;
  const results = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    const dataRaw = match[1];
    const numeriRaw = match[2].trim();
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    const numeri = numeriRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 90);
    const numeriPuliti = numeri.filter(n =>
      n !== parseInt(giorno) && n !== parseInt(mese) && n !== parseInt(annoStr)
    );

    if (numeriPuliti.length >= 15 && numeriPuliti.length <= 20) {
      results.push({
        data,
        numeri: numeriPuliti,
        oro: numeriPuliti[0] || null,
        doppioro: numeriPuliti[1] || null,
        extra: []
      });
    }
  }
  return results;
}

// ============================================================
// PARSER MILLIONDAY
// URL: /million-day/risultati/archivio-millionday-YYYY
// ============================================================
async function parseMillionDayAnno(anno) {
  const url = `https://www.estrazionedellotto.it/million-day/risultati/archivio-millionday-${anno}`;
  console.log('📡 MillionDay URL:', url);
  const html = await fetchHtml(url);

  const regex = /(\d{2}\/\d{2}\/\d{4})[^\d]+([\d\s]+)/g;
  const results = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    const dataRaw = match[1];
    const numeriRaw = match[2].trim();
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    const numeri = numeriRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 55);
    const numeriPuliti = numeri.filter(n =>
      n !== parseInt(giorno) && n !== parseInt(mese) && n !== parseInt(annoStr)
    );

    if (numeriPuliti.length === 5) {
      results.push({ data, numeri: numeriPuliti });
    }
  }
  return results;
}

// ============================================================
// PARSER LOTTO
// URL: /risultati/archivio-lotto-YYYY  (poi filtro per ruota)
// ============================================================
async function parseLottoAnno(anno, ruota) {
  const url = `https://www.estrazionedellotto.it/risultati/archivio-lotto-${anno}`;
  console.log('📡 Lotto URL:', url, 'ruota:', ruota);
  const html = await fetchHtml(url);

  const regex = /(\d{2}\/\d{2}\/\d{4})[^\d]+([\d\s]+)/g;
  const results = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    const dataRaw = match[1];
    const numeriRaw = match[2].trim();
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    const numeri = numeriRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 90);
    const numeriPuliti = numeri.filter(n =>
      n !== parseInt(giorno) && n !== parseInt(mese) && n !== parseInt(annoStr)
    );

    if (numeriPuliti.length === 5) {
      results.push({ data, numeri: numeriPuliti, ruota });
    }
  }
  return results;
}

// ============================================================
// PARSER SUPERENALOTTO
// URL: /superenalotto/risultati/archivio-superenalotto-YYYY
// ============================================================
async function parseSuperEnalottoAnno(anno) {
  const url = `https://www.estrazionedellotto.it/superenalotto/risultati/archivio-superenalotto-${anno}`;
  console.log('📡 SuperEnalotto URL:', url);
  const html = await fetchHtml(url);

  // Prova pattern con Jolly e SuperStar espliciti
  const regex = /(\d{2}\/\d{2}\/\d{4})[^\d]+((?:\d+\s*){6})[^\d]*(?:Jolly|J)[^\d]+(\d+)[^\d]*(?:SuperStar|SS)[^\d]+(\d+)/gi;
  const results = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    const dataRaw = match[1];
    const numeriRaw = match[2].trim();
    const jolly = parseInt(match[3]);
    const superstar = parseInt(match[4]);
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    const numeri = numeriRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 90).slice(0, 6);
    const numeriPuliti = numeri.filter(n =>
      n !== parseInt(giorno) && n !== parseInt(mese) && n !== parseInt(annoStr)
    );

    if (numeriPuliti.length === 6 && jolly >= 1 && jolly <= 90 && superstar >= 1 && superstar <= 90) {
      results.push({ data, numeri: numeriPuliti, jolly, superstar });
    }
  }

  // Fallback: se regex Jolly/SS non trova nulla, prova con 8 numeri consecutivi
  if (results.length === 0) {
    console.log('⚠️ Pattern Jolly/SS non trovato, uso fallback 8 numeri');
    const regex2 = /(\d{2}\/\d{2}\/\d{4})[^\d]+((?:\d+\s*){8})/g;
    let match2;
    while ((match2 = regex2.exec(html)) !== null) {
      const dataRaw = match2[1];
      const numeriRaw = match2[2].trim();
      const [giorno, mese, annoStr] = dataRaw.split('/');
      const data = `${annoStr}-${mese}-${giorno}`;

      const tutti = numeriRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 90);
      const puliti = tutti.filter(n =>
        n !== parseInt(giorno) && n !== parseInt(mese) && n !== parseInt(annoStr)
      );

      if (puliti.length >= 8) {
        results.push({
          data,
          numeri: puliti.slice(0, 6),
          jolly: puliti[6] || null,
          superstar: puliti[7] || null
        });
      }
    }
  }

  return results;
}
