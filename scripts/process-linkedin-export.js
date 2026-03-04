const fs = require("fs");
const path = require("path");

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
    input: "",
    outputAll: "output/export-all-posts.csv",
    outputAI: "output/export-ai-posts.csv",
    keywords: DEFAULT_KEYWORDS,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--input" && value) {
      args.input = value;
      i += 1;
    } else if (key === "--outputAll" && value) {
      args.outputAll = value;
      i += 1;
    } else if (key === "--outputAI" && value) {
      args.outputAI = value;
      i += 1;
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
  return `"${String(value).replace(/"/g, '""')}"`;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((vals) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? "";
    });
    return obj;
  });
}

function getAllFiles(target) {
  const out = [];
  const stats = fs.statSync(target);
  if (stats.isFile()) {
    out.push(target);
    return out;
  }
  const items = fs.readdirSync(target);
  for (const item of items) {
    const full = path.join(target, item);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...getAllFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function looksLikeLinkedInUrl(text) {
  return /https?:\/\/(www\.)?linkedin\.com\//i.test(text || "");
}

function canonicalUrl(raw) {
  if (!raw) return "";
  const urlMatch = String(raw).match(/https?:\/\/[^\s"]+/i);
  if (!urlMatch) return "";
  try {
    const u = new URL(urlMatch[0]);
    if (!u.hostname.includes("linkedin.com")) return "";
    const activity = u.pathname.match(/\/feed\/update\/urn:li:activity:(\d+)/);
    if (activity) {
      return `https://www.linkedin.com/feed/update/urn:li:activity:${activity[1]}`;
    }
    return `${u.origin}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function scoreIsAiRelated(text, keywords) {
  const lower = (text || "").toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function normalizeRow(row, sourceFile, keywords) {
  const keys = Object.keys(row);
  const textCells = [];
  let firstDate = "";
  let firstLinkedInUrl = "";

  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (!value) continue;
    const lowerKey = key.toLowerCase();

    if (!firstDate && /(date|time|created|saved|timestamp)/i.test(lowerKey)) {
      firstDate = value;
    }

    if (!firstLinkedInUrl && looksLikeLinkedInUrl(value)) {
      firstLinkedInUrl = canonicalUrl(value);
    }

    if (!/^(id|urn|entityurn|entity_urn)$/i.test(lowerKey)) {
      textCells.push(value);
    }
  }

  const snippet = textCells.join(" ").replace(/\s+/g, " ").trim().slice(0, 5000);
  if (snippet.length < 30) return null;

  const lower = snippet.toLowerCase();
  const matchedKeywords = keywords.filter((k) => lower.includes(k)).join("; ");

  return {
    sourceFile: path.basename(sourceFile),
    url: firstLinkedInUrl,
    detectedDateText: firstDate,
    snippet,
    matchedKeywords,
  };
}

function writeCsv(filePath, rows) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
  const header = ["sourceFile", "url", "detectedDateText", "snippet", "matchedKeywords"];
  const lines = [header.map(escapeCsv).join(",")];
  for (const r of rows) {
    lines.push(
      [r.sourceFile, r.url, r.detectedDateText, r.snippet, r.matchedKeywords]
        .map(escapeCsv)
        .join(","),
    );
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function run() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    throw new Error("Missing --input. Example: --input data/linkedin-export");
  }

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input path does not exist: ${inputPath}`);
  }
  if (inputPath.toLowerCase().endsWith(".zip")) {
    throw new Error("Input is a .zip. Unzip LinkedIn export first, then pass the folder path.");
  }

  const allFiles = getAllFiles(inputPath);
  const csvFiles = allFiles.filter((f) => f.toLowerCase().endsWith(".csv"));
  if (csvFiles.length === 0) {
    throw new Error("No CSV files found in input path.");
  }

  const normalized = [];
  for (const file of csvFiles) {
    const content = fs.readFileSync(file, "utf8");
    const rows = parseCsv(content);
    for (const row of rows) {
      const parsed = normalizeRow(row, file, args.keywords);
      if (parsed) normalized.push(parsed);
    }
  }

  const dedup = new Map();
  for (const row of normalized) {
    const key = row.url || row.snippet.slice(0, 180);
    if (!dedup.has(key)) dedup.set(key, row);
  }
  const allRows = Array.from(dedup.values());
  const aiRows = allRows.filter((r) => scoreIsAiRelated(r.snippet, args.keywords));

  writeCsv(args.outputAll, allRows);
  writeCsv(args.outputAI, aiRows);

  console.log(`CSV files scanned: ${csvFiles.length}`);
  console.log(`Normalized unique rows: ${allRows.length}`);
  console.log(`AI-matching rows: ${aiRows.length}`);
  console.log(`All rows CSV: ${path.resolve(args.outputAll)}`);
  console.log(`AI rows CSV: ${path.resolve(args.outputAI)}`);
}

run();
