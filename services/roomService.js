import { GAME_CONSTANTS } from '../utils/constants.js';
import { GameState } from './gameState.js';
import { GameHelpers } from '../utils/helpers.js';
import { auth, database } from '../config/firebase.js';
import { ListenerService } from './listenerService.js';
import { TodayBestService } from './todayBestService.js';
import { fetchTopRankings } from './rankingService.js';
import { ChatService } from './chatService.js';

// 방 관리 서비스 (완전 ES6 모듈 버전)
export const RoomService = {
    // ❌ safeCall 함수 완전 제거

    // 데이터베이스에서 예문 가져오기
    async getRandomTypingText() {
        try {
            console.log('🔄 예문 API 호출 시작');
            
            const response = await fetch(`${G5_URL}/plugin/oktaja/typing_api.php?action=get_random_text&difficulty=normal`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('📡 예문 API 응답:', data);
            
            if (data.success && data.text) {
                console.log('✅ 데이터베이스 예문 사용:', data.text.substring(0, 30) + '...');
                return data.text;
            } else if (data.fallback) {
                console.warn('⚠️ 데이터베이스 예문 없음, 기본 예문 사용');
                return GAME_CONSTANTS.SAMPLE_TEXTS[Math.floor(Math.random() * GAME_CONSTANTS.SAMPLE_TEXTS.length)];
            } else {
                throw new Error('예문 데이터가 없습니다.');
            }
        } catch (error) {
            console.error('❌ 예문 API 호출 실패:', error);
            console.log('🔄 기본 예문 사용');
            return GAME_CONSTANTS.SAMPLE_TEXTS[Math.floor(Math.random() * GAME_CONSTANTS.SAMPLE_TEXTS.length)];
        }
    },

    // 방장 승계 함수
    async promoteNewRoomOwner(roomId) {
        try {
            const playersSnapshot = await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}`);
            const playersData = playersSnapshot.val() || {};
            const playersArray = Object.values(playersData);
            
            console.log('🔄 방장 승계 시작:', {
                '방 ID': roomId,
                '전체 플레이어 수': playersArray.length
            });

            if (playersArray.length > 0) {
                const sortedPlayers = playersArray.sort((a, b) => {
                    const timeA = a.joinedAt || Infinity;
                    const timeB = b.joinedAt || Infinity;
                    if (timeA !== timeB) {
                        return timeA - timeB;
                    }
                    return a.id.localeCompare(b.id);
                });

                const newOwner = sortedPlayers[0];
                console.log('🔄 방장 승계:', {
                    '새 방장': {
                        이름: newOwner.name,
                        ID: newOwner.id.slice(-6),
                        입장시간: new Date(newOwner.joinedAt).toLocaleTimeString()
                    }
                });

                await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}/createdBy`, 'set', newOwner.id);
                console.log('✅ 새로운 방장 승계 완료:', newOwner.name);
            } else {
                console.log('👥 플레이어가 없지만 방 정리는 건너뜀 (무한 루프 방지)');
                await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}/status`, 'set', 'waiting');
                await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}/playerCount`, 'set', 0);
                console.log('🔄 빈 방 상태 정리 완료');
            }
        } catch (error) {
            console.error('❌ 방장 승계 실패:', error);
        }
    },    
    

    // 사이트별 방 정리
    async cleanupSiteRoom(siteId) {
        try {
            const siteRoomSnapshot = await GameHelpers.optimizedFirebaseRequest(`siteRooms/${siteId}`);
            const roomId = siteRoomSnapshot.val();
            
            if (roomId) {
                await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}`, 'set', null);
                await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}`, 'set', null);
                await GameHelpers.optimizedFirebaseRequest(`roomText/${roomId}`, 'set', null);
                await GameHelpers.optimizedFirebaseRequest(`roomLive/${roomId}`, 'set', null);
                await GameHelpers.optimizedFirebaseRequest(`siteRooms/${siteId}`, 'set', null);
                console.log('사이트 방 정리 완료:', roomId);
            }
        } catch (error) {
            console.error('사이트 방 정리 실패:', error);
        }
    },
    

    // 사용자별 방 정리
    async cleanupUserRoom(userId) {
        if (!userId) {
            console.warn('cleanupUserRoom: userId is null or undefined.');
            return;
        }

        try {
            const userRoomSnapshot = await GameHelpers.optimizedFirebaseRequest(`userRooms/${userId}`);
            const roomId = userRoomSnapshot.val();
            
            if (roomId) {
                const roomSnapshot = await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}`);
                const roomData = roomSnapshot.val();

                await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}/${userId}`, 'set', null);
                await GameHelpers.optimizedFirebaseRequest(`roomLive/${roomId}/${userId}`, 'set', null);
                await GameHelpers.optimizedFirebaseRequest(`userRooms/${userId}`, 'set', null);
                // ✅ ES6 모듈 방식 - window 제거
                await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}/playerCount`, 'set', firebase.database.ServerValue.increment(-1));

                if (roomData && roomData.createdBy === userId) {
                    await this.promoteNewRoomOwner(roomId);
                }

                console.log('사용자 방 정리 완료:', userId);
                await this.recalculatePlayerCount(roomId);
            }
        } catch (error) {
            console.error('사용자 방 정리 실패:', error);
        }
    },    
    

    // 실제 플레이어 수 재계산
    async recalculatePlayerCount(roomId) {
        if (!roomId) {
            console.warn('recalculatePlayerCount: roomId is null or undefined.');
            return;
        }

        try {
            if (!GameState.isRoomOwner) {
                console.log(`방 ${roomId} 인원수 재계산 건너뜀: 현재 사용자는 방장이 아님.`);
                return;
            }

            const playersSnapshot = await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}`);
            const players = playersSnapshot.val() || {};
            const actualCount = Object.keys(players).length;

            await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}/playerCount`, 'set', actualCount);
            console.log(`방 ${roomId} 인원수 재계산 (방장): ${actualCount}명`);

            if (actualCount === 0) {
                const roomSnapshot = await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}`);
                const roomData = roomSnapshot.val();
                
                if (roomData) {
                    if (roomData.siteId) {
                        await this.cleanupSiteRoom(roomData.siteId);
                    } else {
                        await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}`, 'set', null);
                        await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}`, 'set', null);
                    }
                }
            }
        } catch (error) {
            console.error(`방 ${roomId} 인원수 재계산 실패:`, error);
        }
    },    
    

// roomService.js의 createNewRoom 메서드 수정
async createNewRoom() {
    try {
        if (!auth.currentUser) {
            throw new Error('사용자 인증이 필요합니다');
        }

        const roomId = 'room_' + GAME_CONSTANTS.SITE_ID + '_' + Date.now();
        const roomData = {
            status: 'waiting',
            createdBy: auth.currentUser.uid, // ✅ 방 생성자 ID 저장
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            playerCount: 0,
            maxPlayers: GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM,
            difficulty: 'normal',
            siteId: GAME_CONSTANTS.SITE_ID
        };
            // 예문 가져오기
            const gameTextContent = await this.getRandomTypingText();
            
            await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}`, 'set', roomData);
            await GameHelpers.optimizedFirebaseRequest(`siteRooms/${GAME_CONSTANTS.SITE_ID}`, 'set', roomId);
            await GameHelpers.optimizedFirebaseRequest(`roomText/${roomId}`, 'set', gameTextContent);

        // ✅ 방 생성자는 확실히 방장으로 설정
        GameState.isRoomOwner = true;
        console.log('👑 방 생성자로서 방장 권한 설정:', auth.currentUser.uid);

        return roomId;
    } catch (error) {
        console.error('❌ 방 생성 실패:', error);
        throw new Error('방 생성에 실패했습니다. 새로고침 후 다시 시도해주세요.');
    }
},

    // 방 찾기 또는 생성 (단일 진입점)
    async findOrCreateRoom() {
        try {
            const siteRoomSnapshot = await GameHelpers.optimizedFirebaseRequest(`siteRooms/${GAME_CONSTANTS.SITE_ID}`);
            
            if (siteRoomSnapshot.exists()) {
                const roomId = siteRoomSnapshot.val();
                
                const roomSnapshot = await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}`);
                const roomData = roomSnapshot.val();
                
                // 방 데이터가 있고, 유효한 상태일 때
                if (roomData && ['waiting', 'countdown', 'playing', 'finished'].includes(roomData.status)) {
                    // ❗ 더 정확한 인원수 검증: 실제 플레이어 목록을 확인
                    const playersSnapshot = await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}`);
                    const actualPlayerCount = playersSnapshot.exists() ? Object.keys(playersSnapshot.val()).length : 0;

                    if (actualPlayerCount >= GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM) {
                        alert(`이 사이트의 방이 가득 찼습니다.\n현재 인원: ${actualPlayerCount}/${GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM}명\n잠시 후 다시 시도해주세요.`);
                        return null; // 참여 불가
                    }
                    
                    return roomId;
                } else {
                    await this.cleanupSiteRoom(GAME_CONSTANTS.SITE_ID);
                }
            }

            // 기존 방이 없거나 유효하지 않으면 새로 생성
            return await this.createNewRoom();
            
        } catch (error) {
            console.error('방 찾기/생성 실패:', error);
            alert('연결에 실패했습니다. 새로고침 후 다시 시도해주세요.');
            return null;
        }
    },    

    // 기존 방 참여
    async joinExistingRoom(roomId) {
        try {
            await this.addPlayerToRoom(roomId, GameState.currentPlayer);
        } catch (error) {
            console.error('방 참여 실패:', error);
            throw error;
        }
    },    

    // 플레이어를 방에 추가하고 UI/리스너 설정
async addPlayerToRoom(roomId, playerObject) {
    try {
        if (!auth.currentUser) {
            throw new Error('플레이어 추가 실패: 사용자 인증이 필요합니다');
        }

        console.log('🏠 방 참여 시작:', roomId);
        console.log('전달받은 플레이어 객체:', playerObject);

        // ✅ GameState.currentPlayer 먼저 설정
        GameState.currentRoom = roomId;
        GameState.currentPlayer = { ...playerObject }; // 깊은 복사로 안전하게 설정

        const roomSnapshot = await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}`);
        const roomData = roomSnapshot.val();
        
        if (!roomData) {
            throw new Error('방이 존재하지 않습니다.');
        }

        // ✅ 실제 플레이어 수 확인 및 동기화 (중요!)
        const playersSnapshot = await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}`);
        const actualPlayers = playersSnapshot.val() || {};
        const actualPlayerCount = Object.keys(actualPlayers).length;
        const storedPlayerCount = roomData.playerCount || 0;

        console.log('📊 플레이어 수 비교:', {
            '저장된 수': storedPlayerCount,
            '실제 수': actualPlayerCount,
            '최대 수': GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM
        });

        // ✅ playerCount 동기화 (실제 수와 다르면 수정)
        if (storedPlayerCount !== actualPlayerCount) {
            console.log('🔧 playerCount 동기화 중...', `${storedPlayerCount} → ${actualPlayerCount}`);
            await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}/playerCount`, 'set', actualPlayerCount);
        }

        // ✅ 실제 플레이어 수로 검증
        if (actualPlayerCount >= GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM) {
            throw new Error(`방이 가득 찼습니다.\n실제 인원: ${actualPlayerCount}/${GAME_CONSTANTS.MAX_PLAYERS_PER_ROOM}명\n\n이 사이트에서는 동시에 1개 방만 운영됩니다.\n다른 플레이어가 나갈 때까지 기다려주세요.`);
        }

        // ✅ 개선된 중복 참여 체크
        if (actualPlayers[playerObject.id]) {
            const existingPlayer = actualPlayers[playerObject.id];
            const timeSinceJoined = Date.now() - (existingPlayer.joinedAt || 0);
            
            // 5분 이내 참여한 경우만 중복으로 간주 (새로고침 고려)
            if (timeSinceJoined < 5 * 60 * 1000) {
                console.log('⚠️ 최근에 참여한 플레이어 - 기존 데이터 업데이트 및 UI 전환');
                
                // 기존 플레이어 데이터를 현재 시간으로 업데이트
                const updatedPlayer = {
                    ...existingPlayer,
                    joinedAt: Date.now(),
                    status: playerObject.status
                };
                
                await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}/${playerObject.id}`, 'set', updatedPlayer);
                GameState.currentRoom = roomId;
                GameState.currentPlayer = updatedPlayer;
                
                // UI 전환
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('game-screen').classList.remove('hidden');
                
                // 리스너 설정
                try {
                    ListenerService.setupOptimizedListeners();
                } catch (error) {
                    console.error('setupOptimizedListeners 호출 실패:', error);
                }
                
                // 채팅 초기화
                if (ChatService && typeof ChatService.init === 'function') {
                    ChatService.init(roomId, updatedPlayer.name);
                }
                
                console.log('✅ 기존 플레이어 데이터 업데이트 완료');
                return;
            } else {
                // 5분 이상 지난 경우 오래된 데이터로 간주하고 제거 후 새로 참여
                console.log('🧹 오래된 플레이어 데이터 발견 - 제거 후 새로 참여');
                await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}/${playerObject.id}`, 'set', null);
                await GameHelpers.optimizedFirebaseRequest(`roomLive/${roomId}/${playerObject.id}`, 'set', null);
                
                // 플레이어 수 재계산
                const currentCount = Object.keys(actualPlayers).length - 1; // 제거된 플레이어 제외
                await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}/playerCount`, 'set', Math.max(0, currentCount));
            }
        }

        const isNewRoom = !roomData.createdBy || roomData.createdBy === auth.currentUser.uid;
        if (!isNewRoom) {
            const currentOwner = roomData.createdBy;
            if (currentOwner) {
                const existingPlayersData = actualPlayers; // 이미 조회한 데이터 재사용
                if (!existingPlayersData[currentOwner]) {
                    console.log('⚠️ 방장이 존재하지 않음. 새로운 방장 승계 시도');
                    await this.promoteNewRoomOwner(roomId);
                }
            }
        }

        const currentGameState = roomData.status || 'waiting';
        const existingPlayers = Object.values(actualPlayers); // 이미 조회한 데이터 재사용
        const playingPlayers = existingPlayers.filter(p => p.status === 'playing');

        GameState.currentRoom = roomId;
        // ✅ 안전한 방식으로 상태 설정
        if (currentGameState === 'finished') {
            GameState.currentPlayer.status = 'waiting';
            console.log('게임이 끝난 방에 참여합니다. 다음 게임까지 대기합니다.');
        } else if (playingPlayers.length === 0) {
            GameState.currentPlayer.status = 'playing';
            console.log('방에 게임 중인 플레이어가 없습니다. 게임 참여 상태로 설정됩니다.');
        } else if (currentGameState === 'playing' || currentGameState === 'countdown') {
            GameState.currentPlayer.status = 'waiting';
            console.log('게임이 진행 중입니다. 다음 게임까지 대기합니다.');
        } else {
            GameState.currentPlayer.status = 'playing';
            console.log('게임 대기 중입니다. 게임 참여 상태로 설정됩니다.');
        }
        // ✅ 업데이트된 플레이어 데이터로 Firebase 저장
        const finalPlayerData = { ...GameState.currentPlayer };
        finalPlayerData.joinedAt = Date.now();

        console.log('✅ GameState.currentPlayer 설정 완료:', GameState.currentPlayer);
        playerObject.joinedAt = Date.now();

        // ✅ 실제 플레이어 수 기반으로 증가
        await GameHelpers.optimizedFirebaseRequest(`roomPlayers/${roomId}/${playerObject.id}`, 'set', playerObject);
        await GameHelpers.optimizedFirebaseRequest(`roomList/${roomId}/playerCount`, 'set', actualPlayerCount + 1);
        await GameHelpers.optimizedFirebaseRequest(`userRooms/${playerObject.id}`, 'set', roomId);

        // ✅ 연결 끊김 핸들러 설정 (ListenerService 위임)
        // 중복 설정을 방지하고 중앙 관리된 로직을 사용
        console.log('📌 addPlayerToRoom: ListenerService를 통해 onDisconnect 설정 요청');
        try {
            if (ListenerService && typeof ListenerService.setupDisconnectHandlers === 'function') {
                ListenerService.setupDisconnectHandlers(GameState.currentPlayer.id);
            } else {
                console.error('❌ ListenerService.setupDisconnectHandlers 함수를 찾을 수 없음');
            }
        } catch (error) {
            console.error('❌ onDisconnect 설정 중 오류 발생:', error);
            // ⚠️ 주의: 여기서 수동으로 onDisconnect를 재설정하지 않음 (ListenerService에서 .info/connected로 자동 처리됨)
        }


        console.log('🏠 방 참여 완료:', {
            '방 ID': roomId,
            '플레이어 이름': playerObject.name,
            '플레이어 상태': GameState.currentPlayer.status,
            '방 상태': currentGameState,
            '기존 플레이어 수': existingPlayers.length,
            '새로운 총 인원': actualPlayerCount + 1
        });

        // UI 전환
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        console.log('✅ 게임 화면 표시됨. 채팅 초기화 시도...');
        
        document.getElementById('game-result').classList.add('hidden');
        document.getElementById('current-player').textContent = GameState.currentPlayer.name;
        document.getElementById('site-name').textContent = window.location.hostname;
        document.getElementById('room-id').textContent = roomId.slice(-12);

        // ✅ 최적화된 리스너 설정 - 직접 import 사용
        try {
            ListenerService.setupOptimizedListeners();
        } catch (error) {
            console.error('setupOptimizedListeners 호출 실패:', error);
        }
        
        console.log('✅ 방 참여 완료:', roomId);
        console.log('📊 플레이어 상태:', playerObject.status);
        console.log('👑 방장 여부는 리스너에서 동기화됩니다.');

        // 채팅 서비스 초기화
        if (ChatService && typeof ChatService.init === 'function') {
            ChatService.init(roomId, GameState.currentPlayer.name);
        }

        // 사이드바 데이터 로드
        this.loadSidebarData();
    } catch (error) {
        throw new Error('방 참여에 실패했습니다: ' + error.message);
    }
},

    // 사이드바 데이터 로드
    loadSidebarData() {
        requestAnimationFrame(() => {
            if (document.getElementById('top-rankings-list')) {
                fetchTopRankings();
            }
        });
    }
};

console.log('✅ RoomService 모듈 로드 완료 (완전 ES6 모듈 버전)');
