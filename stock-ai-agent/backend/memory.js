let lastSymbol = null
let chatHistory = []

module.exports = {
  getLastSymbol: () => lastSymbol,
  setLastSymbol: (symbol) => lastSymbol = symbol,

  getHistory: () => chatHistory,
  addMessage: (msg) => chatHistory.push(msg),

  clearHistory: () => {
    chatHistory = []
    lastSymbol = null
  }
}