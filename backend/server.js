import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path"; // ✅ FIX: Import 'path'
import { fileURLToPath } from "url"; // ✅ Needed for ES module support
import { scrapeWebsite } from "./services/scraper.js";

dotenv.config();

// ✅ Ensure __dirname works in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, "scraped_data"); // ✅ FIX: Ensure correct path

// ✅ Scrape Route
app.post("/scrape", async (req, res) => {
    const { url, mode } = req.body; 

    if (!url || !url.startsWith("http")) {
        return res.status(400).json({ error: "Invalid URL provided" });
    }

    if (!mode || (mode !== "auto" && mode !== "manual")) {
        return res.status(400).json({ error: "Invalid mode. Use 'auto' or 'manual'." });
    }

    try {
        console.log(`🚀 Scraping requested for: ${url} (Mode: ${mode})`);
        const domain = new URL(url).hostname.replace("www.", "");
        const domainDir = path.join(DATA_DIR, domain);
        const filePath = path.join(domainDir, `selectors.json`);

        let suggestions = [];
        if (fs.existsSync(filePath) && mode === "manual") {
            suggestions = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            console.log(`📂 Found existing selectors for ${domain}, sending as suggestions.`);
        }

        const data = await scrapeWebsite(url, mode);

        if (!data || data.length === 0) {
            return res.status(500).json({ error: "Failed to extract content" });
        }

        res.json({ success: true, content: data, suggestions });
    } catch (error) {
        console.error("❌ Scraping error:", error);
        res.status(500).json({ error: "Server error while scraping" });
    }
});

// ✅ Save User Selected Elements
app.post("/saveSelections", async (req, res) => {
    const { url, selectedElements } = req.body;

    if (!url || !selectedElements || !Array.isArray(selectedElements)) {
        return res.status(400).json({ error: "Invalid data provided" });
    }

    try {
        const domain = new URL(url).hostname.replace("www.", "");
        const domainDir = path.join(DATA_DIR, domain);
        const filePath = path.join(domainDir, `selectors.json`);

        if (!fs.existsSync(domainDir)) {
            fs.mkdirSync(domainDir, { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(selectedElements, null, 2));
        console.log(`💾 User selections saved for ${domain}: ${filePath}`);

        res.json({ success: true, message: "Selections saved successfully!" });
    } catch (error) {
        console.error("❌ Error saving selections:", error);
        res.status(500).json({ error: "Failed to save selections." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

export default app;
