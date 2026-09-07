// 게임 상태 관리
export const GameState = {
    // 게임 상태 변수들
    currentPlayer: null,
    currentRoom: null,
    gameState: 'waiting',
    typingProgress: 0,
    startTime: null,
    gameText: '',
    isRoomOwner: false,
    // 하이브리드 동기화를 위한 변수들
    lastQuickUpdate: 0,
    lastFullUpdate: 0,
    localStats: {
        totalKeystrokes: 0,
        correctKeystrokes: 0,
        errorCount: 0,
        startTime: null,
        currentPosition: 0
    }
};

console.log('게임 상태 초기화 완료');
