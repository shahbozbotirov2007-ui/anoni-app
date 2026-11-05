import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './tickets/App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element is missing.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
