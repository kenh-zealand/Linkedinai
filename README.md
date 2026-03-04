# LinkedIn Saved AI Export

Henter dine synlige gemte LinkedIn-indlaeg og eksporterer dem, der matcher AI-noegleord, til CSV.

## Setup

```bash
npm install
npx playwright install chromium
```

## Koer script

```bash
npm run scrape:linkedin:saved
```

Foerste gang aabnes en browser, hvor du logger ind paa LinkedIn. Tryk Enter i terminalen, naar login er gennemfoert.

Output skrives til:

`output/saved-ai-posts.csv`

## Valgfrie argumenter

```bash
node scripts/linkedin-saved-ai.js --maxScrolls 50 --output output/my-ai.csv --keywords "ai,llm,openai,anthropic"
```

- `--maxScrolls`: Hvor langt ned der scrolles i saved-listen.
- `--output`: Placering af CSV-fil.
- `--keywords`: Kommasepareret liste af ord til filtrering.
- `--headless`: Koer browseren uden UI (kun naar login-state allerede findes).

## Vigtigt

- Scriptet henter kun indlaeg, du har adgang til i din egen konto.
- "Saved items" er private; andre brugeres saved-lister kan ikke hentes.
- Brug scriptet i overensstemmelse med LinkedIns vilkaar.
