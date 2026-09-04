/**
 * ai.js - 오목 컴퓨터 AI 엔진 (패턴 휴리스틱 평가 및 최적 착수 계산)
 */

(function (root) {
  const { BOARD_SIZE, EMPTY, BLACK, WHITE } = root.OmokConstants || {
    BOARD_SIZE: 19,
    EMPTY: 0,
    BLACK: 1,
    WHITE: 2
  };

  class OmokAI {
    constructor(difficulty = 'normal') {
      this.difficulty = difficulty; // 'easy', 'normal', 'hard'
    }

    setDifficulty(level) {
      this.difficulty = level;
    }

    /**
     * AI의 최적 착수 위치 {r, c} 결정
     */
    findBestMove(board, aiColor) {
      const opponentColor = aiColor === BLACK ? WHITE : BLACK;
      const candidates = board.getAdjacentCandidateMoves(2);

      if (candidates.length === 0) {
        return { r: Math.floor(board.size / 2), c: Math.floor(board.size / 2) };
      }

      if (candidates.length === 1 && board.history.length === 0) {
        return candidates[0];
      }

      let bestScore = -Infinity;
      let bestMoves = [];

      // 난이도별 가중치 파라미터
      const defenseWeight = this.difficulty === 'easy' ? 0.7 : this.difficulty === 'normal' ? 1.05 : 1.25;
      const randomnessRange = this.difficulty === 'easy' ? 0.35 : this.difficulty === 'normal' ? 0.08 : 0.0;

      for (const move of candidates) {
        const { r, c } = move;

        // 1. 공격 점수 (AI가 여기에 두었을 때의 가치)
        const attackScore = this.evaluatePoint(board, r, c, aiColor);

        // 2. 수비 점수 (상대방이 여기에 두었을 때 얻을 위협도)
        const defenseScore = this.evaluatePoint(board, r, c, opponentColor);

        // 즉시 승리(5목) 가능한 자리가 있으면 즉각 착수
        if (attackScore >= 100000) {
          return { r, c };
        }

        // 상대방이 바로 5목이 되는 치명적인 자리면 최우선 차단
        let combinedScore = 0;
        if (defenseScore >= 100000) {
          combinedScore = 95000 + attackScore * 0.1;
        } else if (attackScore >= 10000) {
          // AI의 열린 4 (다음 턴 필승)
          combinedScore = attackScore + defenseScore * 0.2;
        } else if (defenseScore >= 10000) {
          // 상대방의 열린 4 차단 필수
          combinedScore = 80000 + attackScore * 0.1;
        } else {
          // 일반적 공방 가중치
          combinedScore = attackScore + defenseScore * defenseWeight;

          // 중앙 지향 보너스 (중앙 9,9에 가까울수록 유리)
          const centerDist = Math.max(Math.abs(r - 9), Math.abs(c - 9));
          combinedScore += (9 - centerDist) * 3;
        }

        // 난이도별 랜덤 노이즈 부여
        if (randomnessRange > 0) {
          const noise = 1 + (Math.random() * 2 - 1) * randomnessRange;
          combinedScore *= noise;
        }

        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestMoves = [{ r, c }];
        } else if (Math.abs(combinedScore - bestScore) < 0.001) {
          bestMoves.push({ r, c });
        }
      }

      // 최고 점수 후보들 중 무작위 1개 선택 (패턴 고착화 방지)
      const selected = bestMoves[Math.floor(Math.random() * bestMoves.length)];
      return selected;
    }

    /**
     * 특정 위치 (r, c)에 color 돌을 놓았을 때의 형태 평가 점수 계산
     */
    evaluatePoint(board, r, c, color) {
      const directions = [
        [0, 1],   // 가로
        [1, 0],   // 세로
        [1, 1],   // 우하 대각선 \
        [1, -1],  // 우상 대각선 /
      ];

      let totalScore = 0;
      let openThrees = 0;
      let fours = 0;

      for (const [dr, dc] of directions) {
        const pattern = this.analyzeDirection(board, r, c, dr, dc, color);
        totalScore += pattern.score;

        if (pattern.isOpenThree) openThrees++;
        if (pattern.isFour) fours++;
      }

      // 복합 위협 패턴 보너스
      if (fours >= 2) {
        totalScore += 25000; // 쌍사 (더블 4)
      } else if (fours >= 1 && openThrees >= 1) {
        totalScore += 20000; // 사삼 (4-3)
      } else if (openThrees >= 2) {
        totalScore += 12000; // 쌍삼 (열린 3이 2개)
      }

      return totalScore;
    }

    /**
     * 단일 방향에 대한 연속 돌 개수 및 양 끝 열림 여부 정밀 분석
     */
    analyzeDirection(board, r, c, dr, dc, color) {
      const size = board.size;
      let continuousStones = 1; // 착수 예정인 (r, c) 포함
      let openEnds = 0;

      // 정방향 연속 탐색
      let forwardCount = 0;
      let step = 1;
      while (true) {
        const nr = r + dr * step;
        const nc = c + dc * step;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;

        if (board.grid[nr][nc] === color) {
          forwardCount++;
          step++;
        } else {
          if (board.grid[nr][nc] === EMPTY) {
            openEnds++;
          }
          break;
        }
      }

      // 역방향 연속 탐색
      let backwardCount = 0;
      step = 1;
      while (true) {
        const nr = r - dr * step;
        const nc = c - dc * step;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;

        if (board.grid[nr][nc] === color) {
          backwardCount++;
          step++;
        } else {
          if (board.grid[nr][nc] === EMPTY) {
            openEnds++;
          }
          break;
        }
      }

      continuousStones += forwardCount + backwardCount;

      let score = 0;
      let isOpenThree = false;
      let isFour = false;

      if (continuousStones >= 5) {
        score = 100000; // 5목 이상 (승리)
      } else if (continuousStones === 4) {
        isFour = true;
        if (openEnds === 2) {
          score = 15000; // 열린 4 (막을 수 없는 필승형태)
        } else if (openEnds === 1) {
          score = 2500;  // 닫힌 4
        }
      } else if (continuousStones === 3) {
        if (openEnds === 2) {
          score = 2000;  // 열린 3
          isOpenThree = true;
        } else if (openEnds === 1) {
          score = 200;   // 닫힌 3
        }
      } else if (continuousStones === 2) {
        if (openEnds === 2) {
          score = 100;   // 열린 2
        } else if (openEnds === 1) {
          score = 15;    // 닫힌 2
        }
      } else if (continuousStones === 1) {
        if (openEnds === 2) {
          score = 5;
        }
      }

      return { score, isOpenThree, isFour };
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OmokAI };
  } else {
    root.OmokAI = OmokAI;
  }
})(typeof window !== 'undefined' ? window : globalThis);

