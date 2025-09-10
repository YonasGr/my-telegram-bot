// server.js
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/binancep2p", async (req, res) => {
  try {
    const body = {
      page: req.body.page || 1,
      rows: req.body.rows || 10,
      payTypes: req.body.payTypes || [],
      fiat: req.body.fiat || "ETB",
      tradeType: req.body.tradeType || "BUY",
      asset: req.body.asset || "USDT"
      // 👇 countries is optional, only include if user sends it
    };
    if (req.body.countries) {
      body.countries = req.body.countries;
    }

    const response = await fetch(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
          "Origin": "https://p2p.binance.com",
          "Referer": "https://p2p.binance.com/"
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Failed to fetch Binance P2P data" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Proxy running on port ${port}`));
