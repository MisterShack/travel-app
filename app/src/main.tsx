import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { InboxProvider } from './data/InboxProvider';
import './styles.css';

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
