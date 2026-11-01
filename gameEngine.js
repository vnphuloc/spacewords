// gameEngine.js

export class GameEngine {
    constructor(canvasId, wordManager) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.wordManager = wordManager;

        this.isRunning = false;
        this.animationFrameId = null;
        this.fallSpeedMultiplier = 1;

        // Callback Event
        this.onGameOver = null;
        this.onWordProgress = null;

        // Kích thước và Tọa độ
        this.dangerLineY = 0;
        this.rocket = { x: 0, y: 0, width: 40, height: 60 };

        // Laser state (Sẽ được Phase 4 cập nhật khi gõ phím)
        this.activeLaserTarget = null;
        this.completedWords = [];

        // Lắng nghe sự kiện resize trình duyệt
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }

    // Tự động scale Canvas bằng 100% màn hình
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Đặt vạch đỏ cách đáy 80px để chừa không gian cho thanh UI
        this.dangerLineY = this.canvas.height - 80;

        // Tàu vũ trụ nằm giữa đáy, ngay trên vạch đỏ
        this.rocket.x = this.canvas.width / 2;
        this.rocket.y = this.dangerLineY - this.rocket.height / 2;
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.loop();
        }
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    clearCompletedWords() {
        this.completedWords = [];
    }

    addCompletedWord(word) {
        this.completedWords.push({
            en: word.en,
            x: word.x,
            y: word.y,
            color: word.color,
            startedAt: performance.now()
        });
    }

    setFallSpeedMultiplier(multiplier) {
        this.fallSpeedMultiplier = multiplier;
    }

    retreatWord(word, distance) {
        word.retreatDistance = (word.retreatDistance || 0) + distance;
    }

    // Vòng lặp chính của Game
    loop() {
        if (!this.isRunning) return;

        this.update();
        if (!this.isRunning) return;
        this.draw();

        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }

    // Cập nhật Logic (Tọa độ rơi, Va chạm)
    update() {
        for (let i = 0; i < this.wordManager.activeWords.length; i++) {
            const word = this.wordManager.activeWords[i];
            const retreatStep = Math.min(word.retreatDistance || 0, 0.8);
            word.retreatDistance = Math.max(0, (word.retreatDistance || 0) - retreatStep);
            word.y += word.speed * this.fallSpeedMultiplier - retreatStep;

            if (
                !word.spawnTriggered &&
                this.onWordProgress &&
                word.spawnProgress !== null &&
                word.y >= this.dangerLineY * word.spawnProgress
            ) {
                word.spawnTriggered = true;
                this.onWordProgress(word);
            }

            // Kiểm tra va chạm với vạch Laser Danger Line
            // (Cộng thêm 25px là bán kính của bong bóng)
            if (word.y + 25 >= this.dangerLineY) {
                this.stop();
                if (this.onGameOver) this.onGameOver(word);
                return; // Kết thúc update
            }
        }

        const now = performance.now();
        this.completedWords = this.completedWords.filter(word => now - word.startedAt < 900);
    }

    // Render toàn bộ đồ họa lên Canvas
    draw() {
        // Xóa frame cũ
        this.clear();

        this.drawDangerLine();

        // Nếu có mục tiêu, vẽ tia Laser bắn từ Tàu vũ trụ tới Bong bóng
        if (this.activeLaserTarget) {
            this.drawLaser(this.activeLaserTarget);
        }

        this.drawRocket();
        this.drawWords();
        this.drawCompletedWords();
    }

    drawDangerLine() {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.dangerLineY);
        this.ctx.lineTo(this.canvas.width, this.dangerLineY);
        this.ctx.strokeStyle = '#ff3333';
        this.ctx.lineWidth = 3;
        this.ctx.shadowColor = '#ff0000';
        this.ctx.shadowBlur = 15;
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawLaser(targetWord) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(this.rocket.x, this.rocket.y - this.rocket.height / 2);
        this.ctx.lineTo(targetWord.x, targetWord.y);

        // Tia laser nhấp nháy ngẫu nhiên
        this.ctx.strokeStyle = Math.random() > 0.5 ? '#00ffff' : '#ffffff';
        this.ctx.lineWidth = 4;
        this.ctx.shadowColor = '#00ffff';
        this.ctx.shadowBlur = 20;
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawRocket() {
        this.ctx.save();
        this.ctx.translate(this.rocket.x, this.rocket.y);

        // Vẽ thân tàu vũ trụ (Hình mũi tên / tam giác)
        this.ctx.fillStyle = '#00aaff';
        this.ctx.beginPath();
        this.ctx.moveTo(0, -this.rocket.height / 2);
        this.ctx.lineTo(this.rocket.width / 2, this.rocket.height / 2);
        this.ctx.lineTo(-this.rocket.width / 2, this.rocket.height / 2);
        this.ctx.closePath();
        this.ctx.fill();

        // Hiệu ứng lửa đẩy động cơ (nhấp nháy)
        this.ctx.fillStyle = '#ff9900';
        this.ctx.beginPath();
        this.ctx.moveTo(-10, this.rocket.height / 2);
        this.ctx.lineTo(10, this.rocket.height / 2);
        // Chiều dài lửa thay đổi ngẫu nhiên tạo cảm giác đang bay
        this.ctx.lineTo(0, this.rocket.height / 2 + 15 + Math.random() * 10);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.restore();
    }

    drawWords() {
        // Font hệ thống cho Canvas
        this.ctx.textBaseline = 'middle';

        this.wordManager.activeWords.forEach(word => {
            this.ctx.save();

            const maskedString = this.wordManager.getMaskedString(word);
            const pillWidth = this.getPillWidth(word.vn, maskedString, word.willRecoverLife);
            const pillHeight = 50;
            const centerX = Math.min(
                this.canvas.width - pillWidth / 2 - 12,
                Math.max(pillWidth / 2 + 12, word.x)
            );
            const x = centerX - pillWidth / 2;
            const y = word.y - pillHeight / 2;

            // 1. Vẽ viền bong bóng (Viên thuốc - Pill)
            this.ctx.shadowColor = word.color;
            // Nếu từ đang bị khóa (targeted), viền sẽ sáng rực lên
            this.ctx.shadowBlur = word.isLocked ? 25 : 10;
            this.ctx.strokeStyle = word.color;
            this.ctx.lineWidth = 2;
            this.ctx.fillStyle = 'rgba(15, 20, 40, 0.85)'; // Màu nền bán trong suốt

            this.ctx.beginPath();
            this.ctx.roundRect(x, y, pillWidth, pillHeight, 25);
            this.ctx.fill();
            this.ctx.stroke();

            // Tắt bóng đổ để text bên trong được sắc nét
            this.ctx.shadowBlur = 0;

            // 2. Vẽ Nghĩa tiếng Việt (Phía trên)
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '13px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(word.vn, centerX, word.y - 8);

            // 3. Vẽ Chuỗi tiếng Anh đã ẩn (Phía dưới)
            // Ký tự đang gõ đúng sẽ sáng màu Vàng, bình thường màu Xanh ngọc
            this.ctx.fillStyle = word.isLocked ? '#ffff00' : '#00ffff';
            this.ctx.font = 'bold 16px "Courier New", Courier, monospace';
            this.ctx.fillText(maskedString, centerX, word.y + 12);

            if (word.willRecoverLife) {
                this.ctx.fillStyle = '#ff436b';
                this.ctx.font = 'bold 16px Arial';
                this.ctx.textAlign = 'right';
                this.ctx.shadowColor = '#ff436b';
                this.ctx.shadowBlur = 10;
                this.ctx.fillText('♥', x + pillWidth - 31, word.y - 17);
                this.ctx.fillText('+1', x + pillWidth - 10, word.y - 17);
            }

            this.ctx.restore();
        });
    }

    drawCompletedWords() {
        const now = performance.now();

        this.completedWords.forEach(word => {
            const progress = Math.min(1, (now - word.startedAt) / 900);
            const centerX = Math.min(this.canvas.width - 12, Math.max(12, word.x));
            const centerY = word.y - progress * 110;
            const scale = 1 + progress * 0.12;
            const pillWidth = this.getPillWidth('', word.en, false);
            const pillHeight = 50;

            this.ctx.save();
            this.ctx.globalAlpha = 1 - progress;
            this.ctx.translate(centerX, centerY);
            this.ctx.scale(scale, scale);
            this.ctx.shadowColor = word.color;
            this.ctx.shadowBlur = 24;
            this.ctx.fillStyle = 'rgba(15, 20, 40, 0.92)';
            this.ctx.strokeStyle = word.color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.roundRect(-pillWidth / 2, -pillHeight / 2, pillWidth, pillHeight, 25);
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 18px "Courier New", Courier, monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(word.en, 0, 0);
            this.ctx.restore();
        });
    }

    getPillWidth(meaning, maskedString, hasLifeRecovery) {
        const horizontalPadding = hasLifeRecovery ? 82 : 34;
        const minimumWidth = 140;
        const maximumWidth = Math.max(minimumWidth, this.canvas.width - 24);

        this.ctx.font = '13px Arial';
        const meaningWidth = this.ctx.measureText(meaning).width;
        this.ctx.font = 'bold 16px "Courier New", Courier, monospace';
        const wordWidth = this.ctx.measureText(maskedString).width;

        return Math.min(
            maximumWidth,
            Math.max(minimumWidth, Math.ceil(Math.max(meaningWidth, wordWidth) + horizontalPadding))
        );
    }
}
