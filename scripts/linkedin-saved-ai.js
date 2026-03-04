const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { chromium } = require("playwright");

const DEFAULT_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "ml",
  "llm",
  "gpt",
  "generative",
  "genai",
  "openai",
  "anthropic",
  "copilot",
  "prompt",
  "rag",
  "mcp",
];

function parseArgs(argv) {
  const args = {
    output: "output/saved-ai-posts.csv",
    maxScrolls: 30,
    headless: false,
    keywords: DEFAULT_KEYWORDS,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (key === "--output" && value) {
      args.output = value;
      i += 1;
    } else if (key === "--maxScrolls" && value) {
      args.maxScrolls = Number(value);
      i += 1;
    } else if (key === "--headless") {
      args.headless = true;
    } else if (key === "--keywords" && value) {
      args.keywords = value
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      i += 1;
    }
  }

  return args;
}

function escapeCsv(value) {
  if (value == null) return "";
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

function waitForEnter(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(promptText, () => {
      rl.close();
      resolve();
    });
  });
}

function isLikelyLoginPage(url) {
  return url.includes("/login") || url.includes("/checkpoint/");
}

async function ensureLoggedIn(page) {
  await page.goto("https://www.linkedin.com/my-items/saved-posts/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  if (isLikelyLoginPage(page.url())) {
    console.log("LinkedIn login required. Complete login in the browser window.");
    await waitForEnter("Press Enter when login is complete...");
    await page.goto("https://www.linkedin.com/my-items/saved-posts/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  }
}

function scoreIsAiRelated(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

async function collectVisibleItems(page) {
  return page.evaluate(() => {
    const uniq = new Set();
    const rows = [];
    const anchors = Array.from(
      document.querySelectorAll('main a[href*="/feed/update/"], main a[href*="/posts/"]'),
    );

    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();

    const canonicalizeUrl = (href) => {
      if (!href) return "";
      try {
        const u = new URL(href, window.location.origin);
        if (!u.hostname.includes("linkedin.com")) return "";

        // Prefer canonical activity URL to avoid duplicate query variants.
        const activity = u.pathname.match(/\/feed\/update\/urn:li:activity:(\d+)/);
        if (activity) {
          return `https://www.linkedin.com/feed/update/urn:li:activity:${activity[1]}`;
        }

        return `${u.origin}${u.pathname}`.replace(/\/$/, "");
      } catch {
        return "";
      }
    };

    const getBestContainer = (anchor) => {
      const candidates = [
        anchor.closest("article"),
        anchor.closest('li[data-urn], li'),
        anchor.closest('div[data-urn], div[data-id]'),
        anchor.closest("section"),
      ].filter(Boolean);

      if (candidates.length === 0) return anchor;

      let best = candidates[0];
      let bestLen = clean(best.innerText || "").length;

      for (const c of candidates.slice(1)) {
        const len = clean(c.innerText || "").length;
        if (len >= 80 && len <= bestLen) {
          best = c;
          bestLen = len;
        }
      }

      return best;
    };

    for (const anchor of anchors) {
      const url = canonicalizeUrl(anchor.href);
      if (!url) continue;

      const container = getBestContainer(anchor);
      const text = clean(container.innerText || "");

      // Skip tiny text blobs and giant layout wrappers.
      if (text.length < 80 || text.length > 3500) continue;

      const key = `${url}::${text.slice(0, 120)}`;
      if (uniq.has(key)) continue;
      uniq.add(key);

      const dateMatch = text.match(/\b(\d+\s*(d|u|h|min|sec|w|mo|yr))\b/i);
      rows.push({
        url,
        snippet: text.slice(0, 3500),
        detectedDateText: dateMatch ? dateMatch[0] : "",
      });
    }

    return rows;
  });
}

async function autoScroll(page) {
  await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.9)));
  await page.waitForTimeout(1500);
}

async function run() {
  const args = parseArgs(process.argv);
  const outputPath = path.resolve(args.output);
  const outputDir = path.dirname(outputPath);
  const authPath = path.resolve("auth", "linkedin-storage.json");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(authPath), { recursive: true });

  const context = await chromium.launchPersistentContext(path.resolve(".pw-user"), {
    headless: args.headless,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  try {
    await ensureLoggedIn(page);
    await context.storageState({ path: authPath });

    const collected = new Map();
    let lastCount = 0;
    let noGrowthStreak = 0;

    for (let i = 0; i < args.maxScrolls; i += 1) {
      const current = await collectVisibleItems(page);
      for (const item of current) {
        const key = item.url || item.snippet.slice(0, 180);
        if (!collected.has(key)) {
          collected.set(key, item);
        }
      }

      if (collected.size === lastCount) {
        noGrowthStreak += 1;
      } else {
        noGrowthStreak = 0;
      }
      lastCount = collected.size;

      if (noGrowthStreak >= 4) break;
      await autoScroll(page);
    }

    const aiRows = Array.from(collected.values()).filter((r) =>
      scoreIsAiRelated(r.snippet, args.keywords),
    );

    const csvLines = [
      ["url", "detectedDateText", "snippet", "matchedKeywords"].map(escapeCsv).join(","),
      ...aiRows.map((row) => {
        const lower = row.snippet.toLowerCase();
        const matched = args.keywords.filter((k) => lower.includes(k)).join("; ");
        return [
          escapeCsv(row.url),
          escapeCsv(row.detectedDateText),
          escapeCsv(row.snippet),
          escapeCsv(matched),
        ].join(",");
      }),
    ];

    fs.writeFileSync(outputPath, `${csvLines.join("\n")}\n`, "utf8");

    console.log(`Collected visible saved items: ${collected.size}`);
    console.log(`AI-matching rows exported: ${aiRows.length}`);
    console.log(`CSV: ${outputPath}`);
  } finally {
    await context.close();
  }
}

run().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
