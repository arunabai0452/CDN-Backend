import express from "express";
import axios from "axios";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Enable __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load config
const configPath = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const resultsFile = path.join(__dirname, "results.json");
let latestResults = [];

// === Probes a CDN and measures latency ===
async function probeCDN(url) {
  const testUrl = url + config.testFile;
  const start = Date.now();
  try {
    const res = await axios.head(testUrl, { timeout: 3000 });
    const latency = Date.now() - start;
    return {
      cdn: url,
      status: res.status,
      latency,
      timestamp: new Date().toISOString()
    };
  } catch {
    return {
      cdn: url,
      status: "FAIL",
      latency: -1,
      timestamp: new Date().toISOString()
    };
  }
}

// === Runs CDN monitoring and updates results.json ===
async function runMonitor() {
  const results = [];
  for (const cdn of config.cdns) {
    const result = await probeCDN(cdn);
    console.log(`[${result.timestamp}] ${cdn} - ${result.status} - ${result.latency}ms`);
    results.push(result);
  }

  latestResults = results;
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
}

// Start monitor now and repeat at interval
runMonitor();
setInterval(runMonitor, config.intervalMs);

// === Express API Server ===
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public"))); // Serve frontend

// === /best-cdn API ===
app.get("/best-cdn", (req, res) => {
  const successful = latestResults.filter(r => r.status === 200 || r.status === "200");
  if (successful.length === 0) {
    return res.status(500).json({ error: "No healthy CDN found." });
  }

  // Sort by latency
  const sorted = successful.sort((a, b) => a.latency - b.latency);
  res.json({ cdns: sorted.map(r => r.cdn) });
});


// === /metrics API ===
app.get("/metrics", (req, res) => {
  try {
    const raw = fs.readFileSync(resultsFile, "utf-8");
    const data = JSON.parse(raw);
    console.log(data);
    const mapped = data.map(entry => {
      const hostname = new URL(entry.cdn).hostname;
      let name = "Unknown";

      if (hostname.includes("dynamiccdnswitch")) name = "Cloudflare";
      else if (hostname.includes("vercel")) name = "Vercel";
      else if (hostname.includes("netlify")) name = "Netlify";
      else if (hostname.includes("github")) name = "GitHub Pages";
      else name = hostname;

      return { ...entry, name };
    });

    res.json(mapped);
  } catch (err) {
    console.error("Error reading results:", err);
    res.status(500).json({ error: "Failed to load metrics." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 CDN Monitor API running at http://localhost:${PORT}`);
});
