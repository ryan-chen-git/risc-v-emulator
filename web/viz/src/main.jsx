import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Arch from './Arch.jsx'
import Live from './Live.jsx'

const view = new URLSearchParams(window.location.search).get('view')
const page = view === 'arch' ? <Arch /> : view === 'replay' ? <App /> : <Live />
createRoot(document.getElementById('root')).render(page)
