import { initStage } from './stage.js';
import { initWriting } from './write.js';
import { initUI } from './ui.js';
import { initReader } from './reader.js';
import { initSound } from './sound.js';

function start() {
  initStage();
  initWriting();
  initUI();
  initReader();
  initSound();
  window.__way = true;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
