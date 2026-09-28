import { createRoot } from 'react-dom/client';
import { init } from './entry';

document.body.innerHTML = '<div id="app"></div>';

const root = createRoot(document.getElementById('app')!);

init(root);

