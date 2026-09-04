/**
 * game.js - 오목 Canvas 그래픽 렌더링, 이벤트 처리 및 게임 메인 컨트롤러
 */

(function (root) {
  const { BOARD_SIZE, EMPTY, BLACK, WHITE } = root.OmokConstants || {
    BOARD_SIZE: 19,
    EMPTY: 0,
    BLACK: 1,
    WHITE: 2
  };
  const OmokBoard = root.OmokBoard;
  const OmokAI = root.OmokAI;

  class SoundEffects {
    constructor() {
      this.ctx = null;
      this.enabled = true;
    }

    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
    }

    playStoneSound() {
      if (!this.enabled) return;
      try {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        // 1. 맑고 경쾌한 착수 타격음 (고주파 감쇠)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.09);

        // 2. 바둑판 나무 울림음 (Resonance)
        const woodOsc = this.ctx.createOscillator();
        const woodGain = this.ctx.createGain();

        woodOsc.type = 'triangle';
        woodOsc.frequency.setValueAtTime(240, now);
        woodOsc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

        woodGain.gain.setValueAtTime(0.2, now);
        woodGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        woodOsc.connect(woodGain);
        woodGain.connect(this.ctx.destination);

        woodOsc.start(now);
        woodOsc.stop(now + 0.12);
      } catch (e) {
        console.warn('Audio play error:', e);
      }
    }

    playWinSound() {
      if (!this.enabled) return;
      try {
        this.init();
        if (!this.ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const start = this.ctx.currentTime + idx * 0.1;
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.25, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(start);
          osc.stop(start + 0.3);
        });
      } catch (e) {}
    }
  }

  class OmokGame {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas.getContext('2d');

      this.board = new OmokBoard(BOARD_SIZE);
      this.ai = new OmokAI('normal');
      this.sound = new SoundEffects();

      this.playerColor = BLACK; // 기본 플레이어 흑돌
      this.aiColor = WHITE;
      this.currentTurn = BLACK; // 선공은 항상 흑돌

      this.gameState = 'PLAYING'; // 'PLAYING', 'AI_THINKING', 'GAME_OVER'
      this.hoverPos = null;

      this.stats = this.loadStats();

      this.initCanvasResolution();
      this.bindEvents();
      this.updateUI();
      this.render();
    }

    loadStats() {
      try {
        const data = localStorage.getItem('omok_stats');
        if (data) return JSON.parse(data);
      } catch (e) {}
      return { win: 0, loss: 0, draw: 0 };
    }

    saveStats() {
      try {
        localStorage.setItem('omok_stats', JSON.stringify(this.stats));
      } catch (e) {}
    }

    initCanvasResolution() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.displaySize = rect.width || 580;

      this.canvas.width = this.displaySize * dpr;
      this.canvas.height = this.displaySize * dpr;
      this.ctx.scale(dpr, dpr);

      this.padding = this.displaySize * 0.055;
      this.boardWidth = this.displaySize - this.padding * 2;
      this.cellSize = this.boardWidth / (BOARD_SIZE - 1);
      this.stoneRadius = this.cellSize * 0.44;
    }

    bindEvents() {
      window.addEventListener('resize', () => {
        this.initCanvasResolution();
        this.render();
      });

      this.canvas.addEventListener('mousemove', (e) => {
        if (this.gameState !== 'PLAYING' || this.currentTurn !== this.playerColor) {
          if (this.hoverPos) {
            this.hoverPos = null;
            this.render();
          }
          return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const pos = this.canvasToGrid(x, y);
        if (pos && this.board.isValidMove(pos.r, pos.c)) {
          if (!this.hoverPos || this.hoverPos.r !== pos.r || this.hoverPos.c !== pos.c) {
            this.hoverPos = pos;
            this.render();
          }
        } else if (this.hoverPos) {
          this.hoverPos = null;
          this.render();
        }
      });

      this.canvas.addEventListener('mouseleave', () => {
        if (this.hoverPos) {
          this.hoverPos = null;
          this.render();
        }
      });

      this.canvas.addEventListener('click', (e) => {
        if (this.gameState !== 'PLAYING' || this.currentTurn !== this.playerColor) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const pos = this.canvasToGrid(x, y);
        if (pos && this.board.isValidMove(pos.r, pos.c)) {
          this.hoverPos = null;
          this.handlePlayerMove(pos.r, pos.c);
        }
      });

      document.getElementById('btn-restart')?.addEventListener('click', () => this.startNewGame());
      document.getElementById('btn-undo')?.addEventListener('click', () => this.handleUndo());

      const diffSelect = document.getElementById('select-difficulty');
      diffSelect?.addEventListener('change', (e) => {
        this.ai.setDifficulty(e.target.value);
      });

      document.querySelectorAll('input[name="player-color"]').forEach((radio) => {
        radio.addEventListener('change', (e) => {
          const newColor = parseInt(e.target.value, 10);
          if (newColor !== this.playerColor) {
            this.playerColor = newColor;
            this.aiColor = newColor === BLACK ? WHITE : BLACK;
            this.startNewGame();
          }
        });
      });

      const soundToggle = document.getElementById('btn-sound-toggle');
      soundToggle?.addEventListener('click', () => {
        this.sound.enabled = !this.sound.enabled;
        soundToggle.textContent = this.sound.enabled ? '🔊 소리 켜짐' : '🔇 소리 꺼짐';
      });

      document.getElementById('btn-reset-stats')?.addEventListener('click', () => {
        if (confirm('전적 기록을 초기화하시겠습니까?')) {
          this.stats = { win: 0, loss: 0, draw: 0 };
          this.saveStats();
          this.updateStatsUI();
        }
      });
    }

    canvasToGrid(x, y) {
      const halfCell = this.cellSize / 2;
      const c = Math.round((x - this.padding) / this.cellSize);
      const r = Math.round((y - this.padding) / this.cellSize);

      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const centerX = this.padding + c * this.cellSize;
        const centerY = this.padding + r * this.cellSize;
        const dist = Math.hypot(x - centerX, y - centerY);
        if (dist <= halfCell * 1.3) {
          return { r, c };
        }
      }
      return null;
    }

    startNewGame() {
      this.board.reset();
      this.currentTurn = BLACK;
      this.gameState = 'PLAYING';
      this.hoverPos = null;

      this.updateUI();
      this.render();

      if (this.playerColor === WHITE) {
        this.gameState = 'AI_THINKING';
        this.updateUI();
        setTimeout(() => {
          this.handleAIMove();
        }, 400);
      }
    }

    handlePlayerMove(r, c) {
      if (!this.board.placeStone(r, c, this.playerColor)) return;

      this.sound.playStoneSound();
      this.render();

      if (this.board.winningLine) {
        this.handleGameOver('PLAYER_WIN');
        return;
      }

      if (this.board.isFull()) {
        this.handleGameOver('DRAW');
        return;
      }

      this.currentTurn = this.aiColor;
      this.gameState = 'AI_THINKING';
      this.updateUI();

      const thinkTime = 250 + Math.random() * 250;
      setTimeout(() => {
        this.handleAIMove();
      }, thinkTime);
    }

    handleAIMove() {
      if (this.gameState !== 'AI_THINKING') return;

      const move = this.ai.findBestMove(this.board, this.aiColor);
      if (!move) return;

      this.board.placeStone(move.r, move.c, this.aiColor);
      this.sound.playStoneSound();
      this.render();

      if (this.board.winningLine) {
        this.handleGameOver('AI_WIN');
        return;
      }

      if (this.board.isFull()) {
        this.handleGameOver('DRAW');
        return;
      }

      this.currentTurn = this.playerColor;
      this.gameState = 'PLAYING';
      this.updateUI();
      this.render();
    }

    handleUndo() {
      if (this.gameState === 'AI_THINKING') return;
      if (this.board.history.length === 0) return;

      if (this.gameState === 'GAME_OVER') {
        this.board.undo();
        if (this.board.getLastMove()?.color === this.aiColor) {
          this.board.undo();
        }
        this.gameState = 'PLAYING';
        this.currentTurn = this.playerColor;
      } else {
        const last = this.board.getLastMove();
        if (last && last.color === this.aiColor) {
          this.board.undo();
        }
        this.board.undo();
        this.currentTurn = this.playerColor;
      }

      this.updateUI();
      this.render();
    }

    handleGameOver(result) {
      this.gameState = 'GAME_OVER';
      this.sound.playWinSound();

      if (result === 'PLAYER_WIN') {
        this.stats.win++;
      } else if (result === 'AI_WIN') {
        this.stats.loss++;
      } else {
        this.stats.draw++;
      }
      this.saveStats();
      this.updateUI();
      this.render();

      setTimeout(() => {
        if (result === 'PLAYER_WIN') {
          this.showResultBanner('🎉 축하합니다! 승리하셨습니다!', 'win');
        } else if (result === 'AI_WIN') {
          this.showResultBanner('💻 컴퓨터가 승리하였습니다.', 'loss');
        } else {
          this.showResultBanner('🤝 무승부입니다.', 'draw');
        }
      }, 200);
    }

    showResultBanner(message, type) {
      const banner = document.getElementById('result-banner');
      if (banner) {
        banner.textContent = message;
        banner.className = `result-banner show ${type}`;
      }
    }

    hideResultBanner() {
      const banner = document.getElementById('result-banner');
      if (banner) {
        banner.className = 'result-banner';
      }
    }

    updateUI() {
      this.hideResultBanner();
      this.updateStatsUI();

      const turnBadge = document.getElementById('current-turn-badge');
      const statusText = document.getElementById('game-status-text');
      const moveCount = document.getElementById('move-count');
      const undoBtn = document.getElementById('btn-undo');

      if (moveCount) {
        moveCount.textContent = `착수 수: ${this.board.history.length}`;
      }

      if (undoBtn) {
        undoBtn.disabled = this.board.history.length === 0 || this.gameState === 'AI_THINKING';
      }

      if (this.gameState === 'GAME_OVER') {
        if (statusText) statusText.textContent = '게임 종료';
        if (turnBadge) {
          turnBadge.className = 'badge badge-ended';
          turnBadge.textContent = '종료';
        }
      } else if (this.gameState === 'AI_THINKING') {
        if (statusText) statusText.textContent = '컴퓨터가 최적의 수를 계산하고 있습니다...';
        if (turnBadge) {
          turnBadge.className = 'badge badge-ai';
          turnBadge.textContent = '컴퓨터 수 계산 중';
        }
      } else {
        const isPlayerTurn = this.currentTurn === this.playerColor;
        if (statusText) {
          statusText.textContent = isPlayerTurn ? '당신의 차례입니다. 바둑판에 돌을 놓으세요.' : '컴퓨터 차례입니다.';
        }
        if (turnBadge) {
          turnBadge.className = isPlayerTurn ? 'badge badge-player' : 'badge badge-ai';
          turnBadge.textContent = isPlayerTurn ? '플레이어 차례' : '컴퓨터 차례';
        }
      }
    }

    updateStatsUI() {
      const winEl = document.getElementById('stat-win');
      const lossEl = document.getElementById('stat-loss');
      const drawEl = document.getElementById('stat-draw');

      if (winEl) winEl.textContent = this.stats.win;
      if (lossEl) lossEl.textContent = this.stats.loss;
      if (drawEl) drawEl.textContent = this.stats.draw;
    }

    render() {
      this.ctx.clearRect(0, 0, this.displaySize, this.displaySize);
      this.drawBoardWood();
      this.drawGrid();
      this.drawStones();
      this.drawLastMoveMarker();
      this.drawHoverGuide();
      this.drawWinningLine();
    }

    drawBoardWood() {
      const { ctx, displaySize } = this;

      const grad = ctx.createRadialGradient(
        displaySize / 2, displaySize / 2, 40,
        displaySize / 2, displaySize / 2, displaySize * 0.7
      );
      grad.addColorStop(0, '#eac286');
      grad.addColorStop(0.6, '#dcaf6f');
      grad.addColorStop(1, '#c5934e');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, displaySize, displaySize);

      ctx.save();
      ctx.strokeStyle = 'rgba(165, 110, 45, 0.09)';
      ctx.lineWidth = 1;
      for (let i = 0; i < displaySize; i += 5) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.bezierCurveTo(
          displaySize * 0.3, i + Math.sin(i * 0.1) * 3,
          displaySize * 0.7, i - Math.cos(i * 0.1) * 3,
          displaySize, i
        );
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = '#8d5c22';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, displaySize - 3, displaySize - 3);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(3, 3, displaySize - 6, displaySize - 6);
    }

    drawGrid() {
      const { ctx, padding, cellSize, boardWidth } = this;

      ctx.strokeStyle = '#432607';
      ctx.lineWidth = 1.1;

      for (let r = 0; r < BOARD_SIZE; r++) {
        const y = padding + r * cellSize;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + boardWidth, y);
        ctx.stroke();
      }

      for (let c = 0; c < BOARD_SIZE; c++) {
        const x = padding + c * cellSize;
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, padding + boardWidth);
        ctx.stroke();
      }

      ctx.lineWidth = 2.0;
      ctx.strokeRect(padding, padding, boardWidth, boardWidth);

      // 화점 9개 (3, 9, 15번 선)
      const starIndices = [3, 9, 15];
      ctx.fillStyle = '#3a2004';

      for (const r of starIndices) {
        for (const c of starIndices) {
          const x = padding + c * cellSize;
          const y = padding + r * cellSize;

          ctx.beginPath();
          ctx.arc(x, y, 3.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    drawStones() {
      const { ctx, padding, cellSize, stoneRadius } = this;

      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const stone = this.board.grid[r][c];
          if (stone === EMPTY) continue;

          const x = padding + c * cellSize;
          const y = padding + r * cellSize;

          this.drawSingleStone(x, y, stoneRadius, stone);
        }
      }
    }

    drawSingleStone(x, y, radius, color, alpha = 1.0) {
      const { ctx } = this;

      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = radius * 0.4;
      ctx.shadowOffsetX = radius * 0.18;
      ctx.shadowOffsetY = radius * 0.18;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = 'transparent';

      const grad = ctx.createRadialGradient(
        x - radius * 0.3, y - radius * 0.3, radius * 0.1,
        x, y, radius
      );

      if (color === BLACK) {
        grad.addColorStop(0, '#585858');
        grad.addColorStop(0.35, '#282828');
        grad.addColorStop(0.85, '#121212');
        grad.addColorStop(1, '#050505');
      } else {
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#f4f4f2');
        grad.addColorStop(0.85, '#e0e0dc');
        grad.addColorStop(1, '#c5c5c0');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (color === WHITE) {
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();
    }

    drawLastMoveMarker() {
      const lastMove = this.board.getLastMove();
      if (!lastMove) return;

      const { ctx, padding, cellSize, stoneRadius } = this;
      const x = padding + lastMove.c * cellSize;
      const y = padding + lastMove.r * cellSize;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, stoneRadius * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = lastMove.color === BLACK ? '#ff4d4f' : '#e60000';
      ctx.shadowColor = 'rgba(255, 0, 0, 0.6)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
    }

    drawHoverGuide() {
      if (!this.hoverPos) return;

      const { padding, cellSize, stoneRadius } = this;
      const x = padding + this.hoverPos.c * cellSize;
      const y = padding + this.hoverPos.r * cellSize;

      this.drawSingleStone(x, y, stoneRadius, this.playerColor, 0.45);
    }

    drawWinningLine() {
      if (!this.board.winningLine || this.board.winningLine.length === 0) return;

      const { ctx, padding, cellSize, stoneRadius } = this;
      const stones = this.board.winningLine;

      ctx.save();

      for (const stone of stones) {
        const x = padding + stone.c * cellSize;
        const y = padding + stone.r * cellSize;

        ctx.beginPath();
        ctx.arc(x, y, stoneRadius * 0.85, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#ffea00';
        ctx.shadowBlur = 12;
        ctx.stroke();
      }

      ctx.beginPath();
      const first = stones[0];
      const last = stones[stones.length - 1];

      ctx.moveTo(padding + first.c * cellSize, padding + first.r * cellSize);
      ctx.lineTo(padding + last.c * cellSize, padding + last.r * cellSize);

      ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ff9900';
      ctx.shadowBlur = 10;
      ctx.stroke();

      ctx.restore();
    }
  }

  root.OmokGame = OmokGame;

  window.addEventListener('DOMContentLoaded', () => {
    window.omokGame = new OmokGame('omok-canvas');
  });
})(typeof window !== 'undefined' ? window : globalThis);

