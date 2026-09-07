import { database } from '../config/firebase.js';

// 유틸리티 함수들
export const GameHelpers = {
    updateCounters: { // 사용량 카운터 (디버깅용)
    },

    // HTML 이스케이프 함수 (XSS 방지)
    escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    },
    // Firebase 경로에 안전한 사이트 ID 생성 함수
    sanitizeSiteId(siteId) {
        if (!siteId || typeof siteId !== 'string') {
            return 'default_site';
        }
        
        // 프로토콜 제거 (https://, http://)
        let sanitized = siteId.replace(/^https?:\/\//, '');
        
        // 경로 제거 (첫 번째 / 이후 모든 것 제거)
        sanitized = sanitized.split('/')[0];
        
        // 포트 번호 제거 (:8080 등)
        sanitized = sanitized.split(':')[0];
        
        // Firebase에서 허용하지 않는 특수문자를 안전한 문자로 변환
        sanitized = sanitized
            .replace(/\./g, '_')     // . → _
            .replace(/\//g, '-')     // / → -
            .replace(/:/g, '-')      // : → -
            .replace(/#/g, '')       // # 제거
            .replace(/\$/g, '')      // $ 제거
            .replace(/\[/g, '')      // [ 제거
            .replace(/\]/g, '');     // ] 제거
        
        // 빈 문자열이면 기본값 반환
        return sanitized || 'default_site';
    },
	
    // 한글 음절을 초성, 중성, 종성으로 분해하는 함수
    decomposeHangul(syllable) {
        const CHOSUNG = [
            'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
            'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
        ];
        const JUNGSUNG = [
            'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
            'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'
        ];
        const JONGSUNG = [
            '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
            'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
            'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
        ];

        const BASE_CODE = 0xAC00;
        const CHOSUNG_COUNT = 19;
        const JUNGSUNG_COUNT = 21;
        const JONGSUNG_COUNT = 28;

        let code = syllable.charCodeAt(0) - BASE_CODE;
        if (code < 0 || code > 11171) {
            return [syllable]; // 한글 음절이 아님
        }

        let chosungIndex = Math.floor(code / (JUNGSUNG_COUNT * JONGSUNG_COUNT));
        let jungsungIndex = Math.floor((code % (JUNGSUNG_COUNT * JONGSUNG_COUNT)) / JUNGSUNG_COUNT);
        let jongsungIndex = code % JONGSUNG_COUNT;

        let result = [];
        result.push(CHOSUNG[chosungIndex]);
        result.push(JUNGSUNG[jungsungIndex]);
        if (JONGSUNG[jongsungIndex] !== '') {
            result.push(JONGSUNG[jongsungIndex]);
        }

        return result;
    },

    // 텍스트의 총 타수를 계산하는 함수 (한글 자소 단위)
    countKoreanKeystrokes(text) {
        let count = 0;
        for (let char of text) {
            if (/^[가-힣]$/.test(char)) {
                count += this.decomposeHangul(char).length;
            } else if (char === ' ') {
                count += 1; // 띄어쓰기
            } else {
                count += 1; // 기타 문자 (영문, 숫자, 특수문자)
            }
        }
        return count;
    },

    // WPM 계산 (영문 기준 - 5글자 = 1단어)
    calculateAccurateWPM(totalKeystrokes, timeInSeconds, accuracy) {
        if (timeInSeconds <= 0) return 0;
        const timeInMinutes = timeInSeconds / 60;
        const correctKeystrokes = totalKeystrokes * (accuracy / 100);
        return Math.round(correctKeystrokes / 5 / timeInMinutes);
    },

    // 타수/분 계산 (KPM - Korean Keystrokes Per Minute)
    calculateKPM(totalKeystrokes, timeInSeconds) {
        if (timeInSeconds <= 0) return 0;
        return Math.round((totalKeystrokes / timeInSeconds) * 60);
    },

    // 한글 타수 기준 정확한 WPM 계산
    calculateKoreanWPM(inputText, timeInSeconds, accuracy) {
        if (timeInSeconds <= 0) return 0;
        const totalKoreanKeystrokes = this.countKoreanKeystrokes(inputText);
        const correctKeystrokes = totalKoreanKeystrokes * (accuracy / 100);
        const timeInMinutes = timeInSeconds / 60;
        return Math.round(correctKeystrokes / 5 / timeInMinutes);
    },

    // 한글 타수/분 계산 (정확한 자소 단위)
    calculateKoreanKPM(inputText, timeInSeconds) {
        if (timeInSeconds <= 0) return 0;
        const totalKoreanKeystrokes = this.countKoreanKeystrokes(inputText);
        return Math.round((totalKoreanKeystrokes / timeInSeconds) * 60);
    },

    // 최적화된 Firebase 요청 래퍼
    optimizedFirebaseRequest(path, method = 'once', value = null) {
        const requestStart = Date.now();
        this.updateCounters.networkRequests = (this.updateCounters.networkRequests || 0) + 1;

        return new Promise((resolve, reject) => {
            let ref = path ? database.ref(path) : database.ref();

            if (method === 'once') {
                ref.once('value')
                    .then(snapshot => {
                        const responseTime = Date.now() - requestStart;
                        this.updateCounters.responseTime = this.updateCounters.networkRequests === 1 ? 
                            responseTime : Math.round(((this.updateCounters.responseTime * (this.updateCounters.networkRequests - 1)) + responseTime) / this.updateCounters.networkRequests);
                        resolve(snapshot);
                    })
                    .catch(reject);
            } else if (method === 'set') {
                ref.set(value)
                    .then(() => {
                        const responseTime = Date.now() - requestStart;
                        this.updateCounters.responseTime = this.updateCounters.networkRequests === 1 ? 
                            responseTime : Math.round(((this.updateCounters.responseTime * (this.updateCounters.networkRequests - 1)) + responseTime) / this.updateCounters.networkRequests);
                        resolve();
                    })
                    .catch(reject);
            } else if (method === 'update' && value !== null) {
                ref.update(value)
                    .then(() => {
                        const responseTime = Date.now() - requestStart;
                        this.updateCounters.responseTime = this.updateCounters.networkRequests === 1 ? 
                            responseTime : Math.round(((this.updateCounters.responseTime * (this.updateCounters.networkRequests - 1)) + responseTime) / this.updateCounters.networkRequests);
                        resolve();
                    })
                    .catch(reject);
            } else {
                reject(new Error(`Invalid Firebase method: ${method} or missing value for path: ${path}`));
            }
        });
    },

    // 랜덤 문자열 생성 (숫자 + 영문 대소문자)
    generateRandomString(length) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    },

    // 고유한 손님 이름 생성 (비동기) (Firebase에서 중복 확인)
    async generateUniqueGuestName(roomId, retries = 10) {
        for (let i = 0; i < retries; i++) {
            const guestName = '손님' + this.generateRandomString(4);
            try {
                const snapshot = await this.optimizedFirebaseRequest(`roomPlayers/${roomId}`);
                const players = snapshot.val() || {};
                const nameExists = Object.values(players).some(player => player.name === guestName);
                if (!nameExists) {
                    return guestName; // 고유한 이름 찾음
                }
            } catch (error) {
                console.error('Firebase에서 이름 중복 확인 중 오류 발생:', error);
            }
        }
        throw new Error('고유한 손님 이름을 생성하지 못했습니다. 다시 시도해주세요.');
    },

    // Firebase 연결 상태 확인
    checkFirebaseConnection() {
        const connectedRef = database.ref('.info/connected');
        connectedRef.on('value', (snapshot) => {
            const connected = snapshot.val();
            const indicator = document.getElementById('connection-indicator');
            const text = document.getElementById('connection-text');
            
            if (connected) {
                indicator.textContent = '🟢';
                text.textContent = '연결됨';
            } else {
                indicator.textContent = '🔴';
                text.textContent = '연결 끊김';
            }
        });
    }
};

console.log('헬퍼 함수 초기화 완료 (한글 타수 계산 기능 포함)');
