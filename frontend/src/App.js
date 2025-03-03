import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { templates } from "./bannerTemplates"; // Importing templates
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import "./App.css";

function App() {
  const [url, setUrl] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedElements, setSelectedElements] = useState({});
  const bannerRefs = useRef({});
  const [mode, setMode] = useState("manual"); // Default to "manual"

  // 📌 Scrape data from the entered product URL
  const handleScrape = async () => {
    if (!url.trim()) {
      setError("Please enter a valid URL.");
      return;
    }

    setLoading(true);
    setError("");
    setData(null);

    try {
      const response = await axios.post("http://localhost:3000/scrape", { url, mode });

      console.log("📥 Scraped data received:", response.data);

      if (response.data && Array.isArray(response.data)) {
        setData(response.data);
      } else if (response.data && Array.isArray(response.data.content)) {
        setData(response.data.content);
      } else {
        console.error("⚠️ Unexpected response structure:", response.data);
        setError("Invalid data format received.");
      }
    } catch (err) {
      setError("Failed to fetch data. Please check the URL.");
    }

    setLoading(false);
  };

  // 📌 Group scraped data into categories (title, image, price, etc.)
  const groupDataByCategory = () => {
    if (!data || !Array.isArray(data)) return {};

    return data.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item.value || "No Content"); 
      return acc;
    }, {});
  };

  const groupedData = groupDataByCategory();

  // 📌 Handle selection of scraped elements (title, image, price, etc.)
  const handleSelect = (type, value) => {
    setSelectedElements((prev) => ({
      ...prev,
      [type]: value,
    }));
  };

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === "scraper-data") {
        console.log("📥 Received scraper data:", event.data.payload);

        if (Array.isArray(event.data.payload)) {
          setData(event.data.payload);
          setSelectedElements(
            event.data.payload.reduce((acc, item) => {
              acc[item.type] = item.value || "No Content";
              return acc;
            }, {})
          );
        } else {
          console.error("⚠️ Unexpected message format:", event.data.payload);
        }
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  // 📌 Download the banner as PNG
  const downloadAsImage = async (templateId) => {
    if (!bannerRefs.current[templateId]) return;

    const element = bannerRefs.current[templateId];

    html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
    }).then((canvas) => {
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${templateId}.png`;
      link.click();
    });
  };

  // 📌 Download the banner as PDF
  const downloadAsPDF = async (templateId) => {
    if (!bannerRefs.current[templateId]) return;

    const element = bannerRefs.current[templateId];

    html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
    }).then((canvas) => {
      const pdf = new jsPDF("p", "mm", "a4");
      const imgData = canvas.toDataURL("image/png");

      pdf.setFont("helvetica");
      pdf.setFontSize(16);
      pdf.text("Generated Ad Banner", 15, 20);

      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 10, 30, imgWidth, imgHeight);
      pdf.save(`${templateId}.pdf`);
    });
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Web Scraper & Ad Generator</h1>
        <p>Enter a product URL and extract elements for your ad.</p>

        <input
          type="text"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <label htmlFor="mode">Selection Mode:</label>
        <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="manual">Manual</option>
          <option value="auto">Auto</option>
        </select>

        <button onClick={handleScrape} disabled={loading}>
          {loading ? "Scraping..." : "Start Scraping"}
        </button>

        {error && <p className="error-message">⚠️ {error}</p>}

        {data && (
          <div className="selection-container">
            <h2>Select Elements for Your Banner</h2>
            <p className="instructions">
              Click on the text elements in the preview below to edit them before downloading.
            </p>

            {Object.entries(groupedData).map(([category, values], index) => (
              <div key={index} className="selection-section">
                <h3>{category.charAt(0).toUpperCase() + category.slice(1)}</h3>

                {values.map((value, idx) => (
                  <button
                    key={idx}
                    className={`select-button ${selectedElements[category] === value ? "selected" : ""}`}
                    onClick={() => handleSelect(category, value)}
                  >
                    {category === "image" && value.src ? (
                      <img
                        src={value.src}
                        alt={value.alt || "Selectable"}
                        className="select-img"
                        style={{
                          maxWidth: "150px",
                          maxHeight: "150px",
                          objectFit: "contain",
                          border: "1px solid #ddd",
                          borderRadius: "5px",
                        }}
                        onError={(e) => (e.target.src = "/fallback-image.jpg")}
                      />
                    ) : (
                      value
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </header>

      {Object.keys(selectedElements).length > 0 && (
        <div className="banner-container">
          <h2>Preview & Download Banner</h2>
          <p className="instructions">
            **Instructions:** Click on the text elements for edits. When ready, click **Download as Image** or **Download as PDF**.
          </p>

          {Object.keys(templates).map((templateId) => (
            <div key={templateId} className="banner-preview-container">
              <div ref={(el) => (bannerRefs.current[templateId] = el)} className="banner-preview">
                <div dangerouslySetInnerHTML={{ __html: templates[templateId](selectedElements) }} />
              </div>

              <button className="download-button" onClick={() => downloadAsImage(templateId)}>
                Download as Image
              </button>
              <button className="download-button" onClick={() => downloadAsPDF(templateId)}>
                Download as PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
