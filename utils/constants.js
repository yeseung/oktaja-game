import { GameHelpers } from './helpers.js';

// 원본 사이트 ID 가져오기
const rawSiteId = typeof OKTAJA_SITE_ID !== 'undefined' 
    ? OKTAJA_SITE_ID 
    : window.location.hostname;

export const GAME_CONSTANTS = {
    MAX_PLAYERS_PER_ROOM: 10,
    QUICK_SYNC_INTERVAL: 2000,
    SERVER_SYNC_INTERVAL: 60000,
    SITE_ID: GameHelpers.sanitizeSiteId(rawSiteId),
    SAMPLE_TEXTS: [
        '안녕하세요. 환영합니다.',
        '타자 연습을 시작합니다.'
    ]
};

console.log('✅ 상수 초기화 완료 (정제된 SITE_ID:', GAME_CONSTANTS.SITE_ID, ')');
