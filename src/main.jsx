import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { IconProvider } from './icons';
import { IconReviewPage } from './IconChooser';
import '@fontsource-variable/inter/wght.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <IconProvider>{new URLSearchParams(window.location.search).get('icons') === 'compare' ? <IconReviewPage /> : <App />}</IconProvider>
  </React.StrictMode>,
);
