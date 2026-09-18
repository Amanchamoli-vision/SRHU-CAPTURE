import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { API_CONFIG_ERROR } from './services/api'
import ConfigError from './components/common/ConfigError.jsx'
import favicon from './assets/logo-srhu.png'

const link = document.querySelector("link[rel~='icon']") || document.createElement('link')
link.rel = 'icon'
link.href = favicon
document.head.appendChild(link)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* A build without VITE_API_BASE_URL explains itself instead of a blank page. */}
    {API_CONFIG_ERROR ? <ConfigError message={API_CONFIG_ERROR} /> : <App />}
  </StrictMode>,
)
