import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/bold';
import '@phosphor-icons/web/fill';
import './app.css';
import App from './App.jsx';
import Upload from './Upload.jsx';

const m = location.pathname.match(/^\/hochladen\/([\w-]+)/);
createRoot(document.getElementById('root')).render(
  <StrictMode>{m ? <Upload token={m[1]} /> : <App />}</StrictMode>
);
