import { GameState } from './gameState.js';
import { GameHelpers } from '../utils/helpers.js';
import { UIController } from './UIController.js';
import { SyncService } from './SyncService.js';

// 통계 계산 서비스
export const StatsCalculator = {
    // 로컬 통계 업데이트
    updateLocalStats(inputText) {
        const currentTime = Date.now();
        GameState.localStats.totalKeystrokes = GameHelpers.countKoreanKeystrokes(inputText);
        GameState.localStats.correctKeystrokes = 0;
        GameState.localStats.errorCount = 0;
        GameState.localStats.currentPosition = inputText.length;

        if (!GameState.gameText || typeof GameState.gameText !== 'string') {
            console.error('게임 텍스트가 유효하지 않습니다. 통계 업데이트를 건너뜁니다.');
            return;
        }

        for (let i = 0; i < inputText.length; i++) {
            if (i < GameState.gameText.length && inputText[i] === GameState.gameText[i]) {
                GameState.localStats.correctKeystrokes++;
            } else {
                GameState.localStats.errorCount++;
            }
        }

        GameHelpers.updateCounters.local++;
        UIController.updateLocalUI();
        SyncService.checkHybridSync(currentTime);
    },

    // 정확한 계산 requestServerCalculation
    async requestServerCalculation() {
        const timeElapsed = (Date.now() - GameState.localStats.startTime) / 1000;

        const accuracy = GameState.localStats.currentPosition > 0
            ? (GameState.localStats.correctKeystrokes / GameState.localStats.currentPosition) * 100
            : 100;

        const isCompleted = GameState.localStats.correctKeystrokes >= GameState.gameText.length ||
                           GameState.localStats.currentPosition >= GameState.gameText.length;

        const targetKeystrokes = GameHelpers.countKoreanKeystrokes(GameState.gameText);

        // ✨ 게임이 완료되었으면 진행률을 100%로 고정합니다.
        const progress = isCompleted ? 100 : Math.min((GameState.localStats.totalKeystrokes / targetKeystrokes) * 100, 100);

        const accurateStats = {
            progress: progress,
            wpm: GameHelpers.calculateKPM(GameState.localStats.totalKeystrokes, timeElapsed),
            accuracy: Math.round(accuracy * 10) / 10,
            finished: isCompleted,
            lastServerUpdate: firebase.database.ServerValue.TIMESTAMP
        };

        console.log('📊 서버 계산 결과:', accurateStats);

        const updatePromises = Object.keys(accurateStats).map(key =>
            GameHelpers.optimizedFirebaseRequest(
                `roomPlayers/${GameState.currentRoom}/${GameState.currentPlayer.id}/${key}`,
                'set',
                accurateStats[key]
            ));

        // ✨ 완료 시 실시간 진행률(roomLive)도 100%로 업데이트합니다.
        if (isCompleted) {
            const quickData = { p: 100, t: Date.now(), n: GameState.currentPlayer.name };
            updatePromises.push(
                GameHelpers.optimizedFirebaseRequest(`roomLive/${GameState.currentRoom}/${GameState.currentPlayer.id}`, 'set', quickData)
            );
        }

        await Promise.all(updatePromises);
    }
};
