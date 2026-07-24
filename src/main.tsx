import '@fontsource-variable/raleway'
import '@fontsource-variable/raleway/wght-italic.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { VividRegistry } from './components/vivid'
import './styles/globals.css'

const root = document.getElementById('root')

if (!root) throw new Error('OakBoard root element is missing.')

document.documentElement.classList.add('vvd-root')

createRoot(root).render(
  <StrictMode>
    <VividRegistry />
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
