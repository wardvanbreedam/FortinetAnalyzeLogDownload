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

