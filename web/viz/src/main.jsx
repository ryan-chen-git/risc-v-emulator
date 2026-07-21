import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Arch from './Arch.jsx'

const view = new URLSearchParams(window.location.search).get('view')
createRoot(document.getElementById('root')).render(view === 'arch' ? <Arch /> : <App />)
