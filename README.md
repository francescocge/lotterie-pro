# 10eLotto PRO — Deploy su Netlify

## Struttura del progetto

```
netlify-lotterie/
├── netlify.toml              ← configurazione Netlify
├── netlify/
│   └── functions/
│       └── proxy.js          ← funzione serverless (scarica dati reali)
└── public/
    └── index.html            ← l'app (10eLotto + MillionDay + Lotto)
```

## Come fare il deploy

### Prima volta

1. Vai su [netlify.com](https://netlify.com) e accedi
2. Clicca **"Add new site" → "Import an existing project"**
3. Collega il tuo GitHub e crea un nuovo repository con questa cartella
   - Oppure usa il drag & drop della cartella `netlify-lotterie` direttamente su Netlify
4. Nelle impostazioni build usa:
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
5. Clicca **Deploy**

### Aggiornamenti successivi

Trascina di nuovo la cartella su Netlify oppure fai push su GitHub.

---

## Come funziona

- L'app apre `index.html` dal tuo URL Netlify (es. `tuo-sito.netlify.app`)
- Quando premi **Aggiorna dati**, chiama `/.netlify/functions/proxy`
- La funzione serverless scarica i dati reali da lottologia.com lato server
- Niente proxy CORS, niente dati inventati

## Se i dati non arrivano

L'app mostrerà un errore chiaro. Possibili cause:
- lottologia.com ha cambiato struttura HTML → contatta per aggiornare il parser
- Netlify Functions non attive sul tuo piano (controllare in Site settings → Functions)

## Note

- I dati vengono cachati 1 ora dalla funzione (Cache-Control: max-age=3600)
- Le giocate personali sono salvate nel localStorage del browser
