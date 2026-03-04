# LinkedIn Export AI Processing

Compliant flow: brug LinkedIns officielle data-export og process CSV lokalt.

## Setup

```bash
npm install
```

## 1) Hent officiel LinkedIn export

1. LinkedIn -> Settings & Privacy -> Data privacy -> Get a copy of your data
2. Download zip-filen fra LinkedIn
3. Udpak zip til en lokal mappe, fx `data/linkedin-export`

## 2) Process export lokalt (ingen scraping)

```bash
npm run process:linkedin:export -- --input data/linkedin-export
```

Output:

- `output/export-all-posts.csv`
- `output/export-ai-posts.csv`

## Valgfrie argumenter

```bash
node scripts/process-linkedin-export.js --input data/linkedin-export --outputAll output/all.csv --outputAI output/ai.csv --keywords "ai,llm,openai,anthropic"
```

- `--input`: Mappe med udpakket LinkedIn export
- `--outputAll`: CSV med alle normaliserede poster
- `--outputAI`: CSV med AI-filtrerede poster
- `--keywords`: Kommasepareret liste af noegleord

## Legacy (ikke anbefalet)

Der findes stadig et tidligere browser-script:

```bash
npm run scrape:linkedin:saved
```

Dette er automatiseret scraping og kan vaere i konflikt med LinkedIns vilkaar.

## Vigtigt

- Denne metode scraper ikke LinkedIn web UI.
- Du arbejder kun paa data, som LinkedIn officielt har udleveret til dig.
