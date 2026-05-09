export default async function handler(req, res) {
  const { game, year } = req.query;
  
  if (!game || !year) {
    return res.status(400).json({ error: 'Parametri mancanti' });
  }

  try {
    const url = `https://www.immobiliare.it/api/lotterie/${game}/${year}`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error('Fonte non disponibile');
    
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}