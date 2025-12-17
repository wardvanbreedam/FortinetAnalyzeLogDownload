import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const USER_DATA_DIR = "./pw-profile";
const TPL_FILE = "./templates.json";

const OUT_DIR = "./downloads";
const STATE_FILE = "./state.json";

fs.mkdirSync(OUT_DIR, { recursive: true });

const CONCURRENCY = 3;
const RETRIES = 5;

const DL_BASE = "https://portal.eu.fortigate.forticloud.com/newapi/v1/logrpt/logfiles/";
const VDOM = "root";

function loadState() {
  if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  return { done: {}, page: 1, offset: 0 };
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function pick(tpls, needle) {
  const k = Object.keys(tpls).find(u => u.includes(needle));
  if (!k) throw new Error(`Template ontbreekt voor ${needle}. Run capture-templates.mjs opnieuw.`);
  return tpls[k];
}

function cleanHeaders(h) {
  // we laten cookies staan (die zijn net belangrijk)
  const drop = new Set(["content-length", "host", "connection"]);
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    if (drop.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  // Zorg dat JSON post werkt
  if (!Object.keys(out).some(k => k.toLowerCase() === "content-type")) {
    out["Content-Type"] = "application/json";
  }
  return out;
}

function decodeIdToFilename(id) {
  try {
    const decoded = Buffer.from(id, "base64").toString("utf8");
    return decoded.replace(/[\/\\]/g, "_");
  } catch {
    return `${id}.log.gz`;
  }
}

function extractIds(json) {
  const arr =
    Array.isArray(json) ? json :
    Array.isArray(json?.data) ? json.data :
    Array.isArray(json?.items) ? json.items :
    Array.isArray(json?.result) ? json.result :
    Array.isArray(json?.records) ? json.records :
    [];

  const ids = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    for (const v of Object.values(it)) {
      if (typeof v === "string" && v.length > 20 && /^[A-Za-z0-9+/=]+$/.test(v)) {
        ids.push(v);
        break;
      }
    }
  }
  return ids;
}


async function getAnalyticsToken(request, tokenTpl) {
  const res = await request.fetch(tokenTpl.url, {
    method: "POST",
    headers: cleanHeaders(tokenTpl.headers),
    data: tokenTpl.payload ?? {},
  });
  if (!res.ok()) {
    const txt = await res.text().catch(() => "");
    fs.writeFileSync("./last-analyticstoken-error.txt", txt);
    throw new Error(`analyticstoken HTTP ${res.status()} (body in last-analyticstoken-error.txt)`);
  }
  const j = await res.json();
  return j.access_token;
}

async function downloadOne(request, id, outPath) {
  const url = `${DL_BASE}${id}?vdom=${encodeURIComponent(VDOM)}`;
  const res = await request.get(url);
  if (!res.ok()) throw new Error(`DL HTTP ${res.status()} ${url}`);
  const buf = await res.body();
  fs.writeFileSync(outPath, buf);
}

(async () => {
  if (!fs.existsSync(TPL_FILE)) {
    console.error(`❌ ${TPL_FILE} niet gevonden. Run capture-templates.mjs`);
    process.exit(1);
  }
  const tpls = JSON.parse(fs.readFileSync(TPL_FILE, "utf-8"));

  const tokenTpl = pick(tpls, "/api/v2/accountuser/current/analyticstoken");
  const listTpl  = pick(tpls, "/api/v2/analytics/logfiles");

  const state = loadState();

  // BELANGRIJK: zorg dat er geen ander "Google Chrome for Testing" openstaat met dezelfde pw-profile.
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, { headless: false });

// 1) Eerst UI openen zodat cookies/sessie zeker “warm” zijn
const page = await context.newPage();
await page.goto("https://portal.eu.fortigate.forticloud.com/ui/analytics/raw-logs", { waitUntil: "domcontentloaded" });
console.log("➡️ Als je login/MFA ziet: log in in dit Chromium-venster en laat het open.");
await page.getByRole("button", { name: /download/i }).waitFor({ timeout: 180000 });
console.log("✅ UI geladen, start API downloads…");

// 2) Dan pas API requests gebruiken (zelfde context = dezelfde cookies)
const request = context.request;

  // token ophalen met exact de echte headers/body
  const token = await getAnalyticsToken(request, tokenTpl);

  // lijst headers: neem de echte headers en injecteer Authorization (als de UI dat gebruikt)
  const listHeaders = cleanHeaders(listTpl.headers);
  listHeaders["Authorization"] = `Bearer ${token}`;

  const basePayload = listTpl.payload ?? {};
  const limit = basePayload.limit ?? basePayload.pageSize ?? basePayload.page_size ?? 50;

  const queue = [];
  let active = 0;

  async function worker(id) {
    const filename = decodeIdToFilename(id);
    const outPath = path.join(OUT_DIR, filename);

    if (state.done[id] || fs.existsSync(outPath)) {
      state.done[id] = true;
      return;
    }

    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        await downloadOne(request, id, outPath);
        state.done[id] = true;
        saveState(state);
        console.log(`✅ ${filename}`);
        return;
      } catch (e) {
        console.log(`⚠️ retry ${attempt}/${RETRIES} ${filename}: ${e.message}`);
        await sleep(800 * attempt);
      }
    }
    console.error(`❌ failed: ${filename}`);
  }

  async function pump() {
    while (active < CONCURRENCY && queue.length) {
      const id = queue.shift();
      active++;
      worker(id).finally(() => active--);
    }
    if (queue.length || active) {
      await sleep(200);
      return pump();
    }
  }

  let emptyRounds = 0;

  while (true) {
    const payload = { ...basePayload };
    if ("page" in basePayload) payload.page = state.page;
    if ("offset" in basePayload) payload.offset = state.offset;
    if ("skip" in basePayload) payload.skip = state.offset;

    console.log(`📥 list ophalen… page=${state.page} offset=${state.offset}`);

    const res = await request.fetch(listTpl.url, {
      method: "POST",
      headers: listHeaders,
      data: payload,
    });

    if (!res.ok()) {
      const txt = await res.text().catch(() => "");
      fs.writeFileSync("./last-logfiles-error.txt", txt);
      throw new Error(`logfiles HTTP ${res.status()} (body in last-logfiles-error.txt)`);
    }

    const json = await res.json();
    const ids = extractIds(json).filter(id => !state.done[id]);

    if (ids.length === 0) {
      emptyRounds++;
      fs.writeFileSync("./last-list-response.json", JSON.stringify(json, null, 2));
      console.log("⚠️ geen IDs gevonden; last-list-response.json opgeslagen.");
      if (emptyRounds >= 2) break;
    } else {
      emptyRounds = 0;
      ids.forEach(id => queue.push(id));
      await pump();
    }

    state.page += 1;
    state.offset += limit;
    saveState(state);

    console.log(`📊 gedownload: ${Object.keys(state.done).length}`);
  }

  await context.close();
})();
