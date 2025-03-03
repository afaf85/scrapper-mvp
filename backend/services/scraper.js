import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

// 🔹 Connect to Heroku Postgres
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false, // Required for Heroku Postgres
    },
});

// 🔹 Function to insert scraped data into the database
async function saveToDatabase(url, data) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS scraped_data (
                id SERIAL PRIMARY KEY,
                url TEXT NOT NULL,
                content JSONB NOT NULL,
                scraped_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(
            `INSERT INTO scraped_data (url, content) VALUES ($1, $2)`,
            [url, JSON.stringify(data)]
        );

        console.log(`✅ Data saved to Postgres for ${url}`);
    } catch (err) {
        console.error("❌ Database error:", err);
    } finally {
        client.release();
    }
}

// ✅ Define __dirname manually for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

puppeteer.use(StealthPlugin());

const DATA_DIR = path.join(__dirname, "../scraped_data"); // Adjust path if needed
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Launches a Puppeteer browser instance with an optimized viewport.
 * @returns {Promise<puppeteer.Browser>} Browser instance.
 */
async function launchBrowser() {
    return await puppeteer.launch({
        headless: "new",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-features=site-per-process",
            "--disable-software-rasterizer",
            "--window-size=1200,850", // Optimized size
        ],
    });
}

/**
 * Configures a Puppeteer page to render properly inside the viewport.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 */
async function configurePage(page) {
    const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    ];
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
    await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });    
    await page.setJavaScriptEnabled(true);

    await page.setViewport({ width: 1200, height: 850 });

    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 500;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
    
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 300);
        });
    });
    
}

/**
 * Ensures the page fully loads and adjusts the viewport dynamically.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 * @param {string} url - The URL to scrape.
 */
async function loadPage(page, url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
            await page.waitForSelector("body *", { timeout: 30000 });
            console.log("✅ Page loaded successfully!");
            return;
        } catch (error) {
            console.error(`🚨 Error loading page (attempt ${i + 1}/${retries}):`, error);
        }
    }
    throw new Error("❌ Failed to load page after multiple attempts.");
}


/**
 * Injects a UI overlay for user selection and displays instructions before interaction.
 * Allows users to click on elements (text or images) and categorize them.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 */
async function injectUserSelectionUI(page) {
    await page.evaluate(() => {
        console.log("🛠 Enhancing UI for element selection...");

        if (!window.selectedElements) window.selectedElements = [];

        let targetElement = null; // Store selected element

        // ✅ Create a welcome modal instead of alert
        const welcomeModal = document.createElement("div");
        Object.assign(welcomeModal.style, {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "white",
            padding: "20px",
            borderRadius: "10px",
            boxShadow: "0px 4px 8px rgba(0,0,0,0.3)",
            zIndex: "10005",
            width: "400px",
            textAlign: "center",
            fontSize: "16px"
        });
        welcomeModal.innerHTML = `
            <h3>📌 Welcome to the Web Scraper!</h3>
            <p>Instructions:</p>
            <ul style="text-align: left; font-size: 14px;">
                <li>1️⃣ Click on an element (text, image, price, etc.) to select it.</li>
                <li>2️⃣ Choose <strong>one</strong> category from the menu.</li>
                <li>3️⃣ The menu will close automatically after selection.</li>
                <li>4️⃣ Repeat the process for each new selection.</li>
            </ul>
            <button id="startScraping" style="padding: 10px 15px; background: #007BFF; color: white; border: none; border-radius: 5px; cursor: pointer;">✅ Start</button>
        `;
        document.body.appendChild(welcomeModal);
        document.getElementById("startScraping").addEventListener("click", () => {
            welcomeModal.remove();
        });

        // ✅ Create floating category menu
        const categoryMenu = document.createElement("div");
        categoryMenu.className = "scraper-ui category-menu";
        Object.assign(categoryMenu.style, {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%) scale(0.95)",
            padding: "15px",
            background: "white",
            border: "1px solid #ccc",
            borderRadius: "8px",
            boxShadow: "0px 4px 6px rgba(0,0,0,0.2)",
            zIndex: "10002",
            display: "none",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "10px",
            width: "400px",
            textAlign: "center",
            transition: "all 0.2s ease-in-out"
        });

        // ✅ Header for clarity
        const menuTitle = document.createElement("p");
        menuTitle.innerText = "Select a category for this element:";
        menuTitle.style.fontSize = "16px";
        menuTitle.style.fontWeight = "bold";
        menuTitle.style.marginBottom = "10px";
        categoryMenu.appendChild(menuTitle);

        // ✅ Define categories
        const categories = {
            content: ["Title", "Subtitle", "Description", "Price"],
            visuals: ["Image", "Video"],
            actions: ["Button", "Link", "CTA"],
        };

        // ✅ Create buttons for categories
        Object.values(categories).flat().forEach(cat => {
            const btn = document.createElement("button");
            btn.innerText = cat;
            Object.assign(btn.style, {
                padding: "8px 12px",
                cursor: "pointer",
                border: "none",
                borderRadius: "5px",
                background: "#007BFF",
                color: "white",
                fontSize: "14px",
                flex: "1 1 45%",
                textAlign: "center",
                transition: "all 0.2s ease-in-out"
            });
            btn.addEventListener("click", () => {
                if (targetElement) {
                    saveSelection(targetElement, cat.toLowerCase());
                    setTimeout(closeMenu, 100);
                }
            });
            categoryMenu.appendChild(btn);
        });

        // ✅ Ignore Button
        const ignoreButton = document.createElement("button");
        ignoreButton.innerText = "Ignore";
        Object.assign(ignoreButton.style, {
            padding: "8px 12px",
            cursor: "pointer",
            border: "none",
            borderRadius: "5px",
            background: "#DC3545",
            color: "white",
            fontSize: "14px",
            flex: "1 1 100%",
            textAlign: "center"
        });
        ignoreButton.addEventListener("click", () => {
            if (targetElement) {
                console.log("🚫 Ignored element:", targetElement);
                targetElement.style.border = "none";
                setTimeout(closeMenu, 100);
            }
        });
        categoryMenu.appendChild(ignoreButton);

        document.body.appendChild(categoryMenu);

        // ✅ Function to open the menu
        function openMenu(element) {
            targetElement = element;
            categoryMenu.style.display = "flex";
            categoryMenu.style.transform = "translate(-50%, -50%) scale(1)";
        }

        // ✅ Function to close the menu
        function closeMenu() {
            categoryMenu.style.display = "none";
            targetElement = null;
        }

        // ✅ Handle element selection
        document.body.addEventListener("click", (event) => {
            if (event.target.classList.contains("scraper-ui")) return;

            // Prevent interfering with forms, links, and inputs
            if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(event.target.tagName)) return;

            event.preventDefault(); // Prevent unwanted default actions only if necessary
            event.stopPropagation(); // Stop event bubbling

            targetElement = event.target;
            targetElement.style.border = "2px dashed blue"; // Use dashed border for better visibility
            openMenu(targetElement);
        });

        function saveSelection(element, category) {
            let extractedData = "";
            let selector = element.tagName.toLowerCase();
        
            // ✅ Generate a basic selector (ID > class > tag)
            if (element.id) {
                selector += `#${element.id}`;
            } else if (element.classList.length > 0) {
                selector += "." + Array.from(element.classList).join(".");
            }
        
            // ✅ Simplified Image Extraction (Captures all images, skips only when missing `src`)
            if (element.tagName.toLowerCase() === "img") {
                extractedData = {
                    src: element.src || element.getAttribute("data-src") || null,
                    alt: element.getAttribute("alt") || "No alt text",
                    role: element.getAttribute("role") || null,
                    class: element.className || null,
                    id: element.id || null
                };
        
                // 🚫 Skip only if no valid `src`
                if (!extractedData.src) {
                    console.warn("⚠️ Skipping image with no source:", element);
                    return;
                }
            } 
            // ✅ Generalized Button Extraction
            else if (element.tagName.toLowerCase() === "button") {
                extractedData = {
                    text: element.innerText.trim() || "No text",
                    href: element.getAttribute("formaction") || element.closest("a")?.href || null,
                    onclick: element.getAttribute("onclick") || null,
                    class: element.className || null,
                    id: element.id || null
                };
            } 
            // ✅ Generalized Link Extraction
            else if (element.tagName.toLowerCase() === "a") {
                extractedData = {
                    text: element.innerText.trim() || "No text",
                    href: element.href ? element.href.trim() : null,
                    class: element.className || null,
                    id: element.id || null
                };
            } 
            // ✅ Generalized Text Extraction (Includes Background Images)
            else {
                let bgImage = window.getComputedStyle(element).backgroundImage;
                if (bgImage && bgImage !== "none") {
                    extractedData = {
                        backgroundImage: bgImage.replace(/url\(|\)|"/g, ""),
                        text: element.innerText.trim() || element.title || element.alt || "No text available"
                    };
                } else {
                    extractedData = element.innerText.trim() || element.title || element.alt || "No text available";
                }
            }
        
            // ✅ Ensure structured data
            const selectedElement = {
                type: category,
                selector: selector,
                value: extractedData
            };
        
            // ✅ Save to global selection array
            if (!window.selectedElements) window.selectedElements = [];
            window.selectedElements.push(selectedElement);
        
            // ✅ Send data to React via postMessage
            window.postMessage({ type: "scraper-data", payload: window.selectedElements }, "*");
        
            console.log(`✅ Saved selection:`, selectedElement);
        }
        
        
        
        
            
                
        // ✅ Done Button to finalize
         const doneButton = document.createElement("button");
         doneButton.innerText = "Done";
         Object.assign(doneButton.style, {
             position: "fixed",
             top: "15px",
             left: "50%",
             transform: "translateX(-50%)",
             padding: "10px 20px",
             zIndex: "10002",
             backgroundColor: "#28a745",
             color: "white",
             fontSize: "16px",
             border: "none",
             borderRadius: "5px",
             cursor: "pointer",
             boxShadow: "0px 4px 6px rgba(0,0,0,0.2)"
         });
 
         doneButton.addEventListener("click", () => {
             if (window.selectedElements.length > 0) {
                 doneButton.setAttribute("data-done", "true");
                 console.log("✅ User finished selection. Data collected:", window.selectedElements);
             } else {
                 alert("❌ No elements selected.");
             }
         });
 
         document.body.appendChild(doneButton);
     });
 }


/**
 * Sanitizes a URL into a valid filename.
 * @param {string} url - The URL to sanitize.
 * @returns {string} - Sanitized filename.
 */
function sanitizeFilename(url) {
    return (
        new URL(url).hostname.replace("www.", "").replace(/[\/:*?"<>|]/g, "_") +
        "_" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        ".json"
    );
}

/**
 * Main function to scrape user-selected elements from a given URL.
 * @param {string} url - The URL to scrape.
 * @returns {Promise<object[]>} Extracted user-selected data.
 */
async function scrapeWebsite(url, mode = "manual") {
    const browser = await puppeteer.launch({
        headless: "new",
        protocolTimeout: 120000,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--start-maximized"
        ]
    });

    const page = await browser.newPage();
    
    try {
        await configurePage(page);

        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
        } catch (error) {
            console.warn("⚠️ Page navigation failed, but continuing...");
        }

        try {
            await page.waitForSelector("body", { timeout: 30000 });
            console.log("✅ Body loaded.");
        } catch (error) {
            console.warn("⚠️ Body not found, but continuing...");
        }

        console.log("🚀 Page is interactive, moving forward...");

        const domain = new URL(url).hostname.replace("www.", "");
        const domainDir = path.join(DATA_DIR, domain);
        if (!fs.existsSync(domainDir)) fs.mkdirSync(domainDir, { recursive: true });

        const selectorsPath = path.join(domainDir, "selectors.json");

        // ✅ Load existing selectors (if any)
        let storedSelectors = [];
        if (fs.existsSync(selectorsPath)) {
            try {
                storedSelectors = JSON.parse(fs.readFileSync(selectorsPath, "utf8"));
            } catch (error) {
                console.error("🚨 Error reading stored selectors:", error);
            }
        }

        let autoScrapedElements = [];
        let selectedElements = [];

        if (mode === "auto") {
            console.log("⏳ Waiting for images to fully load...");
            
            await page.waitForFunction(() => {
                const images = document.querySelectorAll("img");
                return Array.from(images).every(img => img.complete && img.naturalHeight > 0);
            }, { timeout: 10000 });
        
            console.log("✅ Images are fully loaded!");

            // ✅ Always perform auto-scraping
            console.log("⚠️ Running full auto-scraping...");
            autoScrapedElements = await extractWithAutoClassification(page);
            console.log("✅ Auto-classified elements:", autoScrapedElements);

            // ✅ If stored selectors exist, use them as well
            if (storedSelectors.length > 0) {
                console.log("⚠️ Merging stored selectors with auto-scraped data...");
                const storedData = await extractWithStoredSelectors(page, storedSelectors);
                console.log("✅ Stored selector data:", storedData);

                // ✅ Merge stored selector data into auto-scraped data (avoid duplicates)
                selectedElements = [...autoScrapedElements, ...storedData.filter(storedItem => 
                    !autoScrapedElements.some(autoItem => autoItem.selector === storedItem.selector)
                )];
            } else {
                selectedElements = autoScrapedElements;
            }
        } else {
            // ✅ Manual Mode: User selects elements
            await injectUserSelectionUI(page);
            await page.waitForFunction(() => document.querySelector("button[data-done='true']") !== null, { polling: "raf", timeout: 0 });
        
            selectedElements = await page.evaluate(() => window.selectedElements || []);
        }

        // ✅ Save extracted data with values
        if (selectedElements.length > 0) {
            await saveToDatabase(url, selectedElements);  // ✅ Save to Heroku Postgres
            console.log(`✅ Data saved to database for: ${url}`);
        } else {
            console.log(`⚠️ No elements selected, skipping save.`);
        }
        

        return selectedElements;
    } catch (error) {
        console.error("🚨 Error scraping website:", error);
        return [{ message: "Oops! Something went wrong while scraping." }];
    } finally {
        await browser.close();
    }
}


async function extractWithStoredSelectors(page, storedSelectors) {
    console.log("⏳ Waiting for images to fully load...");

    await page.evaluate(async () => {
        const images = document.querySelectorAll("img");
        const promises = [];

        images.forEach(img => {
            if (!img.complete || img.naturalHeight === 0) {
                promises.push(new Promise(resolve => {
                    img.onload = img.onerror = resolve; // Wait for load/error
                }));
            }
        });

        await Promise.all(promises);
    });

    console.log("✅ All images loaded!");

    const extractedData = [];

    for (const { type, selector } of storedSelectors) {
        try {
            const element = await page.$(selector);
            if (element) {
                let value = "";

                if (type === "image") {
                    value = await page.evaluate(el => ({
                        src: el.src || el.getAttribute("data-src") || null,
                        alt: el.getAttribute("alt") || "No alt text",
                        class: el.className || null,
                        id: el.id || null
                    }), element);

                    // 🚫 Skip only if no valid `src`
                    if (!value.src) {
                        console.warn("⚠️ Skipping image with no source:", selector);
                        continue;
                    }
                } 
                else {
                    value = await page.evaluate(el => el.textContent.trim() || "No content available", element);
                }

                extractedData.push({ type, selector, value });
            }
        } catch (error) {
            console.error(`❌ Failed to extract ${selector}:`, error);
        }
    }

    console.log(`✅ Extracted elements:`, extractedData);
    return extractedData;
}

async function extractWithAutoClassification(page, url) {
    console.log("⏳ Starting auto-scraping...");

    try {
        await page.goto(url, { waitUntil: "load", timeout: 60000 });

        // Debugging: Screenshot before scraping
        await page.screenshot({ path: "debug_before_wait.png", fullPage: true });

        // Ensure body is loaded
        try {
            await page.waitForSelector("body", { timeout: 30000 });
        } catch (error) {
            console.warn("⚠️ Body not found! Returning fallback data.");
            return { status: "error", extractedData: [{ type: "error", value: "Page not loaded properly" }] };
        }

        console.log("✅ Page fully loaded, preparing for data extraction...");

        // Scroll down to trigger lazy loading
        await page.evaluate(async () => {
            await new Promise(resolve => {
                let totalHeight = 0;
                let distance = 800;
                let scrollInterval = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(scrollInterval);
                        resolve();
                    }
                }, 300);
            });
        });

        console.log("✅ Scrolling completed.");

        // **Wait for at least one image, but don't fail if none exist**
        await page.waitForSelector("img", { timeout: 15000 }).catch(() => console.warn("⚠️ No images detected!"));

        console.log("✅ Extracting data...");

        // **Data Extraction with Universal Fallback**
        const extractedData = await page.evaluate(() => {
            if (!document.body) {
                return [{ type: "error", value: "No body content found" }];
            }

            const autoClassifiedData = [];

            // **Extract visible text as fallback**
            const visibleText = document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 500) || "No visible content available";

            // **Extract first image (if available)**
            const firstImage = document.querySelector("img") ? document.querySelector("img").src : "No images found";

            // **Extract first button (if available)**
            const firstButton = document.querySelector("button") ? document.querySelector("button").innerText.trim() : "No buttons found";

            // **Push extracted data**
            autoClassifiedData.push({ type: "text", value: visibleText });
            autoClassifiedData.push({ type: "image", value: firstImage });
            autoClassifiedData.push({ type: "button", value: firstButton });

            // **Ensure at least one valid data entry**
            if (autoClassifiedData.length === 0) {
                return [{ type: "fallback", value: document.documentElement.innerText.slice(0, 500) || "No content available" }];
            }

            return autoClassifiedData;
        });

        console.log(`✅ Extracted ${extractedData.length} elements`);
        
        return { status: "success", extractedData };

    } catch (error) {
        console.error("🚨 Critical error during scraping:", error);
        return { status: "error", extractedData: [{ type: "error", value: "Timeout while scraping" }] };
    }
}







export { scrapeWebsite };
