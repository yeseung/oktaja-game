// Firebase 설정 및 초기화

// ✅ oktaja_game.php에서 전달된 전역 상수 FIREBASE_CONFIG를 사용합니다.
// 이 상수는 관리자 페이지에서 설정한 값으로 채워집니다.
const firebaseConfig = typeof FIREBASE_CONFIG !== 'undefined' ? FIREBASE_CONFIG : {};

// Firebase 초기화
if (firebaseConfig.apiKey) {
    firebase.initializeApp(firebaseConfig);
} else {
    console.error("Firebase 설정이 없습니다. 관리자 페이지에서 Firebase 설정을 입력해주세요.");
    alert("타자게임 플러그인 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.");
}

// ES6 모듈로 내보내기
const database = firebase.database();
const auth = firebase.auth();

export { database, auth };

console.log('Firebase 초기화 완료');
