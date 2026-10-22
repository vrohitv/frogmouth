/* Entry point. `vite build` inlines everything below (styles, fonts, code)
   into one self-contained frogmouth.html. */
import './css/00-fonts.css';
import './css/app.css';
import { App } from './js/10-app.js';

App.boot();

// smoke tests ride along only in `vite build --mode test`; production builds drop this branch
if (__TEST__) import('../test/smoke.js');
