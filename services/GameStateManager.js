import { CountdownService } from './CountdownService.js';
import { GamePlayManager } from './GamePlayManager.js';
import { GameState } from './gameState.js';

// 게임 상태 관리 서비스 (수정된 버전)
export const GameStateManager = {
    // ✅ 게임 상태 변경 처리 (안전성 검사 추가)
    handleGameStatusChange(status) {
        // ✅ GameState 유효성 검사
        if (!GameState) {
            console.error('❌ GameStateManager: GameState가 초기화되지 않음');
            return;
        }

        console.log('🔄 게임 상태 변경:', GameState.gameState, '->', status);
        GameState.gameState = status;

        // 상태 변경 시 항상 결과 화면 숨기기 (finished 제외)
        if (status !== 'finished') {
            document.getElementById('game-result').classList.add('hidden');
        }

        if (status === 'countdown') {
            CountdownService.startCountdown();
        } else if (status === 'playing') {
            // ✅ currentPlayer 존재 확인 후 호출
            if (GameState.currentPlayer) {
                GamePlayManager.startGame();
            } else {
                console.error('❌ GameState.currentPlayer가 없어서 게임 시작 불가');
                console.log('현재 GameState:', GameState);
            }
        } else if (status === 'finished') {
            GamePlayManager.endGame();
        }
    }
}

console.log('✅ GameStateManager 모듈 로드 완료 (수정된 버전)');
