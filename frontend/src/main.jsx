import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import favicon from './assets/images.png'

const link = document.querySelector("link[rel~='icon']") || document.createElement('link')
link.rel = 'icon'
link.href = favicon
document.head.appendChild(link)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)