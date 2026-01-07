import './style.css'
import { Game } from './Game.js'

const game = new Game();
game.start();
// Default is game mode, but explicit is good
game.setMode('game');
