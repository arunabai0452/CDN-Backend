import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load config.json manually
const configPath = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const resultsFile = path.join(__dirname, "results.json");

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
  } catch (err) {
    return {
      cdn: url,
      status: "FAIL",
      latency: -1,
      timestamp: new Date().toISOString()
    };
  }
}

async function runMonitor() {
  const results = [];
  for (const cdn of config.cdns) {
    const result = await probeCDN(cdn);
    console.log(`[${result.timestamp}] ${cdn} - ${result.status} - ${result.latency}ms`);
    results.push(result);
  }

  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
}

runMonitor();
