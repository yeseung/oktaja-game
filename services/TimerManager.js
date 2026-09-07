import { GameState } from './gameState.js';

// 타이머 관리 서비스
let globalTimerInterval = null;

export const TimerManager = {
    // 전역 카운트다운 타이머 시작
    startGlobalCountdownTimer() {
        // 이미 타이머가 있다면 중복 방지
        if (globalTimerInterval) clearInterval(globalTimerInterval);

        const timeLimit = 120; // 2분(초)
        const gameStartTime = GameState.startTime || Date.now();
        GameState.startTime = gameStartTime;

        const updateTimer = () => {
            const now = Date.now();
            const elapsed = Math.floor((now - gameStartTime) / 1000);
            const remaining = Math.max(0, timeLimit - elapsed);
            const minutes = Math.floor(remaining / 60);
            const seconds = (remaining % 60).toString().padStart(2, '0');

            const timerElement = document.getElementById('time-remaining');
            if (timerElement) {
                timerElement.textContent = `${minutes}:${seconds}`;
                timerElement.style.color = (remaining <= 30) ? '#e53e3e' : '#4299e1';
                timerElement.style.fontWeight = 'bold';
            }

            // 0초가 되면 타이머 종료
            if (remaining <= 0 && globalTimerInterval) {
                this.clearTimer();
            }
        };

        updateTimer(); // 즉시 한 번 실행
        globalTimerInterval = setInterval(updateTimer, 1000);
    },

    clearTimer() {
        if (globalTimerInterval) {
            clearInterval(globalTimerInterval);
            globalTimerInterval = null;
        }
    }
};
