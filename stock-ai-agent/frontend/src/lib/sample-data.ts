import type { StockAnalysis } from "@/components/stock-chat/chat-message"

export const SAMPLE_ANALYSES: Record<string, StockAnalysis> = {
  INFY: {
    symbol: "INFY",
    name: "Infosys Limited",
    price: 1275.5,
    change: -18.35,
    changePercent: -1.42,
    sparkData: [1350, 1380, 1340, 1310, 1295, 1320, 1280, 1260, 1290, 1275],
    sector: "IT Services",
    buyScore: 20,
    riskScore: 75,
    technicals: [
      { label: "RSI (14)", value: "17.1", signal: "bearish" },
      { label: "Close", value: "1,275.50", signal: "neutral" },
      { label: "EMA 20", value: "1,443.38", signal: "bearish" },
      { label: "EMA 50", value: "1,522.30", signal: "bearish" },
      { label: "MACD Hist", value: "-16.93", signal: "bearish" },
      { label: "ATR", value: "48.00", signal: "neutral" },
    ],
    fundamentals: [
      { label: "PE Ratio", value: "16.74", signal: "bullish" },
      { label: "ROE", value: "32.7%", signal: "bullish" },
      { label: "Debt / Equity", value: "0.11", signal: "bullish" },
      { label: "Rev. Growth", value: "3.2%", signal: "neutral" },
    ],
    analysisSummary:
      "Mixed signals for INFY. Strong fundamentals with low PE and high ROE, but severe technical weakness with RSI in oversold territory and price below key moving averages.",
    analysisPoints: [
      {
        type: "bullish",
        text: "Low PE Ratio of 16.74 suggests the stock may be undervalued relative to earnings.",
      },
      {
        type: "bullish",
        text: "ROE of 32.7% indicates efficient profit generation from equity.",
      },
      {
        type: "bullish",
        text: "Debt/Equity ratio of 0.11 shows very conservative leverage.",
      },
      {
        type: "bearish",
        text: "RSI of 17.1 is extremely low, indicating heavy selling pressure.",
      },
      {
        type: "bearish",
        text: "Price trading well below both EMA 20 and EMA 50, confirming downtrend.",
      },
      {
        type: "bearish",
        text: "Negative MACD Histogram suggests bearish momentum continues.",
      },
      {
        type: "neutral",
        text: "Revenue Growth of 3.2% is moderate, neither strong nor concerning.",
      },
    ],
    verdict:
      "Exercise caution. While fundamentals are solid, the stock is in a strong downtrend. Consider waiting for technical confirmation of a reversal before entry.",
    verdictType: "bearish",
  },
  AAPL: {
    symbol: "AAPL",
    name: "Apple Inc.",
    price: 232.15,
    change: 3.47,
    changePercent: 1.52,
    sparkData: [220, 222, 225, 223, 228, 230, 227, 229, 231, 232],
    sector: "Technology",
    buyScore: 72,
    riskScore: 35,
    technicals: [
      { label: "RSI (14)", value: "62.4", signal: "bullish" },
      { label: "Close", value: "232.15", signal: "bullish" },
      { label: "EMA 20", value: "228.50", signal: "bullish" },
      { label: "EMA 50", value: "224.10", signal: "bullish" },
      { label: "MACD Hist", value: "1.85", signal: "bullish" },
      { label: "ATR", value: "5.20", signal: "neutral" },
    ],
    fundamentals: [
      { label: "PE Ratio", value: "31.2", signal: "neutral" },
      { label: "ROE", value: "147.5%", signal: "bullish" },
      { label: "Debt / Equity", value: "1.76", signal: "bearish" },
      { label: "Rev. Growth", value: "8.1%", signal: "bullish" },
    ],
    analysisSummary:
      "Strong bullish setup for AAPL. Price above key moving averages with positive momentum. Fundamentals support premium valuation with exceptional ROE.",
    analysisPoints: [
      {
        type: "bullish",
        text: "RSI at 62.4 shows healthy bullish momentum without being overbought.",
      },
      {
        type: "bullish",
        text: "Price above both EMA 20 and EMA 50 confirms uptrend.",
      },
      {
        type: "bullish",
        text: "Positive MACD Histogram indicates strengthening momentum.",
      },
      {
        type: "bullish",
        text: "Revenue growth of 8.1% demonstrates solid business execution.",
      },
      {
        type: "bearish",
        text: "Debt/Equity of 1.76 is relatively high, though manageable for Apple.",
      },
      {
        type: "neutral",
        text: "PE Ratio of 31.2 is premium but typical for a mega-cap tech leader.",
      },
    ],
    verdict:
      "Favorable outlook. Technical and fundamental indicators align for continued upside. Good entry point with a stop-loss below EMA 50.",
    verdictType: "bullish",
  },
  TSLA: {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    price: 342.8,
    change: -5.2,
    changePercent: -1.49,
    sparkData: [360, 355, 350, 358, 345, 340, 348, 344, 338, 343],
    sector: "Automotive",
    buyScore: 45,
    riskScore: 68,
    technicals: [
      { label: "RSI (14)", value: "44.2", signal: "neutral" },
      { label: "Close", value: "342.80", signal: "neutral" },
      { label: "EMA 20", value: "349.60", signal: "bearish" },
      { label: "EMA 50", value: "355.20", signal: "bearish" },
      { label: "MACD Hist", value: "-3.10", signal: "bearish" },
      { label: "ATR", value: "18.50", signal: "neutral" },
    ],
    fundamentals: [
      { label: "PE Ratio", value: "68.5", signal: "bearish" },
      { label: "ROE", value: "22.3%", signal: "bullish" },
      { label: "Debt / Equity", value: "0.08", signal: "bullish" },
      { label: "Rev. Growth", value: "12.4%", signal: "bullish" },
    ],
    analysisSummary:
      "Neutral stance for TSLA. Technicals are weakening with price below moving averages, but fundamentals show strong growth potential with minimal debt.",
    analysisPoints: [
      {
        type: "neutral",
        text: "RSI at 44.2 is neutral, neither oversold nor overbought.",
      },
      {
        type: "bearish",
        text: "Price below both EMA 20 and EMA 50 indicates near-term weakness.",
      },
      {
        type: "bearish",
        text: "High PE Ratio of 68.5 prices in significant future growth expectations.",
      },
      {
        type: "bullish",
        text: "Near-zero Debt/Equity shows extremely strong balance sheet.",
      },
      {
        type: "bullish",
        text: "Revenue Growth of 12.4% remains impressive for the scale.",
      },
    ],
    verdict:
      "Wait for clarity. The stock is in a consolidation phase. A break above EMA 20 could signal renewed bullish momentum.",
    verdictType: "neutral",
  },
}

// export function getAnalysis(symbol: string): StockAnalysis | null {
//   return SAMPLE_ANALYSES[symbol.toUpperCase()] ?? null
// }

export const QUICK_SUGGESTIONS = [
  "Analyze INFY for long term",
  "Should I buy AAPL?",
  "TSLA technical analysis",
  "Compare tech stocks",
]
