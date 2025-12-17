import { chromium } from "playwright";
import fs from "node:fs";

const URL = "https://portal.eu.fortigate.forticloud.com/ui/analytics/raw-logs";
const USER_DATA_DIR = "./pw-profile";

const OUT = "./templates.json";

const want = (u) =>
  u.includes("/api/v2/accountuser/current/analyticstoken") ||
  u.includes("/api/v2/analytics/logfiles");

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
  });
  const page = await context.newPage();

  const templates = {};

  page.on("request", async (req) => {
    const url = req.url();
    if (req.method() === "POST" && want(url)) {
      templates[url] = {
        url,
        method: "POST",
        headers: req.headers(),
        payload: (() => {
          const body = req.postData() || "";
          try { return JSON.parse(body); } catch { return body; }
        })(),
      };
      fs.writeFileSync(OUT, JSON.stringify(templates, null, 2));
      console.log(`✅ template opgeslagen voor: ${url}`);
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("/api/v2/accountuser/current/analyticstoken")) {
      try {
        const j = await res.json();
        templates[url] = templates[url] || { url, method: "POST", headers: {}, payload: {} };
        templates[url].sample_response = j;
        fs.writeFileSync(OUT, JSON.stringify(templates, null, 2));
        console.log("✅ analyticstoken response mee opgeslagen (templates.json)");
      } catch {}
    }
  });

  await page.goto(URL, { waitUntil: "domcontentloaded" });

  console.log("\n➡️ In Chromium:");
  console.log("1) Log in + MFA");
  console.log("2) Zorg dat je op Raw Logs zit");
  console.log("3) Doe Cmd+R of wijzig periode zodat de lijst herlaadt");
  console.log("   (dan vuren analyticstoken + logfiles calls af)\n");
})();
