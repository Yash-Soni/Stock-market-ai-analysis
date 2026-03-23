// import React, { useState } from "react";
// import ReactMarkdown from "react-markdown";

// export default function StockAgentUI() {
//   const [symbol, setSymbol] = useState("RELIANCE");
//   const [message, setMessage] = useState("Should I invest in this for long term ?");
//   const [loading, setLoading] = useState(false);
//   const [history, setHistory] = useState([]);

//   const sendMessage = async () => {
//     if (!symbol || !message) return;
//     setLoading(true);

//     try {
//       const res = await fetch("http://localhost:3000/chat", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({ symbol, message }),
//       });

//       const data = await res.json();

//       setHistory((prev: any[]) => [
//         ...prev,
//         {
//           symbol: data.symbol,
//           score: data.score,
//           rsi: data.rsi,
//           ema20: data.ema20,
//           ema50: data.ema50,
//           macd_hist: data.macd_hist,
//           close: data.close,
//           risk: data.risk,
//           atr: data.atr,
//           pe: data.pe,
//           roe: data.roe,
//           debtToEquity: data.debtToEquity,
//           revenueGrowth: data.revenueGrowth,
//           reply: data.reply,
//           question: message,
//         },
//       ]);

//       setMessage("");
//     } catch (err) {
//       console.error(err);
//     }

//     setLoading(false);
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/30 p-6 flex items-center justify-center">
//       <div className="w-full max-w-2xl bg-white/90 backdrop-blur rounded-2xl shadow-xl border border-slate-200/60 p-6 space-y-4">
//         <h1 className="text-2xl font-bold text-slate-800 tracking-tight">📊 Stock AI Agent</h1>

//         <input
//           type="text"
//           placeholder="Enter Stock Symbol (e.g. RELIANCE)"
//           value={symbol}
//           onChange={(e) => setSymbol(e.target.value.toUpperCase())}
//           className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 outline-none transition"
//         />

//         <input
//           type="text"
//           placeholder="Ask something (e.g. Is this a good buying opportunity?)"
//           value={message}
//           onChange={(e) => setMessage(e.target.value)}
//           className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 outline-none transition"
//         />

//         <button
//           onClick={sendMessage}
//           disabled={loading}
//           className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-400 text-white font-semibold p-3 rounded-xl shadow-md hover:shadow-lg transition"
//         >
//           {loading ? "Analyzing..." : "Analyze"}
//         </button>

//         <div className="space-y-5 mt-6">
//           {history.map((item: any, idx: number) => {
//             const scoreNum = Number(item.score);
//             const riskNum = Number(item.risk);
//             const rsiNum = Number(item.rsi);
//             const macdNum = Number(item.macd_hist);
//             const accent = scoreNum >= 60 ? "emerald" : scoreNum >= 40 ? "amber" : "rose";

//             const fmtClose = (v: number) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—");
//             const fmtNum = (v: number) => (Number.isFinite(v) ? Number(v).toFixed(2) : "—");
//             const fmtPct = (v: number) => (v <= 1 && v >= 0 ? `${(v * 100).toFixed(1)}%` : `${Number(v).toFixed(1)}%`);

//             return (
//               <div
//                 key={idx}
//                 className={`rounded-2xl overflow-hidden border-2 shadow-md ${
//                   accent === "emerald" ? "border-emerald-200/60 bg-gradient-to-b from-emerald-50/50 to-white" :
//                   accent === "amber" ? "border-amber-200/60 bg-gradient-to-b from-amber-50/30 to-white" :
//                   "border-rose-200/60 bg-gradient-to-b from-rose-50/30 to-white"
//                 }`}
//               >
//                 <div className="p-4 sm:p-5">
//                   <div className="flex flex-wrap items-center gap-3 mb-1">
//                     <span className="text-xl font-extrabold text-slate-800 tracking-tight">{item.symbol}</span>
//                     <p className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
//                       accent === "emerald" ? "bg-emerald-500 text-white" :
//                       accent === "amber" ? "bg-amber-500 text-white" :
//                       "bg-rose-500 text-white"
//                     }`}>
//                       Score {item.score ?? "—"}/100
//                     </p>
//                     <span className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
//                       riskNum <= 33 ? "bg-emerald-100 text-emerald-700" :
//                       riskNum <= 66 ? "bg-amber-100 text-amber-700" :
//                       "bg-rose-100 text-rose-700"
//                     }`}>
//                       Risk {item.risk ?? "—"}/100
//                     </span>
//                   </div>
//                   <p className="text-xs text-slate-500 mt-2 mb-4">"{item.question}"</p>

//                   <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Technicals</h4>
//                   <div className="overflow-hidden rounded-xl border border-slate-200 mb-4">
//                     <table className="w-full text-sm">
//                       <thead>
//                         <tr className="bg-slate-100 border-b border-slate-200">
//                           <th className="text-left py-2.5 px-4 font-semibold text-slate-600 uppercase tracking-wider">Metric</th>
//                           <th className="text-right py-2.5 px-4 font-semibold text-slate-600 uppercase tracking-wider">Value</th>
//                         </tr>
//                       </thead>
//                       <tbody className="divide-y divide-slate-100">
//                         <tr className={rsiNum < 30 ? "bg-emerald-50/80" : rsiNum > 70 ? "bg-rose-50/80" : ""}>
//                           <td className="py-2 px-4 text-slate-600 font-medium">RSI</td>
//                           <td className={`py-2 px-4 text-right tabular-nums font-semibold ${rsiNum < 30 ? "text-emerald-700" : rsiNum > 70 ? "text-rose-700" : "text-slate-800"}`}>
//                             {Number.isFinite(rsiNum) ? rsiNum.toFixed(1) : "—"}
//                           </td>
//                         </tr>
//                         <tr>
//                           <td className="py-2 px-4 text-slate-600 font-medium">Close</td>
//                           <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800">{fmtClose(Number(item.close))}</td>
//                         </tr>
//                         <tr>
//                           <td className="py-2 px-4 text-slate-600 font-medium">EMA 20</td>
//                           <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800">{fmtNum(Number(item.ema20))}</td>
//                         </tr>
//                         <tr>
//                           <td className="py-2 px-4 text-slate-600 font-medium">EMA 50</td>
//                           <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800">{fmtNum(Number(item.ema50))}</td>
//                         </tr>
//                         <tr className={macdNum >= 0 ? "bg-emerald-50/80" : "bg-rose-50/80"}>
//                           <td className="py-2 px-4 text-slate-600 font-medium">MACD Hist</td>
//                           <td className={`py-2 px-4 text-right tabular-nums font-semibold ${macdNum >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
//                             {fmtNum(macdNum)}
//                           </td>
//                         </tr>
//                         <tr>
//                           <td className="py-2 px-4 text-slate-600 font-medium">ATR</td>
//                           <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800">{fmtNum(Number(item.atr))}</td>
//                         </tr>
//                       </tbody>
//                     </table>
//                   </div>

//                   <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Fundamentals</h4>
//                   <div className="overflow-hidden rounded-xl border border-slate-200 mb-4">
//                     <table className="w-full text-sm">
//                       <thead>
//                         <tr className="bg-slate-100 border-b border-slate-200">
//                           <th className="text-left py-2.5 px-4 font-semibold text-slate-600 uppercase tracking-wider">Metric</th>
//                           <th className="text-right py-2.5 px-4 font-semibold text-slate-600 uppercase tracking-wider">Value</th>
//                         </tr>
//                       </thead>
//                       <tbody className="divide-y divide-slate-100">
//                         <tr>
//                           <td className="py-2 px-4 text-slate-600 font-medium">PE Ratio</td>
//                           <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800">{item.pe != null && item.pe !== "" ? Number(item.pe).toFixed(2) : "—"}</td>
//                         </tr>
//                         <tr>
//                           <td className="py-2 px-4 text-slate-600 font-medium">ROE</td>
//                           <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800">{item.roe != null && item.roe !== "" ? fmtPct(Number(item.roe)) : "—"}</td>
//                         </tr>
//                         <tr>
//                           <td className="py-2 px-4 text-slate-600 font-medium">Debt / Equity</td>
//                           <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800">{item.debtToEquity != null && item.debtToEquity !== "" ? Number(item.debtToEquity).toFixed(2) : "—"}</td>
//                         </tr>
//                         <tr>
//                           <td className="py-2 px-4 text-slate-600 font-medium">Rev. Growth</td>
//                           <td className="py-2 px-4 text-right tabular-nums font-semibold text-slate-800">{item.revenueGrowth != null && item.revenueGrowth !== "" ? fmtPct(Number(item.revenueGrowth)) : "—"}</td>
//                         </tr>
//                       </tbody>
//                     </table>
//                   </div>

//                   <div className="rounded-xl bg-slate-100/80 border border-slate-200 p-4">
//                     <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-2">
//                       <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Analysis
//                     </h4>
//                     <div className="text-slate-700 text-sm leading-relaxed [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:text-base [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:first:mt-0 [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-slate-800">
//                       <ReactMarkdown
//                         components={{
//                           h3: ({ children }) => <h3 className="font-semibold text-slate-800 text-base mt-4 mb-2 first:mt-0">{children}</h3>,
//                           p: ({ children }) => <p className="my-2">{children}</p>,
//                           ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
//                           ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
//                           li: ({ children }) => <li className="ml-2">{children}</li>,
//                           strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
//                         }}
//                       >
//                         {item.reply ?? ""}
//                       </ReactMarkdown>
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             );
//           })}
//         </div>
//       </div>
//     </div>
//   );
// }

import { StockChat } from "./components/stock-chat/stock-chat"

export function App() {
  return <StockChat />
}

