import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { InboxProvider } from './data/InboxProvider';
import { reloadOnNewVersion } from './data/updates';
import './styles.css';

reloadOnNewVersion();

const root = document.getElementById('root');
if (!root) throw new Error('No #root element — index.html and main.tsx disagree.');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <InboxProvider>
          <App />
        </InboxProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
