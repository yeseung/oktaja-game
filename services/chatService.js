import { database, auth } from '../config/firebase.js';

// 채팅 서비스 (완전 수정 버전)
export const ChatService = {
    CHAT_API_BASE_URL: (typeof G5_URL !== 'undefined' ? G5_URL : '') + '/plugin/oktaja/api/chat.php',
    
    // ✅ 객체 리터럴에서 = 대신 : 사용 (문법 오류 수정)
    chatMessagesElement: null,
    chatInputElement: null,
    sendChatBtnElement: null,
    emoticonBtnElement: null,
    emoticonPickerElement: null,
    currentRoomId: null,
    currentPlayerName: null,
    firebaseChatNotificationRef: null, // 알림용 레퍼런스
    
    // 메시지 전송 제한 관련
    lastMessageTime: 0, // 마지막 메시지 전송 시간
    messageCountInShortInterval: 0, // 짧은 시간 내 메시지 카운트
    shortIntervalTime: 5000, // 짧은 시간 간격 (5초)
    maxMessagesInShortInterval: 3, // 짧은 시간 내 최대 메시지 수

    // 기본 이모티콘 목록
    emoticons: [
        '😀', '😂', '😍', '🤔', '👍', '👎',
        '❤️', '🔥', '🎉', '👏', '🙏', '😭',
        '🚀', '💡', '💯', '👋', '👀', '✨'
    ],

    // 이모티콘 피커 토글 상태
    isEmoticonPickerOpen: false,

    // 외부 클릭 감지 핸들러
    outsideClickListener: null,



    // 채팅 서비스 초기화
    init(roomId, playerName) {
        this.currentRoomId = roomId;
        this.currentPlayerName = playerName;
        
        const maxRetries = 100; // 약 1.6초 동안 시도
        let retries = 0;
        
        const setupChat = () => {
            this.chatMessagesElement = document.getElementById('chat-messages');
            this.chatInputElement = document.getElementById('chat-input');
            this.sendChatBtnElement = document.getElementById('send-chat-btn');
            this.emoticonBtnElement = document.getElementById('emoticon-btn');
            this.emoticonPickerElement = document.getElementById('emoticon-picker');
            
            if (!this.chatMessagesElement || !this.chatInputElement || !this.sendChatBtnElement || !this.emoticonBtnElement || !this.emoticonPickerElement) {
                if (retries < maxRetries) {
                    retries++;
                    requestAnimationFrame(setupChat); // 다음 프레임에 다시 시도
                } else {
                    console.error('채팅 UI 요소를 찾을 수 없습니다. (최대 시도 횟수 초과)');
                }
                return;
            }
            
            // 요소가 성공적으로 찾아지면 이벤트 리스너 설정
            this.sendChatBtnElement.addEventListener('click', (event) => {
                event.preventDefault(); // 폼의 기본 제출 동작을 막습니다.
                this.sendMessage();
            });

            this.setupInputEvents();
            this.emoticonBtnElement.addEventListener('click', this.toggleEmoticonPicker.bind(this));
            this.populateEmoticonPicker();
            this.setupClosePickerButton();
            
            this.loadInitialMessages(); // 초기 메시지 로드 (DB에서)
            this.setupFirebaseNotificationListener(); // Firebase 알림 리스너 설정
            
            console.log(`💬 ChatService 초기화 완료 (방: ${this.currentRoomId}, 플레이어: ${this.currentPlayerName})`);
        };
        
        requestAnimationFrame(setupChat); // 첫 시도 시작
    },

    // 이모티콘 선택창 채우기
    populateEmoticonPicker() {
        const grid = this.emoticonPickerElement.querySelector('.emoticon-grid');
        if (!grid) return;
        grid.innerHTML = '';
        this.emoticons.forEach(emoticon => {
            const item = document.createElement('div');
            item.className = 'emoticon-item';
            item.textContent = emoticon;
            item.addEventListener('click', () => this.insertEmoticon(emoticon));
            grid.appendChild(item);
        });
    },

    // 이모티콘 선택창 토글
    toggleEmoticonPicker(event) {
        event.stopPropagation();
        this.isEmoticonPickerOpen = !this.isEmoticonPickerOpen;
        
        const picker = this.emoticonPickerElement;
        const btn = this.emoticonBtnElement;
        
        if (this.isEmoticonPickerOpen) {
            picker.classList.remove('hidden');
            btn.style.background = '#e2e8f0';
            btn.style.color = '#667eea';
            
            // 외부 클릭 감지 리스너 추가
            this.outsideClickListener = this.handleOutsideClick.bind(this);
            document.addEventListener('click', this.outsideClickListener);
        } else {
            this.hideEmoticonPicker();
        }
    },

    // 이모티콘 선택창 숨기기
    hideEmoticonPicker() {
        this.isEmoticonPickerOpen = false;
        this.emoticonPickerElement.classList.add('hidden');
        this.emoticonBtnElement.style.background = '';
        this.emoticonBtnElement.style.color = '';
        // 외부 클릭 감지 리스너 제거
        if (this.outsideClickListener) {
            document.removeEventListener('click', this.outsideClickListener);
            this.outsideClickListener = null;
        }
    },

    // 외부 클릭 처리
    handleOutsideClick(event) {
        if (this.isEmoticonPickerOpen && !this.emoticonPickerElement.contains(event.target) && !this.emoticonBtnElement.contains(event.target)) {
            this.hideEmoticonPicker();
        }
    },

    // 이모티콘 삽입
    insertEmoticon(emoticon) {
        if (!this.chatInputElement) return;

        const input = this.chatInputElement;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;

        input.value = text.substring(0, start) + emoticon + text.substring(end);
        input.selectionStart = input.selectionEnd = start + emoticon.length;
        
        input.focus();
        this.hideEmoticonPicker();
    },

    // ✅ 문자 수 카운터 업데이트 (개선된 버전)
    updateCharCounter() {
        const input = this.chatInputElement;
        const counter = document.getElementById('char-count');
        const charCountElement = document.querySelector('.char-counter');
        
        if (input && counter) {
            const currentLength = input.value.length;
            counter.textContent = currentLength;
            
            // 색상 및 스타일 변경
            charCountElement.classList.remove('warning', 'danger');
            if (currentLength > 180) {
                charCountElement.classList.add('danger');
            } else if (currentLength > 150) {
                charCountElement.classList.add('warning');
            }
            
            // 전송 버튼 활성화/비활성화
            const sendBtn = document.getElementById('send-chat-btn');
            if (sendBtn) {
                sendBtn.disabled = currentLength === 0 || currentLength > 200;
            }
        }
    },

    // ✅ 이모티콘 피커 닫기 버튼 추가
    setupClosePickerButton() {
        const closeBtn = document.querySelector('.close-picker');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideEmoticonPicker();
            });
        }
    },

    // ✅ 향상된 입력 이벤트 설정
    setupInputEvents() {
        if (this.chatInputElement) {
            this.chatInputElement.addEventListener('input', () => {
                this.updateCharCounter();
                this.autoResize();
            });
            
            this.chatInputElement.addEventListener('keypress', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    this.sendMessage();
                }
            });
        }
    },

    // ✅ 자동 크기 조절
    autoResize() {
        const textarea = this.chatInputElement;
        const inputArea = document.querySelector('.chat-input-area');
        
        if (textarea) {
            textarea.style.height = 'auto';
            const newHeight = Math.min(textarea.scrollHeight, 80);
            textarea.style.height = newHeight + 'px';
            
            // 입력 중 스타일 적용
            if (textarea.value.length > 0) {
                inputArea.classList.add('typing');
            } else {
                inputArea.classList.remove('typing');
            }
        }
    },

    // 초기 메시지 로드
    async loadInitialMessages() {
        if (!this.currentRoomId) return;
        
        try {
            const response = await fetch(`${this.CHAT_API_BASE_URL}?action=get_messages&roomId=${this.currentRoomId}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({})); // JSON 파싱 실패 대비
                throw new Error(`채팅 메시지 로드 실패: ${errorData.error || response.statusText}`);
            }
            
            const messages = await response.json();
            this.displayMessages(messages);
        } catch (error) {
            console.error('초기 채팅 메시지 로드 중 오류:', error);
            if (this.chatMessagesElement) {
                this.chatMessagesElement.innerHTML = '<div class="chat-error">채팅을 불러오는 중 오류가 발생했습니다.</div>';
            }
        }
    },

    // 메시지 전송
    async sendMessage() {
        const message = this.chatInputElement.value.trim();
        if (!message || !this.currentRoomId || !this.currentPlayerName) return;
        
        // 도배 방지 체크
        if (!this.canSendMessage()) {
            this.showRateLimitMessage();
            return;
        }
        
        if (!auth.currentUser) {
            alert('채팅을 보내려면 로그인이 필요합니다.');
            console.error('sendMessage: User not authenticated.');
            return;
        }
        
        try {
            // 메시지 전송 (PHP API)
            const response = await fetch(`${this.CHAT_API_BASE_URL}?action=send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8'
                },
                body: JSON.stringify({
                    roomId: this.currentRoomId,
                    userId: auth.currentUser.uid,
                    userName: this.currentPlayerName,
                    message: message
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || '메시지 전송에 실패했습니다.');
            }
            
            // 메시지 전송 성공
            this.chatInputElement.value = '';
            this.updateMessageSendingRecord();
            
            // ✅ Firebase 알림 전송 (안전하게 처리)
            await this.sendFirebaseNotificationSafely(message);
            
            // 즉시 메시지 새로고침
            this.refreshMessages();
            
            console.log('✅ 채팅 메시지 전송 완료');
            
        } catch (error) {
            console.error('메시지 전송 실패:', error);
            alert(error.message || '메시지 전송에 실패했습니다.');
        }
    },

    // ✅ 안전한 Firebase 알림 전송
    async sendFirebaseNotificationSafely(message) {
        try {
            // Firebase 알림이 필요하지 않다면 이 전체 함수를 주석 처리하거나 제거할 수 있습니다
            if (!database || !auth.currentUser) {
                console.warn('⚠️ Firebase 알림 전송 불가: 인증되지 않음');
                return;
            }
            
            const notificationData = {
                roomId: this.currentRoomId,
                message: message.substring(0, 100), // 메시지 길이 제한
                timestamp: Date.now(),
                senderId: auth.currentUser.uid,
                senderName: this.currentPlayerName
            };
            
            await database.ref(`chatNotifications/${this.currentRoomId}`).update(notificationData);
            console.log('✅ Firebase 채팅 알림 전송 성공');
            
        } catch (error) {
            // 알림 전송이 실패해도 채팅 자체는 계속 동작하도록 경고만 출력
            console.warn('⚠️ Firebase 채팅 알림 전송 실패 (무시됨):', error.message);
            // Firebase 권한 문제인 경우 추가 안내
            if (error.message && error.message.includes('PERMISSION_DENIED')) {
                console.warn('💡 해결방법: Firebase 보안 규칙에 chatNotifications 경로를 추가하세요.');
            }
        }
    },

    // 메시지 전송 가능 여부 확인
    canSendMessage() {
        const now = Date.now();
        
        // 첫 메시지이거나 시간 간격이 충분한 경우
        if (this.lastMessageTime === 0 || (now - this.lastMessageTime) > this.shortIntervalTime) {
            this.messageCountInShortInterval = 0;
            return true;
        }
        
        // 짧은 시간 내 메시지 수 체크
        if (this.messageCountInShortInterval >= this.maxMessagesInShortInterval) {
            return false;
        }
        
        return true;
    },

    // 도배 방지 메시지 표시
    showRateLimitMessage() {
        alert('메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해주세요.');
    },

    // 메시지 전송 기록 업데이트
    updateMessageSendingRecord() {
        const now = Date.now();
        
        if (this.lastMessageTime === 0 || (now - this.lastMessageTime) > this.shortIntervalTime) {
            this.messageCountInShortInterval = 1;
        } else {
            this.messageCountInShortInterval++;
        }
        
        this.lastMessageTime = now;
    },

    // 메시지 새로고침
    async refreshMessages() {
        if (!this.currentRoomId) return;
        
        try {
            const response = await fetch(`${this.CHAT_API_BASE_URL}?action=get_messages&roomId=${this.currentRoomId}`);
            if (response.ok) {
                const messages = await response.json();
                this.displayMessages(messages);
            }
        } catch (error) {
            console.error('메시지 새로고침 실패:', error);
        }
    },

    // 메시지 화면에 표시
    displayMessages(messages) {
        if (!this.chatMessagesElement || !Array.isArray(messages)) return;
        
        let html = '';
        messages.forEach(msg => {
            const timestamp = new Date(msg.timestamp || Date.now()).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const safeUserName = this.escapeHtml(msg.userName || '익명');
            const safeMessage = this.escapeHtml(msg.message || '');
            const isMyMessage = auth.currentUser && msg.userId === auth.currentUser.uid;
            const messageClass = isMyMessage ? 'my-message' : 'other-message';
            
            html += `
                <div class="chat-message ${messageClass}">
                    <div class="chat-sender-name">${safeUserName}</div>
                    <div class="chat-bubble">
                        <p class="chat-text">${safeMessage}</p>
                        <span class="chat-timestamp">${timestamp}</span>
                    </div>
                </div>
            `;
        });
        
        if (html === '') {
            html = '<div class="no-data">채팅 메시지가 없습니다.</div>';
        }
        
        this.chatMessagesElement.innerHTML = html;
        this.scrollToBottom();
    },

    // ✅ Firebase 알림 리스너 안전하게 설정
    setupFirebaseNotificationListener() {
        try {
            if (!database || !this.currentRoomId) {
                console.warn('⚠️ Firebase 알림 리스너 설정 불가: 데이터베이스 또는 방 ID 없음');
                return;
            }
            
            this.firebaseChatNotificationRef = database.ref(`chatNotifications/${this.currentRoomId}`);
            this.firebaseChatNotificationRef.on('value', (snapshot) => {
                const notificationData = snapshot.val();
                
                // 다른 사용자의 메시지 알림일 때만 새로고침
                if (notificationData && 
                    notificationData.senderId !== auth.currentUser?.uid &&
                    notificationData.timestamp > Date.now() - 5000) {
                    this.refreshMessages();
                }
            });
            
            console.log('✅ Firebase 채팅 알림 리스너 설정 완료');
            
        } catch (error) {
            console.warn('⚠️ Firebase 채팅 알림 리스너 설정 실패 (무시됨):', error.message);
        }
    },

    // 채팅창 하단으로 스크롤
    scrollToBottom() {
        if (this.chatMessagesElement) {
            this.chatMessagesElement.scrollTop = this.chatMessagesElement.scrollHeight;
        }
    },

    // HTML 특수문자 이스케이프
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // 리스너 정리
    detachListeners() {
        try {
            if (this.firebaseChatNotificationRef) {
                this.firebaseChatNotificationRef.off();
                this.firebaseChatNotificationRef = null;
                console.log('✅ Firebase 채팅 알림 리스너 정리 완료');
            }
        } catch (error) {
            console.warn('⚠️ Firebase 채팅 리스너 정리 실패 (무시됨):', error.message);
        }
    }
};

console.log('✅ ChatService 모듈 로드 완료 (완전 수정 버전)');
