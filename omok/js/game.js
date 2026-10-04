/**
 * game.js - 오목 Canvas 그래픽 렌더링, 동적 자동 줌/패닝 카메라 시스템, 이벤트 및 게임 메인 컨트롤러
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

      // 동적 카메라 모델 (확대/축소 및 패닝)
      this.camera = {
        x: 290,
        y: 290,
        zoom: 2.2, // 처음에는 많이 확대 (모바일 터치 편의)
        targetX: 290,
        targetY: 290,
        targetZoom: 2.2,
        minZoom: 1.0,
        maxZoom: 2.8,
        autoZoomEnabled: true
      };
      this.animating = false;

      // 포인터 인터랙션 상태
      this.activePointers = new Map();
      this.pointerStartDist = 0;
      this.pointerStartZoom = 2.2;
      this.isDragging = false;
      this.dragStart = { x: 0, y: 0 };
      this.hasMoved = false;

      this.stats = this.loadStats();

      this.initCanvasResolution();
      this.bindEvents();
      this.updateAutoCamera(true); // 초기 뷰 설정
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

      if (this.camera.x === 0 || this.camera.x === 290) {
        this.camera.x = this.displaySize / 2;
        this.camera.y = this.displaySize / 2;
        this.camera.targetX = this.displaySize / 2;
        this.camera.targetY = this.displaySize / 2;
      }
    }

    /**
     * 바둑판에 놓인 모든 돌을 감지하여 자동 뷰포트(중심점 & 줌 배율) 계산
     * - 처음에는 많이 확대 (~2.2x)
     * - 돌이 늘어날수록 모든 돌 + 주변 착수 여유 마진이 화면에 쏙 들어오도록 점진적 축소
     */
    updateAutoCamera(immediate = false) {
      if (!this.camera.autoZoomEnabled) return;

      const history = this.board.history;

      if (history.length === 0) {
        // 초반: 바둑판 정중앙(천원 부근) 집중 확대
        this.camera.targetX = this.displaySize / 2;
        this.camera.targetY = this.displaySize / 2;
        this.camera.targetZoom = 2.2;
      } else if (history.length === 1) {
        // 1수 착수 시: 그 첫 돌을 중심으로 확대
        const first = history[0];
        this.camera.targetX = this.padding + first.c * this.cellSize;
        this.camera.targetY = this.padding + first.r * this.cellSize;
        this.camera.targetZoom = 2.1;
      } else {
        // 2수 이상: 모든 돌들의 바운딩 박스(Bounding Box) 계산
        let minR = BOARD_SIZE, maxR = -1;
        let minC = BOARD_SIZE, maxC = -1;

        for (const m of history) {
          if (m.r < minR) minR = m.r;
          if (m.r > maxR) maxR = m.r;
          if (m.c < minC) minC = m.c;
          if (m.c > maxC) maxC = m.c;
        }

        // 주변 2.3칸 여유 마진 (다음 수 착수 공간 확보)
        const margin = 2.3;
        const r0 = Math.max(0, minR - margin);
        const r1 = Math.min(BOARD_SIZE - 1, maxR + margin);
        const c0 = Math.max(0, minC - margin);
        const c1 = Math.min(BOARD_SIZE - 1, maxC + margin);

        const worldMinX = this.padding + c0 * this.cellSize;
        const worldMaxX = this.padding + c1 * this.cellSize;
        const worldMinY = this.padding + r0 * this.cellSize;
        const worldMaxY = this.padding + r1 * this.cellSize;

        const boxWidth = worldMaxX - worldMinX;
        const boxHeight = worldMaxY - worldMinY;
        const span = Math.max(boxWidth, boxHeight);

        // 화면 뷰포트 여백(0.88) 고려한 필요 줌 계산
        const availableViewSize = this.displaySize * 0.88;
        let calculatedZoom = availableViewSize / span;

        // 클램핑: 최소 1.0 (전체 바둑판 보기), 최대 2.2
        calculatedZoom = Math.max(this.camera.minZoom, Math.min(2.2, calculatedZoom));

        this.camera.targetZoom = calculatedZoom;
        this.camera.targetX = (worldMinX + worldMaxX) / 2;
        this.camera.targetY = (worldMinY + worldMaxY) / 2;
      }

      this.clampCameraTarget();

      if (immediate) {
        this.camera.zoom = this.camera.targetZoom;
        this.camera.x = this.camera.targetX;
        this.camera.y = this.camera.targetY;
        this.render();
      } else {
        this.requestRender();
      }
    }

    /**
     * 카메라 위치가 바둑판 영역 밖으로 과도하게 벗어나지 않도록 클램핑
     */
    clampCameraTarget() {
      const halfViewW = (this.displaySize / 2) / this.camera.targetZoom;
      const halfViewH = (this.displaySize / 2) / this.camera.targetZoom;

      if (halfViewW >= this.displaySize / 2) {
        this.camera.targetX = this.displaySize / 2;
      } else {
        this.camera.targetX = Math.max(halfViewW, Math.min(this.displaySize - halfViewW, this.camera.targetX));
      }

      if (halfViewH >= this.displaySize / 2) {
        this.camera.targetY = this.displaySize / 2;
      } else {
        this.camera.targetY = Math.max(halfViewH, Math.min(this.displaySize - halfViewH, this.camera.targetY));
      }
    }

    clampCameraCurrent() {
      const halfViewW = (this.displaySize / 2) / this.camera.zoom;
      const halfViewH = (this.displaySize / 2) / this.camera.zoom;

      if (halfViewW >= this.displaySize / 2) {
        this.camera.x = this.displaySize / 2;
      } else {
        this.camera.x = Math.max(halfViewW, Math.min(this.displaySize - halfViewW, this.camera.x));
      }

      if (halfViewH >= this.displaySize / 2) {
        this.camera.y = this.displaySize / 2;
      } else {
        this.camera.y = Math.max(halfViewH, Math.min(this.displaySize - halfViewH, this.camera.y));
      }
    }

    requestRender() {
      if (!this.animating) {
        this.animating = true;
        requestAnimationFrame(() => this.stepAnimation());
      }
    }

    stepAnimation() {
      const lerp = 0.16;
      let changed = false;

      if (Math.abs(this.camera.zoom - this.camera.targetZoom) > 0.002) {
        this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * lerp;
        changed = true;
      } else {
        this.camera.zoom = this.camera.targetZoom;
      }

      if (Math.abs(this.camera.x - this.camera.targetX) > 0.4) {
        this.camera.x += (this.camera.targetX - this.camera.x) * lerp;
        changed = true;
      } else {
        this.camera.x = this.camera.targetX;
      }

      if (Math.abs(this.camera.y - this.camera.targetY) > 0.4) {
        this.camera.y += (this.camera.targetY - this.camera.y) * lerp;
        changed = true;
      } else {
        this.camera.y = this.camera.targetY;
      }

      this.render();

      if (changed) {
        requestAnimationFrame(() => this.stepAnimation());
      } else {
        this.animating = false;
      }
    }

    /**
     * 스크린 좌표 -> 바둑판 교차점 (r, c) 역변환
     */
    canvasToGrid(screenX, screenY) {
      const worldX = (screenX - this.displaySize / 2) / this.camera.zoom + this.camera.x;
      const worldY = (screenY - this.displaySize / 2) / this.camera.zoom + this.camera.y;

      const c = Math.round((worldX - this.padding) / this.cellSize);
      const r = Math.round((worldY - this.padding) / this.cellSize);

      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const centerX = this.padding + c * this.cellSize;
        const centerY = this.padding + r * this.cellSize;
        const dist = Math.hypot(worldX - centerX, worldY - centerY);
        if (dist <= this.cellSize * 0.65) {
          return { r, c };
        }
      }
      return null;
    }

    bindEvents() {
      window.addEventListener('resize', () => {
        this.initCanvasResolution();
        this.updateAutoCamera(true);
      });

      // Pointer Events (마우스, 터치 통합)
      this.canvas.addEventListener('pointerdown', (e) => {
        this.canvas.setPointerCapture(e.pointerId);
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.activePointers.size === 1) {
          this.isDragging = true;
          this.hasMoved = false;
          this.dragStart = { x: e.clientX, y: e.clientY };
          this.lastPointer = { x: e.clientX, y: e.clientY };
        } else if (this.activePointers.size === 2) {
          // 핀치 줌 시작
          const pts = Array.from(this.activePointers.values());
          this.pointerStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          this.pointerStartZoom = this.camera.zoom;
          this.camera.autoZoomEnabled = false;
          this.updateOverlayButtons();
        }
      });

      this.canvas.addEventListener('pointermove', (e) => {
        if (!this.activePointers.has(e.pointerId)) {
          // 마우스 호버 처리 (포인터 미누름 상태)
          if (this.gameState === 'PLAYING' && this.currentTurn === this.playerColor) {
            const rect = this.canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const pos = this.canvasToGrid(sx, sy);

            if (pos && this.board.isValidMove(pos.r, pos.c)) {
              if (!this.hoverPos || this.hoverPos.r !== pos.r || this.hoverPos.c !== pos.c) {
                this.hoverPos = pos;
                this.render();
              }
            } else if (this.hoverPos) {
              this.hoverPos = null;
              this.render();
            }
          }
          return;
        }

        // 포인터 좌표 갱신
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.activePointers.size === 2) {
          // 핀치 줌
          const pts = Array.from(this.activePointers.values());
          const curDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (this.pointerStartDist > 0) {
            const scale = curDist / this.pointerStartDist;
            const newZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.pointerStartZoom * scale));
            this.camera.zoom = newZoom;
            this.camera.targetZoom = newZoom;
            this.clampCameraCurrent();
            this.requestRender();
          }
          this.hasMoved = true;
          return;
        }

        if (this.isDragging && this.activePointers.size === 1) {
          const dx = e.clientX - this.lastPointer.x;
          const dy = e.clientY - this.lastPointer.y;
          const totalDist = Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y);

          if (totalDist > 8) {
            this.hasMoved = true;
            // 드래그 시 자동 줌 해제(수동 탐색 모드)
            this.camera.autoZoomEnabled = false;
            this.updateOverlayButtons();

            this.camera.x -= dx / this.camera.zoom;
            this.camera.y -= dy / this.camera.zoom;
            this.camera.targetX = this.camera.x;
            this.camera.targetY = this.camera.y;

            this.clampCameraCurrent();
            this.clampCameraTarget();
            this.requestRender();
          }

          this.lastPointer = { x: e.clientX, y: e.clientY };
        }
      });

      const handlePointerEnd = (e) => {
        if (!this.activePointers.has(e.pointerId)) return;

        const wasSingle = this.activePointers.size === 1;
        this.activePointers.delete(e.pointerId);

        try {
          this.canvas.releasePointerCapture(e.pointerId);
        } catch (err) {}

        if (wasSingle && !this.hasMoved) {
          // 드래그하지 않은 단순 탭(클릭) -> 착수 실행!
          if (this.gameState === 'PLAYING' && this.currentTurn === this.playerColor) {
            const rect = this.canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;

            const pos = this.canvasToGrid(sx, sy);
            if (pos && this.board.isValidMove(pos.r, pos.c)) {
              this.hoverPos = null;
              this.handlePlayerMove(pos.r, pos.c);
            }
          }
        }

        if (this.activePointers.size === 0) {
          this.isDragging = false;
          this.hasMoved = false;
        }
      };

      this.canvas.addEventListener('pointerup', handlePointerEnd);
      this.canvas.addEventListener('pointercancel', handlePointerEnd);

      this.canvas.addEventListener('mouseleave', () => {
        if (this.hoverPos) {
          this.hoverPos = null;
          this.render();
        }
      });

      // 마우스 휠 줌 (데스크톱)
      this.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        const newZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.zoom * factor));

        this.camera.autoZoomEnabled = false;
        this.updateOverlayButtons();

        this.camera.zoom = newZoom;
        this.camera.targetZoom = newZoom;
        this.clampCameraCurrent();
        this.clampCameraTarget();
        this.requestRender();
      }, { passive: false });

      // 오버레이 컨트롤 버튼들
      const autoZoomBtn = document.getElementById('btn-auto-zoom');
      autoZoomBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.camera.autoZoomEnabled = !this.camera.autoZoomEnabled;
        this.updateOverlayButtons();
        if (this.camera.autoZoomEnabled) {
          this.updateAutoCamera();
        }
      });

      const resetViewBtn = document.getElementById('btn-reset-view');
      resetViewBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.camera.autoZoomEnabled = false;
        this.updateOverlayButtons();
        this.camera.targetZoom = 1.0;
        this.camera.targetX = this.displaySize / 2;
        this.camera.targetY = this.displaySize / 2;
        this.requestRender();
      });

      document.getElementById('btn-zoom-in')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.camera.autoZoomEnabled = false;
        this.updateOverlayButtons();
        this.camera.targetZoom = Math.min(this.camera.maxZoom, this.camera.targetZoom * 1.25);
        this.clampCameraTarget();
        this.requestRender();
      });

      document.getElementById('btn-zoom-out')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.camera.autoZoomEnabled = false;
        this.updateOverlayButtons();
        this.camera.targetZoom = Math.max(this.camera.minZoom, this.camera.targetZoom / 1.25);
        this.clampCameraTarget();
        this.requestRender();
      });

      // 사이드 패널 기본 컨트롤 버튼들
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

    updateOverlayButtons() {
      const autoBtn = document.getElementById('btn-auto-zoom');
      if (autoBtn) {
        autoBtn.classList.toggle('active', this.camera.autoZoomEnabled);
      }
    }

    startNewGame() {
      this.board.reset();
      this.currentTurn = BLACK;
      this.gameState = 'PLAYING';
      this.hoverPos = null;

      // 카메라 리셋: 초기 집중 확대
      this.camera.autoZoomEnabled = true;
      this.updateOverlayButtons();
      this.updateAutoCamera(false);

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
      this.updateAutoCamera(); // 착수 후 최적 뷰로 자동 조정
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
      this.updateAutoCamera(); // AI 착수 후에도 모든 돌이 보이도록 자동 축소/패닝
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

      this.updateAutoCamera(); // 무른 상태의 돌들에 맞춰 뷰 재조정
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

    /**
     * 메인 렌더링 함수 (카메라 행렬 적용)
     */
    render() {
      this.ctx.clearRect(0, 0, this.displaySize, this.displaySize);

      this.ctx.save();
      // 카메라 뷰포트 행렬 변환:
      // 1. 캔버스 화면 중심 (displaySize/2, displaySize/2)으로 이동
      this.ctx.translate(this.displaySize / 2, this.displaySize / 2);
      // 2. 동적 줌 스케일링
      this.ctx.scale(this.camera.zoom, this.camera.zoom);
      // 3. 월드 카메라 중심 좌표 (-camera.x, -camera.y)로 이동
      this.ctx.translate(-this.camera.x, -this.camera.y);

      // 월드 좌표계 요소 렌더링
      this.drawBoardWood();
      this.drawGrid();
      this.drawStones();
      this.drawLastMoveMarker();
      this.drawHoverGuide();
      this.drawWinningLine();

      this.ctx.restore();
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
