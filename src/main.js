import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { Game } from './game/game.js';

registerSW({ immediate: true });

const game = new Game(document.getElementById('game'));
// handy for debugging from the console
window.luckyGame = game;
