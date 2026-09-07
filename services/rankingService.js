import { GAME_CONSTANTS } from '../utils/constants.js';
import { GameHelpers } from '../utils/helpers.js';

// Function to fetch and display top 10 rankings
export async function fetchTopRankings() {
    const topRankingsList = document.getElementById('top-rankings-list');
    if (!topRankingsList) {
        console.error('Error: #top-rankings-list element not found.');
        return;
    }

    topRankingsList.innerHTML = '<div class="loading">⏳ 로딩 중...</div>';

    try {
        // 파라미터명 수정: action=todaytop, siteid= (언더스코어 제거)
        const apiUrl = `${G5_URL}/plugin/oktaja/api/top_rankings_api.php?action=todaytop&siteid=${GAME_CONSTANTS.SITE_ID}`;
        
        console.log('📡 TOP 10 API 호출:', apiUrl);
        
        const response = await fetch(apiUrl);

        console.log('📡 TOP 10 API 응답 상태:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        console.log('📊 TOP 10 데이터:', data);

        if (data.success && data.rankings && data.rankings.length > 0) {
            let html = '';
            data.rankings.forEach((rank, index) => {
                const ranking = index + 1;
                const medal = ranking <= 3 ? ['🥇', '🥈', '🥉'][ranking - 1] : `${ranking}위`;

                html += `
                    <div class="ranking-item">
                        <span class="rank">${medal}</span>
                        <div class="rank-info">
                            <div class="rank-name">${GameHelpers.escapeHtml(rank.playername)}</div>
                            <div class="rank-stats">${rank.wpm}타 (${rank.accuracy}%)</div>
                        </div>
                    </div>
                `;
            });
            topRankingsList.innerHTML = html;
            console.log('✅ TOP 10 랭킹 표시 완료:', data.rankings.length + '개');
        } else {
            topRankingsList.innerHTML = `
                <div class="no-data">
                    <span class="icon">🏆</span>
                    <span class="text">아직 기록이 없습니다</span>
                </div>
            `;
            console.log('ℹ️ TOP 10 데이터 없음');
        }
    } catch (error) {
        console.error('❌ TOP 10 랭킹 로드 실패:', error);
        topRankingsList.innerHTML = `
            <div class="error-message">
                <span class="icon">⚠️</span>
                <span class="text">랭킹을 불러올 수 없습니다</span>
            </div>
        `;
    }
}
