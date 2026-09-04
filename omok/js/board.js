/**
 * board.js - 19x19 오목 보드 모델 및 승패 판정 로직
 */

(function (root) {
  const BOARD_SIZE = 19;
  const EMPTY = 0;
  const BLACK = 1; // 흑돌 (선공)
  const WHITE = 2; // 백돌 (후공)

  class OmokBoard {
    constructor(size = BOARD_SIZE) {
      this.size = size;
      this.reset();
    }

    /**
     * 보드 초기화
     */
    reset() {
      this.grid = Array.from({ length: this.size }, () =>
        new Array(this.size).fill(EMPTY)
      );
      this.history = []; // [{ r, c, color }, ...]
      this.winningLine = null; // 승리 시 승리한 좌표 배열 [{r, c}, ...]
    }

    /**
     * 유효한 착수 위치인지 확인
     */
    isValidMove(r, c) {
      return (
        r >= 0 &&
        r < this.size &&
        c >= 0 &&
        c < this.size &&
        this.grid[r][c] === EMPTY
      );
    }

    /**
     * 돌 착수
     */
    placeStone(r, c, color) {
      if (!this.isValidMove(r, c)) return false;

      this.grid[r][c] = color;
      this.history.push({ r, c, color });

      const winResult = this.checkWin(r, c, color);
      if (winResult) {
        this.winningLine = winResult;
      }

      return true;
    }

    /**
     * 마지막 착수 취소 (무르기)
     */
    undo() {
      if (this.history.length === 0) return null;
      const lastMove = this.history.pop();
      this.grid[lastMove.r][lastMove.c] = EMPTY;
      this.winningLine = null;
      return lastMove;
    }

    /**
     * 마지막 착수 위치 반환
     */
    getLastMove() {
      if (this.history.length === 0) return null;
      return this.history[this.history.length - 1];
    }

    /**
     * 특정 위치 (r, c)에 놓인 color 돌을 기준으로 연속 5목 여부 확인
     * 4방향: 가로(0, 1), 세로(1, 0), 대각선(1, 1), 역대각선(1, -1)
     * 승리 시 승리한 돌 좌표 배열 반환, 아니면 null
     */
    checkWin(r, c, color) {
      const directions = [
        [0, 1],   // 가로
        [1, 0],   // 세로
        [1, 1],   // 우하향 대각선 \
        [1, -1],  // 우상향 대각선 /
      ];

      for (const [dr, dc] of directions) {
        const lineStones = [{ r, c }];

        // 정방향 탐색
        let step = 1;
        while (true) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (
            nr >= 0 &&
            nr < this.size &&
            nc >= 0 &&
            nc < this.size &&
            this.grid[nr][nc] === color
          ) {
            lineStones.push({ r: nr, c: nc });
            step++;
          } else {
            break;
          }
        }

        // 역방향 탐색
        step = 1;
        while (true) {
          const nr = r - dr * step;
          const nc = c - dc * step;
          if (
            nr >= 0 &&
            nr < this.size &&
            nc >= 0 &&
            nc < this.size &&
            this.grid[nr][nc] === color
          ) {
            lineStones.unshift({ r: nr, c: nc });
            step++;
          } else {
            break;
          }
        }

        // 5개 이상 연속이면 승리 (표준 오목 규칙)
        if (lineStones.length >= 5) {
          return lineStones;
        }
      }

      return null;
    }

    /**
     * 바둑판이 꽉 찼는지(무승부) 확인
     */
    isFull() {
      return this.history.length >= this.size * this.size;
    }

    /**
     * 이미 놓인 돌들 주변 (기본 거리 2) 내의 유효 빈 좌표 목록 반환
     * AI 탐색 범위를 압축하여 361칸 중 유망한 수만 빠르게 필터링
     */
    getAdjacentCandidateMoves(distance = 2) {
      if (this.history.length === 0) {
        const center = Math.floor(this.size / 2);
        return [{ r: center, c: center }];
      }

      const candidateSet = new Set();
      const candidates = [];

      for (const move of this.history) {
        for (let dr = -distance; dr <= distance; dr++) {
          for (let dc = -distance; dc <= distance; dc++) {
            const nr = move.r + dr;
            const nc = move.c + dc;

            if (
              nr >= 0 &&
              nr < this.size &&
              nc >= 0 &&
              nc < this.size &&
              this.grid[nr][nc] === EMPTY
            ) {
              const key = nr * this.size + nc;
              if (!candidateSet.has(key)) {
                candidateSet.add(key);
                candidates.push({ r: nr, c: nc });
              }
            }
          }
        }
      }

      return candidates;
    }

    /**
     * 보드 복사본 생성
     */
    clone() {
      const newBoard = new OmokBoard(this.size);
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          newBoard.grid[r][c] = this.grid[r][c];
        }
      }
      newBoard.history = [...this.history];
      newBoard.winningLine = this.winningLine ? [...this.winningLine] : null;
      return newBoard;
    }
  }

  // 전역 객체(window 또는 exports)에 등록
  const exportsObj = {
    BOARD_SIZE,
    EMPTY,
    BLACK,
    WHITE,
    OmokBoard
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  } else {
    root.OmokConstants = { BOARD_SIZE, EMPTY, BLACK, WHITE };
    root.OmokBoard = OmokBoard;
  }
})(typeof window !== 'undefined' ? window : globalThis);

