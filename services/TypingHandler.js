import { GameState } from './gameState.js';
import { GamePlayManager } from './GamePlayManager.js';
import { StatsCalculator } from './StatsCalculator.js';
import { GameHelpers } from '../utils/helpers.js';

// 타이핑 입력 처리 서비스 (단순화 버전)
export const TypingHandler = {
    // 타이핑 입력 핸들러
    handleTypingInput(event) {
        // Enter 키 감지
        if (event.key === 'Enter' || event.keyCode === 13) {
            event.preventDefault();
            if (event.target.value.length >= GameState.gameText.length) {
                GamePlayManager.finishGame();
            }
        } else {
            StatsCalculator.updateLocalStats(event.target.value);
            this.updateTextHighlight(event.target.value);
        }
    },

    // 텍스트 하이라이팅
    updateTextHighlight(inputText) {
        const gameTextElement = document.getElementById('game-text');
        if (!gameTextElement || !GameState.gameText) return;
        
        let highlightedText = '';
        
        for (let i = 0; i < GameState.gameText.length; i++) {
            const char = GameState.gameText[i];
            if (i < inputText.length) {
                if (inputText[i] === char) {
                    highlightedText += `<span class="completed-char">${char === ' ' ? '&nbsp;' : GameHelpers.escapeHtml(char)}</span>`;
                } else {
                    highlightedText += `<span class="error-char">${char === ' ' ? '&nbsp;' : GameHelpers.escapeHtml(char)}</span>`;
                }
            } else if (i === inputText.length) {
                highlightedText += `<span class="current-char">${char === ' ' ? '&nbsp;' : GameHelpers.escapeHtml(char)}</span>`;
            } else {
                highlightedText += `<span class="pending">${char === ' ' ? '&nbsp;' : GameHelpers.escapeHtml(char)}</span>`;
            }
        }
        
        gameTextElement.innerHTML = highlightedText;
        this.scrollToCurrentPosition(inputText.length);
    },

    // 스크롤 위치 조절 (기존 방식 복원)
    scrollToCurrentPosition(currentIndex) {
        const gameTextElement = document.getElementById('game-text');
        if (!gameTextElement) return;
        
        const spans = gameTextElement.querySelectorAll('span');
        if (!spans[currentIndex]) return;
        
        const currentSpan = spans[currentIndex];
        const containerWidth = gameTextElement.clientWidth;
        const spanLeft = currentSpan.offsetLeft;
        
        // ✅ 기존의 단순한 로직 복원
        const targetScrollLeft = spanLeft - (containerWidth / 0.7);
        gameTextElement.scrollTo({
            left: Math.max(0, targetScrollLeft),
            behavior: 'smooth'
        });
    }
};

console.log('✅ TypingHandler 모듈 로드 완료 (단순화 버전)');
