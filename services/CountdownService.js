import { GameState } from './gameState.js';
import { GameHelpers } from '../utils/helpers.js';

// 카운트다운 서비스
export const CountdownService = {
    // 카운트다운 시작
    startCountdown() {
        GameState.gameState = 'countdown';
        document.getElementById('waiting-message').classList.add('hidden');
        document.getElementById('countdown').classList.remove('hidden');
        document.getElementById('game-result').classList.add('hidden');

        let count = 3;
        const countdownElement = document.getElementById('countdown');
        const countdownInterval = setInterval(() => {
            countdownElement.textContent = count;
            count--;

            if (count < 0) {
                clearInterval(countdownInterval);
                if (GameState.isRoomOwner) {
                    GameHelpers.optimizedFirebaseRequest(
                        `roomList/${GameState.currentRoom}/status`,
                        'set',
                        'playing'
                    );
                }
            }
        }, 1000);
    }
};
