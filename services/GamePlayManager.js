import { GameState } from './gameState.js';
import { GameHelpers } from '../utils/helpers.js';
import { TimerManager } from './TimerManager.js';
import { UIController } from './UIController.js';
import { StatsCalculator } from './StatsCalculator.js';
import { UIService } from './uiService.js';
import { TypingHandler } from './TypingHandler.js';
import { RoomService } from './roomService.js';
import { database, auth } from '../config/firebase.js';
import { fetchTopRankings } from './rankingService.js';
import { GAME_CONSTANTS } from '../utils/constants.js';
// 게임 플레이 관리 서비스 (수정된 버전)
export const GamePlayManager = {
    playAgainShortcutHandler: null, // 리스너 참조 저장용

    // ✅ 게임 시작 (안전성 검사 추가)
    startGame() {
        // ✅ GameState 유효성 검사
        if (!GameState) {
            console.error('❌ GameState가 초기화되지 않음');
            return;
        }

        // ✅ currentPlayer 유효성 검사
        if (!GameState.currentPlayer) {
            console.error('❌ GameState.currentPlayer가 초기화되지 않음');
            return;
        }

        console.log('🎮 게임 시작 호출 - 내 상태:', GameState.currentPlayer?.status);

        if (GameState.currentPlayer.status !== 'playing') {
            console.log('⏳ 대기 상태 확인:', {
                // ✅ window 제거하고 안전한 접근
                '내 상태': GameState.currentPlayer?.status,
                '게임 상태': GameState.gameState,
                '이유': '다른 플레이어의 게임이 진행 중'
            });

            document.getElementById('waiting-message').textContent = '다음 게임에 참여하게 됩니다. 잠시만 기다려주세요...';
            document.getElementById('waiting-message').classList.remove('hidden');
            document.getElementById('countdown').classList.add('hidden');
            document.getElementById('game-text').classList.add('hidden');
            document.getElementById('typing-input').disabled = true;
            document.getElementById('game-result').classList.add('hidden');

            GameState.gameState = 'waiting_next';
            console.log('대기 상태 - 다음 게임까지 대기 중');
            return;
        }

        console.log('✅ 게임 참여 가능 - 게임 시작');
        GameState.gameState = 'playing';

        const currentTime = Date.now();
        GameState.startTime = currentTime;
        GameState.localStats.startTime = currentTime;
        GameState.lastQuickUpdate = currentTime;
        GameState.lastFullUpdate = currentTime;

        document.getElementById('waiting-message').classList.add('hidden');
        document.getElementById('countdown').classList.add('hidden');
        document.getElementById('game-result').classList.add('hidden');
        document.getElementById('game-text').classList.remove('hidden');
        document.getElementById('typing-input').disabled = false;
        document.getElementById('typing-input').focus();

        const typingInput = document.getElementById('typing-input');
        typingInput.value = '';
        typingInput.autocomplete = 'off';
        typingInput.setAttribute('autocomplete', 'off');
        typingInput.setAttribute('spellcheck', 'false');
        typingInput.setAttribute('autocorrect', 'off');
        typingInput.setAttribute('autocapitalize', 'off');
        typingInput.form?.reset();
        typingInput.disabled = false;
        typingInput.focus();

        typingInput.removeEventListener('keyup', TypingHandler.handleTypingInput);
        typingInput.addEventListener('keyup', TypingHandler.handleTypingInput.bind(TypingHandler));

        TimerManager.startGlobalCountdownTimer();
        UIController.displayGameText();
        console.log('게임 시작 완료 - 참여 상태:', GameState.currentPlayer.status);
    },

    // 게임 완료
    async finishGame() {
        console.log('🎯 게임 완료 - 플레이어:', GameState.currentPlayer.name);
        document.getElementById('typing-input').disabled = true;

        await StatsCalculator.requestServerCalculation();

        GameHelpers.optimizedFirebaseRequest(
            `roomPlayers/${GameState.currentRoom}/${GameState.currentPlayer.id}/finished`,
            'set',
            true
        )
        .then(() => {
            console.log('✅ finished 상태 업데이트 완료');
            return GameHelpers.optimizedFirebaseRequest(
                `roomPlayers/${GameState.currentRoom}/${GameState.currentPlayer.id}/finishTime`,
                'set',
                Date.now() - GameState.startTime
            );
        })
        .then(() => {
            console.log('✅ finishTime 업데이트 완료');
            console.log('⏰ 1초 후 게임 완료 확인 시작...');
            setTimeout(() => {
                this.checkAllPlayersFinished();
            }, 1000);
        })
        .catch(error => {
            console.error('❌ 게임 완료 처리 실패:', error);
            if (GameState.isRoomOwner) {
                console.log('🚨 업데이트 실패로 인한 강제 게임 종료');
                GameHelpers.optimizedFirebaseRequest(
                    `roomList/${GameState.currentRoom}/status`,
                    'set',
                    'finished'
                );
            }
        });
    },

    // ✅ [수정] 게임 완료 확인 함수 (방장 전용 로직 강화)
    checkAllPlayersFinished() {
        if (!GameState.isRoomOwner) return; // 방장만 체크

        console.log('🔍 게임 완료 확인 시작...');

        GameHelpers.optimizedFirebaseRequest(`roomPlayers/${GameState.currentRoom}`)
        .then(snapshot => {
            const players = Object.values(snapshot.val() || {});

            // 1. 현재 'playing' 상태인 플레이어만 추려냄 (대기자 'waiting' 제외)
            const activePlayers = players.filter(p => p.status === 'playing');

            // 2. 활성 플레이어 중 '아직 안 끝난 사람' 필터링 (finished !== true)
            const unFinishedPlayers = activePlayers.filter(p => p.finished !== true);

            const currentTime = Date.now();
            const gameStartTime = GameState.startTime;
            const timeElapsed = gameStartTime ? (currentTime - gameStartTime) / 1000 : 0;
            const twoMinutesPassed = timeElapsed >= 120;

            console.log('📊 게임 종료 체크:', {
                '활성 플레이어(playing)': activePlayers.length,
                '미완료 플레이어': unFinishedPlayers.length,
                '2분 경과': twoMinutesPassed
            });

            // 3. 종료 조건: (활성 플레이어가 있고 AND 미완료자가 0명) OR (2분 경과)
            // 주의: activePlayers가 0명인 경우(모두 나감)도 종료 처리
            const shouldEndGame = (activePlayers.length > 0 && unFinishedPlayers.length === 0) || twoMinutesPassed || activePlayers.length === 0;

            if (shouldEndGame) {
                if (twoMinutesPassed) {
                    console.log('⏰ 2분 경과로 인한 게임 종료');
                } else if (activePlayers.length === 0) {
                    console.log('👋 플레이어 부재로 인한 게임 종료');
                } else {
                    console.log('🏁 모든 활성 플레이어 완주 -> 게임 종료');
                }

                // 약간의 딜레이 후 상태 변경 (마지막 데이터 동기화 시간 확보)
                setTimeout(() => {
                    GameHelpers.optimizedFirebaseRequest(
                        `roomList/${GameState.currentRoom}/status`,
                        'set',
                        'finished'
                    )
                    .then(() => console.log('✅ 게임 상태 finished 변경 완료'))
                    .catch(error => console.error('❌ 게임 종료 상태 변경 실패:', error));
                }, 1000);
            } else {
                console.log(`⏳ 게임 진행 중... 남은 플레이어 ${unFinishedPlayers.length}명 대기`);
            }
        })
        .catch(error => {
            console.error('❌ 게임 완료 확인 실패:', error);
        });
    },

    // 게임 종료
    endGame() {
        console.log('🎉 게임 종료 - 결과 화면 표시');
        GameState.gameState = 'finished';

        document.getElementById('waiting-message').classList.add('hidden');
        document.getElementById('countdown').classList.add('hidden');
        document.getElementById('game-text').classList.add('hidden');
        document.getElementById('typing-input').disabled = true;
        document.getElementById('game-result').classList.remove('hidden');

        TimerManager.clearTimer();

        if (GameState.currentPlayer.status === 'waiting') {
            document.getElementById('waiting-message').textContent = '게임이 종료되었습니다. 결과를 확인하세요.';
            document.getElementById('waiting-message').classList.remove('hidden');
        }

        this.displayGameResults();
    },

    // 게임 결과 표시
    async displayGameResults() {
        try {
            const snapshot = await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${GameState.currentRoom}`);
            const players = Object.values(snapshot.val() || {});
            const playingPlayers = players.filter(p => p.status === 'playing');
            const sortedPlayers = playingPlayers.sort((a, b) => {
                if ((b.accuracy || 0) !== (a.accuracy || 0)) return (b.accuracy || 0) - (a.accuracy || 0);
                if (a.finishTime && b.finishTime) return a.finishTime - b.finishTime;
                return (b.wpm || 0) - (a.wpm || 0);
            });

            // 랭킹 포인트 지급 처리
            await this.awardRankingPoints(sortedPlayers);

            const finalRankings = document.getElementById('final-rankings');
            let rankingHtml = '';

            if (sortedPlayers.length > 0) {
                rankingHtml += '<h4>🎮 게임 참여자 순위</h4>';
                rankingHtml += sortedPlayers.map((player, index) => {
                    const isCurrentPlayer = player.id === auth.currentUser?.uid;
                    const rank = index + 1;

                    return `
                        <div class="final-rank-item ${index === 0 ? 'winner' : ''} ${isCurrentPlayer ? 'current-player' : ''}">
                            <div>
                                <strong>${rank}위 - ${GameHelpers.escapeHtml(player.name)}</strong>
                                ${isCurrentPlayer ? ' (나)' : ''}
                                ${index === 0 ? ' 🏆' : ''}
                                ${isCurrentPlayer && rank <= 10 && GameState.gbMemberId ? ' 💰' : ''}
                            </div>
                            <div>
                                진행률: ${player.progress.toFixed(1)}% | 
                                타수: ${player.wpm || 0} | 
                                정확도: ${(player.accuracy || 0).toFixed(1)}%
                                ${player.finishTime ? ` | 완료시간: ${(player.finishTime/1000).toFixed(1)}초` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            }

            finalRankings.innerHTML = rankingHtml;
        } catch (error) {
            console.error('게임 결과 표시 실패:', error);
        } finally {
            UIService.updateOwnerUI();
            // 방장인 경우 Ctrl + Enter 로 다시 시작하는 이벤트 리스너 추가
            if (GameState.isRoomOwner) {
               this.addPlayAgainShortcutListener();
            }
            // 게임 종료 후 오늘의 TOP 10 랭킹을 갱신합니다.
            fetchTopRankings();
        }
    },

    // 랭킹 포인트 지급
    async awardRankingPoints(sortedPlayers) {
        console.log('🏆 순위별 포인트 지급 및 기록 저장 시작');

        if (!sortedPlayers || sortedPlayers.length === 0) {
            console.log('플레이어가 없어 기록 저장을 건너뜁니다.');
            return;
        }

        const totalPlayers = sortedPlayers.length;
        const now = new Date();
        const koreanDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const currentDate = koreanDate.toISOString().split('T')[0];

        for (let i = 0; i < sortedPlayers.length; i++) {
            const player = sortedPlayers[i];
            const ranking = i + 1;

            try {
                const requestData = {
                    action: 'awardrankingpoints',
                    ranking: ranking,
                    totalplayers: totalPlayers,
                    playerid: player.id,
                    playername: player.name,
                    wpm: Math.round(player.wpm || 0),
                    accuracy: Math.round((player.accuracy || 0) * 10) / 10,
                    gamedate: currentDate,
                    siteid: GAME_CONSTANTS.SITE_ID,
                    gbmemberid: GNuboard_MEMBER_ID  // 현재 로그인한 회원 ID만 전송
                };


                const response = await fetch(`${G5_URL}/plugin/oktaja/api/oktaja_api.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams(requestData)
                });

                const result = await response.json();

                if (!result.success) {
                    console.error(`❌ ${player.name} 기록 저장 실패:`, result.error);
                }
            } catch (error) {
                console.error(`❌ ${player.name} API 호출 실패:`, error);
            }
        }

        try {
            if (database && GAME_CONSTANTS.SITE_ID) {
                await database.ref(`ranking_updates/${GAME_CONSTANTS.SITE_ID}`).set({
                    timestamp: Date.now(),
                    trigger: 'game_completed'
                });
            }
        } catch (error) {
            console.error('랭킹 업데이트 알림 전송 실패:', error);
        }
    },

    // ✅ 누락된 메서드 추가: 수동 게임 시작 (방장용)
    async startGameManually() {
        // 방장 권한 체크
        if (!GameState.isRoomOwner) {
            alert('방장만 게임을 시작할 수 있습니다.');
            return;
        }

        try {
            console.log('🎮 방장이 수동으로 게임 시작');
            
            // 방 상태를 countdown으로 변경
            await GameHelpers.optimizedFirebaseRequest(
                `roomList/${GameState.currentRoom}/status`, 
                'set', 
                'countdown'
            );
            
            console.log('✅ 게임 시작 신호 전송 완료');
        } catch (error) {
            console.error('❌ 게임 시작 실패:', error);
            alert('게임 시작에 실패했습니다: ' + error.message);
        }
    },
    // ✅ 누락된 메서드 추가: 게임 강제 종료 (방장용)  
    async forceEndGame() {
        if (!GameState.isRoomOwner) {
            alert('방장만 게임을 강제 종료할 수 있습니다.');
            return;
        }

        try {
            console.log('🛑 방장이 게임 강제 종료');
            
            await GameHelpers.optimizedFirebaseRequest(
                `roomList/${GameState.currentRoom}/status`,
                'set',
                'finished'
            );
            
            console.log('✅ 게임 강제 종료 완료');
        } catch (error) {
            console.error('❌ 게임 강제 종료 실패:', error);
            alert('게임 강제 종료에 실패했습니다: ' + error.message);
        }
    },
    // 게임 재시작 (방장용)
    async playAgain() {
        if (!GameState.isRoomOwner) {
            this.removePlayAgainShortcutListener();
            alert('방장만 게임을 다시 시작할 수 있습니다.');
            return;
        }

        try {
            console.log('🔄 게임 재시작 시작');
            
            // 새 예문 가져오기
            let newGameText = await RoomService.getRandomTypingText();
            
            // 방 상태를 waiting으로 변경
            await GameHelpers.optimizedFirebaseRequest(
                `roomList/${GameState.currentRoom}/status`, 
                'set', 
                'waiting'
            );

            // 모든 플레이어 데이터 초기화
            const snapshot = await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${GameState.currentRoom}`);
            const players = Object.values(snapshot.val() || {});
            
            const resetPromises = players.map(player => {
                const resetPlayerData = {
                    id: player.id, 
                    name: player.name, 
                    progress: 0, 
                    wpm: 0, 
                    accuracy: 100,
                    finished: false, 
                    status: 'playing', 
                    joinedAt: player.joinedAt || Date.now()
                };
                return GameHelpers.optimizedFirebaseRequest(
                    `roomPlayers/${GameState.currentRoom}/${player.id}`, 
                    'set', 
                    resetPlayerData
                );
            });

            await Promise.all(resetPromises);

            // 단축키 리스너 제거
            this.removePlayAgainShortcutListener();
            
            // 게임 데이터 초기화
            await GameHelpers.optimizedFirebaseRequest(`roomLive/${GameState.currentRoom}`, 'set', null);
            await GameHelpers.optimizedFirebaseRequest(`roomText/${GameState.currentRoom}`, 'set', newGameText);

            // 로컬 상태 업데이트
            GameState.gameText = newGameText;
            GameState.gameState = 'waiting';
            
            // UI 초기화
            document.getElementById('game-result').classList.add('hidden');
            document.getElementById('waiting-message').classList.remove('hidden');
            document.getElementById('start-game-section').classList.add('hidden');

            console.log('✅ 게임 재시작 완료');

            // 2초 후 자동 시작
            setTimeout(() => {
                if (GameState.gameState === 'waiting' && GameState.isRoomOwner) {
                    GameHelpers.optimizedFirebaseRequest(
                        `roomList/${GameState.currentRoom}/status`, 
                        'set', 
                        'countdown'
                    );
                }
            }, 2000);

        } catch (error) {
            console.error('❌ 게임 재시작 실패:', error);
            alert('게임 재시작에 실패했습니다: ' + error.message);
        }
    },

    // ✅ 단축키 리스너 메서드들
    addPlayAgainShortcutListener() {
        console.log('⌨️ 다시 시작 단축키 리스너 추가 (Ctrl + Enter)');
        
        if (this.playAgainShortcutHandler) {
            this.removePlayAgainShortcutListener();
        }

        this.playAgainShortcutHandler = (event) => {
            if (event.ctrlKey && event.key === 'Enter') {
                event.preventDefault();
                console.log('⌨️ Ctrl + Enter 감지됨 - 게임 다시 시작');
                this.playAgain();
            }
        };
        
        document.addEventListener('keydown', this.playAgainShortcutHandler);
    },

    removePlayAgainShortcutListener() {
        if (this.playAgainShortcutHandler) {
            console.log('⌨️ 다시 시작 단축키 리스너 제거');
            document.removeEventListener('keydown', this.playAgainShortcutHandler);
            this.playAgainShortcutHandler = null;
        } else {
            console.log('ℹ️ 제거할 단축키 리스너가 없음');
        }
    }
};
