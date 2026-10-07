import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { mountThemes } from './features/theme-toggle/mountThemes';

mountThemes().then(() => createRoot(document.getElementById('root')!).render(<App />));
