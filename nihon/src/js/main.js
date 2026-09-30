import { initStage } from './stage.js';
import { initWriting } from './write.js';
import { initUI } from './ui.js';
import { initAnthology } from './anthology.js';
import { initKaruta } from './karuta.js';
import { initSound } from './sound.js';

function start() {
  let data = {};
  try { data = JSON.parse(document.getElementById('app-data')?.textContent || '{}'); } catch { /* keep defaults */ }
  initStage();
  initWriting();
  initUI(data);
  initAnthology();
  initKaruta(data.karuta);
  initSound();
  window.__nihon = true;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
