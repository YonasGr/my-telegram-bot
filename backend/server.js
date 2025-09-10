// server.js
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/binancep2p", async (req, res) => {
  try {
    const body = req.body || {
      page: 1,
      rows: 10,
      payTypes: ["BANK"],
      countries: ["ET"],
      fiat: "ETB",
      tradeType: "BUY",
      asset: "USDT"
    };

    const response = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Origin": "https://p2p.binance.com",
        "Referer": "https://p2p.binance.com/"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Binance P2P data" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Proxy running on port ${port}`));
