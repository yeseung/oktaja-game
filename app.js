import { RoomService } from './services/roomService.js';
import { GameState } from './services/gameState.js';
import { GameHelpers } from './utils/helpers.js';
import { GAME_CONSTANTS } from './utils/constants.js';
import { GamePlayManager } from './services/GamePlayManager.js';
import { ListenerService } from './services/listenerService.js';
import { ChatService } from './services/chatService.js';
import { auth, database } from './config/firebase.js';

// 메인 애플리케이션 로직 (완전 ES6 모듈 버전)
class TypingGameApp {
    constructor() {
        this.playerNameInput = null;
        this.init();
    }

    async init() {
        console.log('사이트별 제한 타자 게임 로딩 완료');
        console.log('사이트 ID:', GAME_CONSTANTS.SITE_ID);
        
        // 그누보드에서 전달된 사이트 ID 또는 호스트명으로 current-site 업데이트
        document.getElementById('current-site').textContent = 
            typeof OKTAJA_SITE_ID !== 'undefined' && OKTAJA_SITE_ID ? 
            OKTAJA_SITE_ID : window.location.hostname;
        
        this.playerNameInput = document.getElementById('player-name');
        
        // 그누보드 닉네임으로 플레이어 이름 초기화 및 필드 제어
        this.initializePlayerNameField();
        
        this.setupEventListeners();
        GameHelpers.checkFirebaseConnection();
        this.startAutoCleanup();
        await this.verifyAuthAndRules();
    }

    // 플레이어 이름 필드 초기화
    initializePlayerNameField() {
        const isGnuBoardMember = this.isGnuBoardMember();
        
        if (isGnuBoardMember) {
            this.playerNameInput.value = GNuboard_MEMBER_NICKNAME;
            this.playerNameInput.readOnly = true;
            this.playerNameInput.classList.add('readonly');
        } else {
            this.playerNameInput.value = '';
            this.playerNameInput.readOnly = false;
            this.playerNameInput.classList.remove('readonly');
        }
    }

    // 그누보드 회원 여부 확인
    isGnuBoardMember() {
        return typeof GNuboard_MEMBER_NICKNAME !== 'undefined' && 
               GNuboard_MEMBER_NICKNAME && 
               GNuboard_MEMBER_NICKNAME.trim() !== '';
    }

    setupEventListeners() {
        // 클릭 리스너 추가 헬퍼 함수
        const addClickListener = (id, handler) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', handler);
            } else {
                console.warn(`[setupEventListeners] Element with id "${id}" not found.`);
            }
        };

        // ✅ GameService 대신 GamePlayManager 사용
        addClickListener('join-game-btn', this.joinGame.bind(this));
        addClickListener('start-game-btn', () => GamePlayManager?.startGameManually());
        addClickListener('play-again-btn', () => GamePlayManager?.playAgain());
        addClickListener('force-end-game-btn', () => GamePlayManager?.forceEndGame());
        addClickListener('leave-game-btn', this.leaveGame.bind(this));

        // 페이지 나가기 이벤트 리스너 (강화된 버전)
        window.addEventListener('beforeunload', (event) => {
            // 1. 게임 진행 중 경고 표시
            if (GameState?.currentRoom && GameState.gameState !== 'waiting') {
                event.preventDefault();
                event.returnValue = '게임에서 나가시겠습니까? 진행 상황이 저장되지 않을 수 있습니다.';
            }

            // 2. Firebase 연결 강제 종료 및 데이터 정리
            if (GameState?.currentRoom && GameState.currentPlayer) {
                console.log('🚪 브라우저 종료 감지 - 데이터 정리 및 연결 해제');
                
                // (선택) 클라이언트 측 정리 시도 (성공 보장 못함)
                try {
                    if (RoomService && typeof RoomService.cleanupUserRoom === 'function') {
                        RoomService.cleanupUserRoom(GameState.currentPlayer.id);
                    }
                } catch (e) {
                    console.warn('cleanupUserRoom failed:', e);
                }

                // ✅ [핵심] Firebase 연결을 명시적으로 끊어 onDisconnect 즉시 실행 유도
                try {
                    if (database) {
                        database.goOffline(); 
                    }
                } catch (e) {
                    console.warn('goOffline failed:', e);
                }
            }
        });

    }

    // Firebase 인증 및 규칙 검증
    async verifyAuthAndRules() {
        console.log('=== 인증 및 규칙 검증 ===');
        
        return new Promise((resolve) => {
            auth.onAuthStateChanged((user) => {
                if (user) {
                    console.log('✅ 사용자 인증 완료');
                    console.log('사용자 ID:', user.uid);
                    console.log('익명 사용자:', user.isAnonymous);
                    this.testDatabaseAccess();
                    resolve();
                } else {
                    console.log('❌ 사용자 인증 안됨');
                    console.log('익명 인증 시도 중...');
                    
                    auth.signInAnonymously()
                        .then(() => {
                            console.log('✅ 익명 인증 성공');
                            resolve();
                        })
                        .catch((error) => {
                            console.error('❌ 익명 인증 실패:', error.code, error.message);
                            resolve();
                        });
                }
            });
        });
    }

    // 데이터베이스 접근 테스트
    testDatabaseAccess() {
        console.log('데이터베이스 접근 권한 테스트 중...');
        
        database.ref('roomList').limitToFirst(1).once('value')
            .then((snapshot) => {
                console.log('✅ 데이터베이스 읽기 성공');
                console.log('데이터:', snapshot.val());
            })
            .catch((error) => {
                console.error('❌ 데이터베이스 읽기 실패:', error.code, error.message);
            });
    }

    // 게임 참여 (완전 ES6 모듈 방식)
    async joinGame() {
        const joinButton = document.getElementById('join-game-btn');
        joinButton.disabled = true;

        // 인증 상태 확인
        if (!auth.currentUser) {
            alert('인증이 완료되지 않았습니다. 잠시 후 다시 시도해주세요.');
            joinButton.disabled = false;
            return;
        }

        // 게임 상태 확인
        if (!GameState) {
            alert('게임이 아직 로드 중입니다. 잠시 후 다시 시도해주세요.');
            joinButton.disabled = false;
            return;
        }

        try {
            // ✅ ES6 모듈 방식 - 방 찾기 또는 생성
            const roomId = await RoomService.findOrCreateRoom();
            if (!roomId) {
                throw new Error('방을 찾거나 생성하지 못했습니다.');
            }

            // 플레이어 이름 결정
            const finalPlayerName = await this.determinePlayerName(roomId);
            
            // 플레이어 객체 생성
            const playerData = this.createPlayerData(finalPlayerName);
            
            // 그누보드 회원 ID 저장
            this.setGnuBoardMemberId();

            console.log('플레이어 생성됨:', playerData);

            // ✅ ES6 모듈 방식 - 방에 플레이어 추가
            await RoomService.addPlayerToRoom(roomId, playerData);

        } catch (error) {
            console.error("게임 참여 실패:", error);
            alert(error.message || '게임 참여에 실패했습니다. 다시 시도해주세요.');
            joinButton.disabled = false;
        }
    }

    // 플레이어 이름 결정
    async determinePlayerName(roomId) {
        const isGnuBoardMember = this.isGnuBoardMember();
        
        if (isGnuBoardMember) {
            return GNuboard_MEMBER_NICKNAME;
        } else {
            // ✅ ES6 모듈 방식 - 비회원 이름 생성
            const guestName = await GameHelpers.generateUniqueGuestName(roomId);
            this.playerNameInput.value = guestName;
            this.playerNameInput.classList.add('readonly');
            console.log('비회원 이름 자동 생성:', guestName);
            return guestName;
        }
    }

    // 플레이어 데이터 생성
    createPlayerData(playerName) {
        const playerData = {
            id: auth.currentUser.uid,
            name: playerName,
            progress: 0,
            wpm: 0,
            accuracy: 100,
            finished: false,
            status: 'playing',
            joinedAt: Date.now()
        };

        // ✅ ES6 모듈 방식 - GameState에 플레이어 정보 저장
        GameState.currentPlayer = playerData;
        
        return playerData;
    }

    // 그누보드 회원 ID 설정
    setGnuBoardMemberId() {
        if (typeof GNuboard_MEMBER_ID !== 'undefined' && 
            GNuboard_MEMBER_ID && 
            GNuboard_MEMBER_ID.trim() !== '') {
            GameState.gbMemberId = GNuboard_MEMBER_ID;
        }
    }

    // 게임 나가기 (완전 ES6 모듈 방식)
    leaveGame() {
        // 게임 정리
        if (GameState?.currentRoom && GameState.currentPlayer) {
            RoomService.cleanupUserRoom(GameState.currentPlayer.id);
        }

        // 리스너 정리
        this.cleanupListeners();

        // UI 전환
        this.switchToLoginScreen();

        // 플레이어 이름 필드 상태 복원
        this.resetPlayerNameField();

        // 게임 상태 초기화
        this.resetGameState();
    }

// 리스너 정리
cleanupListeners() {
    // ListenerService 리스너 정리
    try {
        if (ListenerService?.detachAllListeners) {
            ListenerService.detachAllListeners();
        }
    } catch (error) {
        console.warn('⚠️ ListenerService 정리 실패:', error);
    }

    // ✅ GameService 대신 GamePlayManager 사용
    try {
        if (GamePlayManager && 
            GamePlayManager.removePlayAgainShortcutListener && 
            typeof GamePlayManager.removePlayAgainShortcutListener === 'function') {
            GamePlayManager.removePlayAgainShortcutListener();
        }
    } catch (error) {
        console.warn('⚠️ GamePlayManager 단축키 리스너 정리 실패:', error);
    }

    // ChatService 리스너 정리
    try {
        if (ChatService?.detachListeners) {
            ChatService.detachListeners();
        }
    } catch (error) {
        console.warn('⚠️ ChatService 정리 실패:', error);
    }
}


    // 로그인 화면으로 전환
    switchToLoginScreen() {
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    }

    // 플레이어 이름 필드 초기화
    resetPlayerNameField() {
        const isGnuBoardMember = this.isGnuBoardMember();
        
        if (isGnuBoardMember) {
            this.playerNameInput.value = GNuboard_MEMBER_NICKNAME;
            this.playerNameInput.classList.add('readonly');
        } else {
            this.playerNameInput.value = '';
            this.playerNameInput.readOnly = false;
            this.playerNameInput.classList.remove('readonly');
        }
    }

    // 게임 상태 초기화
    resetGameState() {
        if (GameState) {
            GameState.currentPlayer = null;
            GameState.currentRoom = null;
            GameState.gameState = 'waiting';
            GameState.isRoomOwner = false;
            GameState.gbMemberId = null;
        }
    }

    // 자동 정리 시스템 (완전 ES6 모듈 방식)
    startAutoCleanup() {
        setInterval(async () => {
            try {
                // ✅ ES6 모듈 방식 - GameHelpers 확인
                if (!GameHelpers?.optimizedFirebaseRequest) {
                    return;
                }

                const oneHourAgo = Date.now() - (60 * 60 * 1000);
                
                // ✅ ES6 모듈 방식 - 모든 방 조회
                const allRoomsSnapshot = await GameHelpers.optimizedFirebaseRequest('roomList');
                const allRooms = allRoomsSnapshot.val() || {};
                
                const cleanupPromises = [];
                let cleanupCount = 0;

                // 오래된 방들 정리
                Object.entries(allRooms).forEach(([roomId, roomData]) => {
                    if (roomData.createdAt < oneHourAgo) {
                        cleanupPromises.push(
                            GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}`, 'set', null),
                            GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}`, 'set', null),
                            GameHelpers.optimizedFirebaseRequest(`roomText/${roomId}`, 'set', null),
                            GameHelpers.optimizedFirebaseRequest(`roomLive/${roomId}`, 'set', null)
                        );

                        if (roomData.siteId) {
                            cleanupPromises.push(
                                GameHelpers.optimizedFirebaseRequest(`siteRooms/${roomData.siteId}`, 'set', null)
                            );
                        }

                        cleanupCount++;
                    }
                });

                // 정리 실행
                if (cleanupCount > 0) {
                    await Promise.all(cleanupPromises);
                    console.log('자동 정리 완료:', cleanupCount + '개 방');
                }

            } catch (error) {
                console.error('자동 정리 실패:', error);
            }
        }, 60 * 60 * 1000); // 1시간마다 실행
    }
}

// ES6 모듈 방식으로 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        console.log('🚀 Starting Typing Game App (완전 ES6 모듈 버전)');
        new TypingGameApp();
    }, 500);
});

// ES6 모듈 export
export { TypingGameApp };
