import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initAllMonitors } from './utils/monitoring'

// Start performance tracking, API latency checks, and unhandled promise error catchers
initAllMonitors();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
