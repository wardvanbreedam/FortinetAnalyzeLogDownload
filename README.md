# FortinetAnalyzeLogDownload

Bulk export & retentie tooling voor FortiGate Cloud / FortiAnalyzer raw logs.

Doel: dezelfde scripts die gebruikt zijn voor een uitvoering publiek en herbruikbaar maken voor andere klanten.

## Inhoud
- `capture-templates.mjs` — vangt echte API-headers/payloads via een Playwright Chromium-sessie
- `bulk-download3.mjs` — gebruikt de templates om logfiles bulk te downloaden
- `docs/FortiGate_Log_Retention_Manual_Generic.txt` — originele handleiding

## Snelstart
1. Installeer Node.js (via Homebrew):

```bash
brew install node
```


2. Initialiseer en installeer dependencies:

```bash
cd ~/Downloads/FortinetAnalyzeLogDownload
npm ci
npm run prepare
```

3. Templates capturen (in Chromium sessie, login + MFA):

```bash
npm run capture
# volg de instructies in Chromium, stel periode in en vernieuw de Raw Logs pagina
```

4. Bulk downloaden:

```bash
npm start
```

Let op: `pw-profile/` bevat browserprofiel (cookies/MFA) en wordt standaard genegeerd in `.gitignore`.

## CI (GitHub Actions)
Er is een eenvoudige workflow in `.github/workflows/node-ci.yml` die Node instelt, dependencies installeert en `npm test` draait (als aanwezig). Voor Playwright wordt `npx playwright install` uitgevoerd.

## Licentie
MIT — vrij te gebruiken.

## Push naar GitHub
Maak een publieke repo en push lokaal:

```bash
cd ~/Downloads/FortinetAnalyzeLogDownload
git init
git add .
git commit -m "Initial import: FortinetAnalyzeLogDownload"
# maak repo op GitHub (naam: FortinetAnalyzeLogDownload) en voeg remote toe
git remote add origin git@github.com:<your-username>/FortinetAnalyzeLogDownload.git
git branch -M main
git push -u origin main
```
