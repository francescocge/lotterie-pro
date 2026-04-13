#!/usr/bin/env node

/**
 * Scarica i dati MillionDay da lotto-italia.it
 * e aggiorna il proxy.js con i dati più recenti
 */

const fs = require('fs');
const path = require('path');

async function fetchMillionDayData() {
  try {
    console.log('📥 Scaricando dati MillionDay...');
    
    // Fetch da lotto-italia.it (ultimi 30 giorni)
    const response = await fetch('https://www.lotto-italia.it/millionday/archivio');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const html = await response.text();
    
    // Parse dati: cerca pattern "| Data | Numeri |"
    const estrazioni = parseMillionDayHTML(html);
    console.log(`✅ Estratti ${estrazioni.length} concorsi`);
    
    if (estrazioni.length > 0) {
      updateProxyJS(estrazioni);
      console.log('✅ proxy.js aggiornato');
    } else {
      console.warn('⚠️ Nessun dato trovato');
    }
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
    process.exit(1);
  }
}

function parseMillionDayHTML(html) {
  const results = [];
  const mesi = {
    gennaio:'01', febbraio:'02', marzo:'03', aprile:'04',
    maggio:'05', giugno:'06', luglio:'07', agosto:'08',
    settembre:'09', ottobre:'10', novembre:'11', dicembre:'12'
  };
  
  // Regex per catturare blocchi data + concorsi
  const blockRegex = /\[?(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})\]?[^\d]*?((?:\d+\s*-\s*)+\d+)/gi;
  
  let match;
  while ((match = blockRegex.exec(html)) !== null) {
    const giorno = match[1].padStart(2, '0');
    const mese = mesi[match[2].toLowerCase()];
    const anno = match[3];
    const numeriStr = match[4];
    
    if (!mese) continue;
    
    const data = anno + '-' + mese + '-' + giorno;
    const numeri = numeriStr
      .split(/[\s\-]+/)
      .map(n => parseInt(n))
      .filter(n => n >= 1 && n <= 55)
      .slice(0, 5)
      .sort((a, b) => a - b);
    
    if (numeri.length === 5) {
      results.push({
        data,
        numeri,
        orario: '20:30',  // Default a sera
        concorso: parseInt(anno + mese + giorno) % 1000,
        extra: []
      });
    }
  }
  
  return results.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 60);
}

function updateProxyJS(estrazioni) {
  const proxyPath = path.join(__dirname, '..', 'api', 'proxy.js');
  
  if (!fs.existsSync(proxyPath)) {
    console.error('❌ File api/proxy.js non trovato');
    process.exit(1);
  }
  
  let content = fs.readFileSync(proxyPath, 'utf-8');
  
  // Sostituisci il blocco hardcoded MillionDay
  const marker = '// Dati hardcoded MillionDay — ultimi 12 sabati sera';
  const startIdx = content.indexOf(marker);
  const endIdx = content.indexOf('parsed = hardcodedMD.filter', startIdx);
  
  if (startIdx === -1 || endIdx === -1) {
    console.error('❌ Marker MillionDay non trovato in proxy.js');
    process.exit(1);
  }
  
  // Genera nuovo array JavaScript
  const dataStr = JSON.stringify(estrazioni, null, 2)
    .split('\n')
    .map(line => '      ' + line)
    .join('\n');
  
  const newBlock = `// Dati hardcoded MillionDay — ultimi 12 sabati sera
      const hardcodedMD = ${dataStr};
      `;
  
  const beforeMarker = content.substring(0, startIdx);
  const afterBlock = content.substring(endIdx);
  
  const newContent = beforeMarker + newBlock + '\n      ' + afterBlock;
  
  fs.writeFileSync(proxyPath, newContent, 'utf-8');
}

// Esegui
fetchMillionDayData();
