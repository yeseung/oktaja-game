import { auth, database } from '../config/firebase.js';
import { GameState } from './gameState.js';
import { GameStateManager } from './GameStateManager.js';
import { UIService } from './uiService.js';
import { UIController } from './UIController.js';
import { RoomService } from './roomService.js';
import { GamePlayManager } from './GamePlayManager.js';

// 리스너 관리 서비스 (리팩토링 버전)
export const ListenerService = {
    activeListeners: [],

    // 최적화된 리스너 설정
    setupOptimizedListeners() {
        if (!GameState.currentRoom) {
            console.error('❌ 리스너 설정 실패: 방 ID가 없습니다.');
            return;
        }

        console.log('🎧 최적화된 리스너 설정 시작:', GameState.currentRoom);
        this.detachAllListeners(); // 기존 리스너 정리

        // 각 리스너를 개별 메서드로 설정
        this.setupRoomStateListener();
        this.setupPlayersListener();
        this.setupGameTextListener();
        this.setupLiveProgressListener();

        console.log('✅ 모든 리스너 설정 완료.');
    },

    // 1. 방 상태 리스너 설정
    setupRoomStateListener() {
        const roomListRef = database.ref(`roomList/${GameState.currentRoom}`);
        const callback = this.handleRoomStateChange.bind(this);
        
        roomListRef.on('value', callback);
        this.activeListeners.push({ ref: roomListRef, type: 'value', callback });
    },

    // 방 상태 변경 처리
    handleRoomStateChange(snapshot) {
        const roomData = snapshot.val();
        
        if (!roomData) {
            this.handleRoomDeleted();
            return;
        }

        this.updateRoomOwnership(roomData);
        this.updateGameState(roomData);
        UIService.updateOwnerUI();
    },

    // 방 삭제 처리
    handleRoomDeleted() {
        console.warn('⚠️ 방 데이터가 삭제되었습니다. 게임을 종료합니다.');
        alert('방이 삭제되었습니다. 메인 화면으로 돌아갑니다.');
        window.location.reload();
    },

    // 방장 상태 업데이트
    updateRoomOwnership(roomData) {
        const oldOwner = GameState.isRoomOwner;
        GameState.isRoomOwner = roomData.createdBy === auth.currentUser?.uid;
        GameState.roomOwnerId = roomData.createdBy; // 👑 방장 ID를 GameState에 저장

        if (oldOwner !== GameState.isRoomOwner) {
            console.log(`👑 방장 상태 변경: ${oldOwner} -> ${GameState.isRoomOwner}`);
        }
    },

    // 게임 상태 업데이트
    updateGameState(roomData) {
        if (GameState.gameState !== roomData.status) {
            console.log(`🔄 게임 상태 변경 감지: ${GameState.gameState} -> ${roomData.status}`);
            GameStateManager.handleGameStatusChange(roomData.status);
        }
    },

    // 2. 플레이어 목록 리스너 설정
    setupPlayersListener() {
        const roomPlayersRef = database.ref(`roomPlayers/${GameState.currentRoom}`);
        const callback = this.handlePlayersChange.bind(this);
        
        roomPlayersRef.on('value', callback);
        this.activeListeners.push({ ref: roomPlayersRef, type: 'value', callback });
    },

    // 플레이어 목록 변경 처리
    handlePlayersChange(snapshot) {
        const players = snapshot.val() || {};
        UIService.updatePlayersList(players);

        // ✅ [수정] 현재 플레이어의 상태를 실시간으로 동기화
        if (auth.currentUser && players[auth.currentUser.uid]) {
            const myServerData = players[auth.currentUser.uid];
            // GameState.currentPlayer가 존재하고, 서버의 상태와 다를 경우에만 업데이트
            if (GameState.currentPlayer && GameState.currentPlayer.status !== myServerData.status) {
                console.log(`🔄 내 플레이어 상태 동기화: [로컬] ${GameState.currentPlayer.status} -> [서버] ${myServerData.status}`);
                GameState.currentPlayer.status = myServerData.status;

                // 게임 상태가 'playing'인데, 내 로컬 상태가 'waiting'이었다가 'playing'으로 막 바뀐 경우,
                // 게임 시작 로직을 다시 실행하여 게임에 참여시킨다. (다시하기 직후 발생)
                if (GameState.gameState === 'playing' && GameState.currentPlayer.status === 'playing') {
                    console.log('▶️ 동기화로 인한 게임 참여 처리');
                    GamePlayManager.startGame();
                }
            }
        }

        // 방장인 경우, 플레이어 상태가 변경될 때마다 게임 종료 조건을 확인
        if (GameState.isRoomOwner) {
            console.log('👑 방장 클라이언트: 플레이어 변경 감지, 게임 종료 조건 확인');
            GamePlayManager.checkAllPlayersFinished();
        }

        this.validateRoomOwnership(players);
        this.checkOwnershipSuccession(players);
    },

    // 방장 유효성 검사
    validateRoomOwnership(players) {
        const roomOwnerId = GameState.isRoomOwner ? auth.currentUser.uid : null;
        
        if (roomOwnerId && !players[roomOwnerId]) {
            console.warn('⚠️ 방장 정보가 플레이어 목록에 없습니다. 방장 상태를 재조정합니다.');
            GameState.isRoomOwner = false;
        }
    },

    // 방장 승계 확인
    async checkOwnershipSuccession(players) {
        try {
            const ownerSnapshot = await database.ref(`roomList/${GameState.currentRoom}/createdBy`).once('value');
            const currentOwnerId = ownerSnapshot.val();
            
            if (currentOwnerId && !players[currentOwnerId]) {
                this.handleOwnershipSuccession(players);
            }
        } catch (error) {
            console.error('❌ 방장 승계 확인 실패:', error);
        }
    },

    // 방장 승계 처리
    handleOwnershipSuccession(players) {
        console.log(`👤 방장이 나갔습니다. 새 방장 승계를 시도합니다.`);
        
        const playerArray = Object.values(players).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
        
        if (playerArray.length > 0 && playerArray[0].id === auth.currentUser.uid) {
            console.log('👑 내가 새 방장입니다! 방장 정보 업데이트 중...');
            RoomService.promoteNewRoomOwner(GameState.currentRoom);
        }
    },

    // 3. 게임 텍스트 리스너 설정
    setupGameTextListener() {
        const roomTextRef = database.ref(`roomText/${GameState.currentRoom}`);
        const callback = this.handleGameTextChange.bind(this);
        
        roomTextRef.on('value', callback);
        this.activeListeners.push({ ref: roomTextRef, type: 'value', callback });
    },

    // 게임 텍스트 변경 처리
    handleGameTextChange(snapshot) {
        const gameText = snapshot.val();
        
        if (gameText && GameState.gameText !== gameText) {
            console.log('📝 새 게임 텍스트 수신');
            GameState.gameText = gameText;
            
            if (this.shouldDisplayGameText()) {
                UIController.displayGameText();
            }
        }
    },

    // 게임 텍스트 표시 조건 확인
    shouldDisplayGameText() {
        return GameState.gameState === 'playing' || GameState.gameState === 'waiting';
    },

    // 4. 실시간 진행률 리스너 설정
    setupLiveProgressListener() {
        const roomLiveRef = database.ref(`roomLive/${GameState.currentRoom}`);
        const callback = this.handleLiveProgressChange.bind(this);
        
        roomLiveRef.on('value', callback);
        this.activeListeners.push({ ref: roomLiveRef, type: 'value', callback });
    },

    // 실시간 진행률 변경 처리
    handleLiveProgressChange(snapshot) {
        const liveData = snapshot.val() || {};
        UIService.updateLiveProgress(liveData);
    },

    // ✅ [수정] 연결 상태(.info/connected)를 확인하여 안전하게 onDisconnect 예약
    setupDisconnectHandlers(userId) {
        if (!GameState.currentRoom || !userId) {
            console.error('❌ setupDisconnectHandlers: 방 ID 또는 유저 ID 없음.');
            return;
        }

        console.log('🔗 onDisconnect 설정 시작 (연결 상태 확인 후):', userId.slice(-6));

        // Firebase 연결 상태 모니터링
        const connectedRef = database.ref('.info/connected');
        const listener = connectedRef.on('value', (snapshot) => {
            // 연결된 상태일 때만 onDisconnect 예약 실행
            if (snapshot.val() === true) {
                console.log('✅ Firebase 서버 연결됨 - onDisconnect 예약 실행');
                this.registerDisconnectHandlers(userId);
            } else {
                console.warn('⚠️ Firebase 서버 연결 끊김 - onDisconnect 예약 보류');
            }
        });
        
        // 리스너 목록에 추가하여 나중에 해제 가능하게 함
        this.activeListeners.push({ ref: connectedRef, type: 'value', callback: listener });
    },

    // 실제 onDisconnect 등록 로직 (한 번에 update로 처리하여 누락 방지)
    registerDisconnectHandlers(userId) {
        const roomId = GameState.currentRoom;
        if (!roomId) return;

        // 1. 플레이어 데이터 일괄 삭제 예약 (멀티패스 업데이트)
        const disconnectUpdates = {};
        disconnectUpdates[`roomPlayers/${roomId}/${userId}`] = null;
        disconnectUpdates[`roomLive/${roomId}/${userId}`] = null;
        disconnectUpdates[`userRooms/${userId}`] = null;

        database.ref().onDisconnect().update(disconnectUpdates)
            .then(() => console.log('✅ onDisconnect 일괄 삭제 예약 성공'))
            .catch((err) => console.error('❌ onDisconnect 예약 실패:', err));

        // 2. 방 인원수 감소 예약
        database.ref(`roomList/${roomId}/playerCount`)
            .onDisconnect().set(firebase.database.ServerValue.increment(-1));

        // 3. 방장 재계산 플래그 예약
        database.ref(`roomList/${roomId}/needsRecalculation`)
            .onDisconnect().set(true);
    },

    // 모든 리스너 정리
    detachAllListeners() {
        console.log(`🧹 기존 리스너 ${this.activeListeners.length}개 정리 시작...`);
        this.detachActiveListeners();
        // ⚠️ 주의: 여기서 cancelDisconnectHandlers()를 호출하지 않음!
        // 화면이 바뀌어도 "나가지 않는 이상" onDisconnect 예약은 유지되어야 함.
        console.log('✅ 리스너 정리 완료 (onDisconnect 예약은 유지됨).');
    },

    // 활성 리스너 해제
    detachActiveListeners() {
        this.activeListeners.forEach(({ ref, type, callback }) => {
            // callback이 함수인 경우에만 off 호출 (Firebase SDK 스펙 준수)
            if (typeof callback === 'function') {
                ref.off(type, callback);
            }
        });
        this.activeListeners = [];
    },

    // [수정] 명시적으로 로그아웃하거나 방을 나갈 때만 호출해야 함
    cancelDisconnectHandlers() {
        console.warn('⚠️ cancelDisconnectHandlers 호출됨 - 의도된 호출인지 확인 필요');
        
        if (!GameState.currentRoom) return;
        const roomId = GameState.currentRoom;

        // 루트 업데이트 취소
        database.ref().onDisconnect().cancel();
        
        // 개별 참조 취소
        database.ref(`roomList/${roomId}/playerCount`).onDisconnect().cancel();
        database.ref(`roomList/${roomId}/needsRecalculation`).onDisconnect().cancel();
        
        console.log('🔓 onDisconnect 예약 취소됨 (명시적 호출)');
    }

};

console.log('✅ ListenerService 모듈 로드 완료 (리팩토링 버전)');
