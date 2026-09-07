import { GameState } from './gameState.js';
import { GameHelpers } from '../utils/helpers.js';
import { auth } from '../config/firebase.js';

// UI 업데이트 서비스
export const UIService = {
    // 방장 UI 업데이트
    updateOwnerUI() {
        // ✅ GameState 유효성 검사 추가
        if (!GameState) {
            console.warn('⚠️ GameState가 초기화되지 않음. updateOwnerUI 건너뜀');
            return;
        }
    // ✅ 디버깅 로그 추가
    console.log('🔍 방장 UI 업데이트:', {
        'isRoomOwner': GameState.isRoomOwner,
        'gameState': GameState.gameState,
        'currentUser': auth.currentUser?.uid?.slice(-6)
    });
        if (GameState.gameState === 'waiting') {
            const waitingMessage = document.getElementById('waiting-message');
            const startGameSection = document.getElementById('start-game-section');
            
            if (waitingMessage) {
                waitingMessage.classList.toggle('hidden', GameState.isRoomOwner);
            }
            if (startGameSection) {
                startGameSection.classList.toggle('hidden', !GameState.isRoomOwner);
            }
        }

        const forceEndGameSection = document.getElementById('force-end-game-section');
        if (forceEndGameSection) {
            let shouldShowForceEndButton = false;
            
            // ✅ 직접 import한 GameState 사용 (window 제거)
            const isRoomOwner = GameState.isRoomOwner;
            const currentGameState = GameState.gameState;
            const forceEndButtonDelay = 60 * 1000; // 1분 (밀리초)

            if (isRoomOwner) {
                // 게임이 'playing' 또는 'countdown' 상태일 때 활성화된 것으로 간주합니다.
                const isGameActive = currentGameState === 'playing' || currentGameState === 'countdown';

                // 방장의 플레이어 데이터를 찾습니다.
                const roomOwnerPlayer = Object.values(GameState.allPlayers || {}).find(
                    player => player.id === auth.currentUser?.uid
                );

                // 방장이 게임을 완료했고, 1분 이상 경과했는지 확인
                if (roomOwnerPlayer && roomOwnerPlayer.finished && roomOwnerPlayer.finishTimestamp) {
                    const timeSinceOwnerFinished = Date.now() - roomOwnerPlayer.finishTimestamp;
                    if (timeSinceOwnerFinished >= forceEndButtonDelay) {
                        shouldShowForceEndButton = true;
                    }
                }
            }
            
            console.log('[updateOwnerUI] isRoomOwner:', isRoomOwner, '| gameState:', currentGameState, '| shouldShowButton:', shouldShowForceEndButton);
            forceEndGameSection.classList.toggle('hidden', !shouldShowForceEndButton);
        }

        if (GameState.gameState === 'finished') {
            const playAgainBtn = document.getElementById('play-again-btn');
            if (playAgainBtn) {
                playAgainBtn.style.display = GameState.isRoomOwner ? 'inline-block' : 'none';
            }
        }
    },

    // 플레이어 목록 업데이트
    updatePlayersList(players) {
        // ✅ GameState 유효성 검사 추가
        if (!GameState) {
            console.warn('⚠️ GameState가 초기화되지 않음. updatePlayersList 건너뜀');
            return;
        }

        const playersArray = Object.values(players);

        // 플레이어 수 업데이트
        const playerCountDisplay = document.getElementById('player-count-display');
        if (playerCountDisplay) {
            playerCountDisplay.textContent = playersArray.length;
        }
        
        const playingPlayers = playersArray.filter(p => p.status === 'playing');
        const waitingPlayers = playersArray.filter(p => p.status === 'waiting');
        
        const playersListElement = document.getElementById('players-list');
        if (!playersListElement) {
            console.warn('⚠️ players-list 요소를 찾을 수 없음');
            return;
        }
        
        let html = '';
        
        if (playingPlayers.length > 0) {
            html += '<div class="player-section"><h4>🎮 게임 중</h4>';
            html += playingPlayers.map((player, index) => `
                <div class="player-item playing">
                    <div class="player-info">
                        <div class="player-status">🎯</div>
                        <span class="player-number">${index + 1}</span>
                        <span class="player-name">${GameHelpers.escapeHtml(player.name)}</span>
                        ${player.id === auth.currentUser?.uid ? ' (나)' : ''}
                        ${player.id === GameState.roomOwnerId ? ' 👑' : ''}
                    </div>
                    <span class="player-progress">${player.progress.toFixed(1)}%</span>
                </div>
            `).join('');
            html += '</div>';
        }
        
        if (waitingPlayers.length > 0) {
            html += '<div class="player-section"><h4>⏳ 다음 게임 대기</h4>';
            html += waitingPlayers.map((player, index) => `
                <div class="player-item waiting">
                    <div class="player-info">
                        <div class="player-status">⏳</div>
                        <span class="player-number">${playingPlayers.length + index + 1}</span>
                        <span class="player-name">${GameHelpers.escapeHtml(player.name)}</span>
                        ${player.id === auth.currentUser?.uid ? ' (나)' : ''}
                        ${player.id === GameState.roomOwnerId ? ' 👑' : ''}
                    </div>
                    <span class="player-status-text">대기 중</span>
                </div>
            `).join('');
            html += '</div>';
        }
        
        playersListElement.innerHTML = html;
        this.updateOwnerUI();
        GameState.allPlayers = players; // 모든 플레이어 데이터를 GameState에 저장
    },

    // 실시간 진행률 업데이트
    updateLiveProgress(liveData) {        
        const container = document.getElementById('live-progress');
        if (!container) return;

        const playersArray = Object.entries(liveData).map(([id, data]) => ({
            id,
            name: data.n || 'Unknown',
            progress: data.p || 0,
            timestamp: data.t || 0
        }));

        playersArray.sort((a, b) => b.progress - a.progress);

        if (playersArray.length === 0) {
            container.innerHTML = '<div class="no-data">게임 시작 후 표시됩니다</div>';
            return;
        }

        container.innerHTML = playersArray.map(player => `
            <div class="player-progress-item">
                <div class="player-info">
                    <span class="player-name">${GameHelpers.escapeHtml(player.name)}</span>
                    <span class="player-percentage">${player.progress}%</span>
                </div>
                <div class="progress-bar-wrapper">
                    <div class="progress-bar-fill" style="width: ${player.progress}%;"></div>
                </div>
            </div>
        `).join('');
    },

    // 타자 입력창 초기화 함수 (GameService에서 호출)
    resetTypingInput() {
        const typingInput = document.getElementById('typing-input');
        if (typingInput) {
            typingInput.value = '';
            typingInput.autocomplete = 'off';
            typingInput.setAttribute('autocomplete', 'off');
            typingInput.setAttribute('spellcheck', 'false');
            typingInput.setAttribute('autocorrect', 'off');
            typingInput.setAttribute('autocapitalize', 'off');
            typingInput.disabled = true; // 기본적으로 비활성화
        }
    }
};

console.log('✅ UI 서비스 초기화 완료 (ES6 모듈 버전)');
