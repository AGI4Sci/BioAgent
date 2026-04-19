import React from 'react';
import { createRoot } from 'react-dom/client';
import { BioAgentApp } from './App';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BioAgentApp />
  </React.StrictMode>,
);
