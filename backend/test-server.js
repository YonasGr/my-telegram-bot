// Simple test server to verify chart generation works
import express from "express";
import { generateChartImageUrl, generateCandlestickChart, generateComparisonChart } from "./charts.js";

const app = express();

// Basic CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Chart generation endpoints
app.get('/api/chart', async (req, res) => {
  try {
    const { prices, coinName, days = 7, width = 800, height = 400, backgroundColor = 'rgba(17,17,17,0.9)', lineColor = '#00ff88', fillColor = 'rgba(0, 255, 136, 0.1)' } = req.query;
    
    if (!prices) {
      return res.status(400).json({ error: 'Price data is required' });
    }
    
    let pricesArray;
    try {
      pricesArray = JSON.parse(prices);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid price data format' });
    }
    
    const chartUrl = generateChartImageUrl(pricesArray, coinName || 'Cryptocurrency', parseInt(days), {
      width: parseInt(width),
      height: parseInt(height),
      backgroundColor,
      lineColor,
      fillColor
    });
    
    res.json({ success: true, chartUrl });
  } catch (error) {
    console.error('Chart generation error:', error);
    res.status(500).json({ error: 'Failed to generate chart', message: error.message });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`🚀 Test server running on port ${port}`);
  console.log(`📍 Health check available at http://localhost:${port}/health`);
});