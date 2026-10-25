import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './theme.css';
import './app.css';
import { AuthProvider } from './lib/auth';
import { SalonDataProvider } from './lib/salon-data';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SalonDataProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SalonDataProvider>
    </AuthProvider>
  </StrictMode>,
);
