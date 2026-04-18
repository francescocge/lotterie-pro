export default async function handler(req, res) {
  // CORS headers
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

  try {
    let estrazioni = [];

    if (tipo === '10elotto') {
      estrazioni = await parse10eLottoAnno(anno);
    } else if (tipo === 'millionday') {
      estrazioni = await parseMillionDayAnno(anno);
    } else if (tipo === 'lotto') {
      if (!ruota) {
        return res.status(400).json({ ok: false, error: 'Parametro ruota mancante per tipo=lotto' });
      }
      estrazioni = await parseLottoAnno(anno, ruota);
    } else if (tipo === 'superenalotto') {
      estrazioni = await parseSuperEnalottoAnno(anno);
    } else {
      return res.status(400).json({ ok: false, error: 'Tipo non valido: ' + tipo });
    }

    return res.status(200).json({ ok: true, estrazioni });
  } catch (err) {
    console.error('Errore proxy:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ============================================================
// PARSER 10eLOTTO
// ============================================================
async function parse10eLottoAnno(anno) {
  const url = `https://www.estrazionedellotto.it/10-e-lotto-ogni-5-minuti-di-oggi/archivio-10-e-lotto/${anno}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const html = await resp.text();

  const regex = /(\d{2}\/\d{2}\/\d{4})[^\d]+([\d\s]+)/g;
  const results = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    const dataRaw = match[1];
    const numeriRaw = match[2].trim();

    // Converti data da DD/MM/YYYY a YYYY-MM-DD
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    // Estrai numeri
    const numeri = numeriRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 90);

    // FILTRO IMPORTANTE: Rimuovi numeri spuri (giorno, mese, anno)
    const numeriPuliti = numeri.filter(n => 
      n !== parseInt(giorno) && 
      n !== parseInt(mese) && 
      n !== parseInt(annoStr)
    );

    if (numeriPuliti.length >= 15 && numeriPuliti.length <= 20) {
      const oro = numeriPuliti[0] || null;
      const doppioro = numeriPuliti[1] || null;

      results.push({
        data,
        numeri: numeriPuliti,
        oro,
        doppioro,
        extra: []
      });
    }
  }

  return results;
}

// ============================================================
// PARSER MILLIONDAY
// ============================================================
async function parseMillionDayAnno(anno) {
  const url = `https://www.estrazionedellotto.it/millionday/archivio-millionday/${anno}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const html = await resp.text();

  const regex = /(\d{2}\/\d{2}\/\d{4})[^\d]+([\d\s]+)/g;
  const results = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    const dataRaw = match[1];
    const numeriRaw = match[2].trim();

    // Converti data
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    // Estrai numeri
    const numeri = numeriRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 55);

    // FILTRO: Rimuovi numeri spuri (giorno, mese, anno)
    const numeriPuliti = numeri.filter(n => 
      n !== parseInt(giorno) && 
      n !== parseInt(mese) && 
      n !== parseInt(annoStr)
    );

    if (numeriPuliti.length === 5) {
      results.push({
        data,
        numeri: numeriPuliti
      });
    }
  }

  return results;
}

// ============================================================
// PARSER LOTTO
// ============================================================
async function parseLottoAnno(anno, ruota) {
  const url = `https://www.estrazionedellotto.it/estrazioni-lotto-${ruota}/${anno}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const html = await resp.text();

  const regex = /(\d{2}\/\d{2}\/\d{4})[^\d]+([\d\s]+)/g;
  const results = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    const dataRaw = match[1];
    const numeriRaw = match[2].trim();

    // Converti data
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    // Estrai numeri
    const numeri = numeriRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 90);

    // FILTRO: Rimuovi numeri spuri
    const numeriPuliti = numeri.filter(n => 
      n !== parseInt(giorno) && 
      n !== parseInt(mese) && 
      n !== parseInt(annoStr)
    );

    if (numeriPuliti.length === 5) {
      results.push({
        data,
        numeri: numeriPuliti,
        ruota
      });
    }
  }

  return results;
}

// ============================================================
// PARSER SUPERENALOTTO
// ============================================================
async function parseSuperEnalottoAnno(anno) {
  const url = `https://www.estrazionedellotto.it/superenalotto/archivio-storico/${anno}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const html = await resp.text();

  // Pattern: data (DD/MM/YYYY) seguita da 6 numeri + Jolly + SuperStar
  const regex = /(\d{2}\/\d{2}\/\d{4})[^\d]+((?:\d+\s*){6})[^\d]+Jolly[^\d]+(\d+)[^\d]+SuperStar[^\d]+(\d+)/gi;
  const results = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    const dataRaw = match[1];
    const numeriRaw = match[2].trim();
    const jolly = parseInt(match[3]);
    const superstar = parseInt(match[4]);

    // Converti data
    const [giorno, mese, annoStr] = dataRaw.split('/');
    const data = `${annoStr}-${mese}-${giorno}`;

    // Estrai 6 numeri principali
    const numeri = numeriRaw.split(/\s+/).map(Number).filter(n => n >= 1 && n <= 90).slice(0, 6);

    // FILTRO: Rimuovi numeri spuri
    const numeriPuliti = numeri.filter(n => 
      n !== parseInt(giorno) && 
      n !== parseInt(mese) && 
      n !== parseInt(annoStr)
    );

    if (numeriPuliti.length === 6 && jolly >= 1 && jolly <= 90 && superstar >= 1 && superstar <= 90) {
      results.push({
        data,
        numeri: numeriPuliti,
        jolly,
        superstar
      });
    }
  }

  return results;
}
