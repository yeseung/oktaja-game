import { GameState } from './gameState.js';
import { GameHelpers } from '../utils/helpers.js';
import { GAME_CONSTANTS } from '../utils/constants.js';

// UI 컨트롤 서비스
export const UIController = {
    // 로컬 UI 업데이트
    updateLocalUI() {
        const progress = (GameState.localStats.currentPosition / GameState.gameText.length) * 100;
        const timeElapsed = GameState.localStats.startTime
            ? (Date.now() - GameState.localStats.startTime) / 1000
            : 0;

        const accuracy = GameState.localStats.currentPosition > 0
            ? (GameState.localStats.correctKeystrokes / GameState.localStats.currentPosition) * 100
            : 100;

        const localKPM = timeElapsed > 0
            ? GameHelpers.calculateKPM(GameState.localStats.totalKeystrokes, timeElapsed)
            : 0;

        document.getElementById('progress').style.width = progress + '%';
        document.getElementById('progress-percent').textContent = progress.toFixed(1) + '%';
        document.getElementById('current-wpm').textContent = localKPM;
        document.getElementById('current-accuracy').textContent = accuracy.toFixed(1) + '%';
    },

    // 게임 텍스트 표시
    displayGameText() {
        const gameTextElement = document.getElementById('game-text');
        
        if (!GameState.gameText) {
            console.error('게임 텍스트가 없습니다. 기본 예문을 사용합니다.');
            GameState.gameText = GAME_CONSTANTS.SAMPLE_TEXTS[0];
            
            if (!GameState.gameText || GameState.gameText.length === 0) {
                GameState.gameText = "기본 예문을 불러오지 못했습니다. 관리자에게 문의하세요.";
            }
        }

        let initialText = '';
        for (let i = 0; i < GameState.gameText.length; i++) {
            const char = GameState.gameText[i];
            if (i === 0) {
                initialText += `<span class="current">${char === ' ' ? '&nbsp;' : GameHelpers.escapeHtml(char)}</span>`;
            } else {
                initialText += `<span class="pending">${char === ' ' ? '&nbsp;' : GameHelpers.escapeHtml(char)}</span>`;
            }
        }
        
        gameTextElement.innerHTML = initialText;
        gameTextElement.scrollLeft = 0;
    },

    // 타자 입력창 초기화
    resetTypingInput() {
        const typingInput = document.getElementById('typing-input');
        if (typingInput) {
            typingInput.value = '';
            typingInput.autocomplete = 'off';
            typingInput.setAttribute('spellcheck', 'false');
            typingInput.setAttribute('autocorrect', 'off');
            typingInput.setAttribute('autocapitalize', 'off');
            typingInput.disabled = true; // 기본적으로 비활성화
        }
    }
};
