const WORDS_API_URL = 'https://data2-74713-default-rtdb.europe-west1.firebasedatabase.app/.json';

export class WordManager {
    constructor() {
        this.dictionary = [];
        this.trash = [];
        this.activeWords = [];
        this.colors = ['#ff4d4d', '#4dff4d', '#4d4dff', '#ffff4d', '#ff4dff', '#00ffff'];
        this.saveQueue = Promise.resolve();
        this.lastSpawnedWordEn = null;
    }

    async loadWords(jsonPath = './data/words.json') {
        try {
            const response = await fetch(jsonPath);
            if (!response.ok) {
                throw new Error(`Không thể tải dữ liệu mặc định (${response.status}).`);
            }
            const bundledWords = await response.json();
            const remoteData = await this.fetchRemoteData();
            if (remoteData === null) {
                this.dictionary = Array.isArray(bundledWords) ? bundledWords : [];
                this.trash = [];
                await this.saveWords();
            } else if (Array.isArray(remoteData)) {
                this.dictionary = remoteData;
                this.trash = [];
            } else if (
                Array.isArray(remoteData.dictionary)
            ) {
                this.dictionary = remoteData.dictionary;
                this.trash = Array.isArray(remoteData.trash) ? remoteData.trash : [];
            } else {
                throw new Error('Dữ liệu Firebase không đúng định dạng.');
            }

            this.lastSpawnedWordEn = null;
            console.log(`Đã tải thành công ${this.dictionary.length} từ vựng từ Firebase.`);
        } catch (error) {
            console.error('Lỗi khi tải dữ liệu từ vựng từ Firebase.', error);
            this.dictionary = [];
            this.trash = [];
        }
    }

    async fetchRemoteData() {
        const response = await fetch(WORDS_API_URL, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Không thể tải dữ liệu từ Firebase (${response.status}).`);
        }
        return response.json();
    }

    async loadFromFirebase() {
        const remoteData = await this.fetchRemoteData();
        if (remoteData === null) {
            throw new Error('Firebase chưa có dữ liệu từ vựng.');
        }
        let needsMigration = false;
        if (Array.isArray(remoteData)) {
            this.dictionary = remoteData;
            this.trash = [];
            needsMigration = true;
        } else if (Array.isArray(remoteData.dictionary)) {
            this.dictionary = remoteData.dictionary;
            this.trash = Array.isArray(remoteData.trash) ? remoteData.trash : [];
            needsMigration = !Array.isArray(remoteData.trash);
        } else {
            throw new Error('Dữ liệu Firebase không đúng định dạng.');
        }
        this.activeWords = [];
        this.lastSpawnedWordEn = null;
        if (needsMigration) {
            await this.saveWords();
        }
        return this.dictionary.length;
    }

    saveWords() {
        this.saveQueue = this.saveQueue.catch(() => undefined).then(async () => {
            const payload = JSON.stringify({
                dictionary: this.dictionary,
                trash: this.trash
            });
            const response = await fetch(WORDS_API_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            });

            if (!response.ok) {
                throw new Error(`Không thể lưu dữ liệu vào Firebase (${response.status}).`);
            }
        });
        return this.saveQueue;
    }

    addWord(en, vn) {
        const normalizedEn = en.trim().toLowerCase();
        const normalizedVn = vn.trim();
        const existsInDictionary = this.dictionary.some(word => word.en === normalizedEn);
        const existsInTrash = this.trash.some(word => word.en === normalizedEn);
        if (!normalizedEn || !normalizedVn || existsInDictionary || existsInTrash) {
            return false;
        }

        this.dictionary.push({ en: normalizedEn, vn: normalizedVn, srsLevel: 0 });
        this.saveWords().catch(error => {
            console.error('Lỗi khi lưu từ mới vào Firebase.', error);
        });
        return true;
    }

    removeWordFromDictionary(en) {
        const wordIndex = this.dictionary.findIndex(word => word.en === en);
        if (wordIndex === -1) return false;

        const [word] = this.dictionary.splice(wordIndex, 1);
        this.trash.push(word);
        this.activeWords = this.activeWords.filter(activeWord => activeWord.en !== en);
        this.saveWords().catch(error => {
            console.error('Lỗi khi chuyển từ vào thùng rác Firebase.', error);
        });
        return true;
    }

    restoreWord(en) {
        const wordIndex = this.trash.findIndex(word => word.en === en);
        if (wordIndex === -1 || this.dictionary.some(word => word.en === en)) return false;

        const [word] = this.trash.splice(wordIndex, 1);
        this.dictionary.push(word);
        this.saveWords().catch(error => {
            console.error('Lỗi khi khôi phục từ vựng từ Firebase.', error);
        });
        return true;
    }

    permanentlyRemoveWord(en) {
        const initialLength = this.trash.length;
        this.trash = this.trash.filter(word => word.en !== en);
        if (this.trash.length === initialLength) return false;

        this.saveWords().catch(error => {
            console.error('Lỗi khi xóa vĩnh viễn từ vựng khỏi Firebase.', error);
        });
        return true;
    }

    updateWord(originalEn, en, vn) {
        const normalizedEn = en.trim().toLowerCase();
        const normalizedVn = vn.trim();
        const word = this.dictionary.find(item => item.en === originalEn);
        const duplicate = this.dictionary.some(item => item.en === normalizedEn && item !== word) ||
            this.trash.some(item => item.en === normalizedEn);
        if (!word || !normalizedEn || !normalizedVn || duplicate) return false;

        word.en = normalizedEn;
        word.vn = normalizedVn;
        this.saveWords().catch(error => {
            console.error('Lỗi khi cập nhật từ vựng trong Firebase.', error);
        });
        return true;
    }

    getNextWord() {
        if (this.dictionary.length === 0) return null;

        const minSrs = Math.min(...this.dictionary.map(word => word.srsLevel));
        const candidates = this.dictionary.filter(word => word.srsLevel <= minSrs + 1);
        const nonRepeatingCandidates = candidates.filter(
            word => word.en !== this.lastSpawnedWordEn
        );
        const availableCandidates = nonRepeatingCandidates.length > 0
            ? nonRepeatingCandidates
            : candidates;
        const randomIndex = Math.floor(Math.random() * availableCandidates.length);
        const nextWord = availableCandidates[randomIndex];
        this.lastSpawnedWordEn = nextWord.en;
        return nextWord;
    }

    spawnWord(canvasWidth, difficulty = {}) {
        const wordData = this.getNextWord();
        if (!wordData) return;

        const color = this.colors[Math.floor(Math.random() * this.colors.length)];
        const xPos = Math.random() * (canvasWidth - 200) + 100;

        const newWord = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            en: wordData.en,
            vn: wordData.vn,
            srsLevel: wordData.srsLevel,
            x: xPos,
            y: -50,
            speed: difficulty.speedMin === undefined
                ? 0.5 + Math.random() * 1.2
                : difficulty.speedMin + Math.random() * (difficulty.speedMax - difficulty.speedMin),
            typedCount: 0,
            mistakeCount: 0,
            isLocked: false,
            spawnTriggered: false,
            spawnProgress: difficulty.spawnProgress,
            retreatDistance: 0,
            color
        };

        this.activeWords.push(newWord);
    }

    getMaskedString(wordObj) {
        const { en, typedCount } = wordObj;
        let display = '';

        for (let i = 0; i < en.length; i++) {
            if (i < typedCount) {
                display += en[i];
            } else if (i === 0 && typedCount === 0) {
                display += en[0];
            } else {
                display += '_';
            }
            display += ' ';
        }
        return display.trim();
    }

    updateSrsLevel(wordEn, isCorrect, mistakeCount = 0) {
        const word = this.dictionary.find(item => item.en === wordEn);
        if (word) {
            if (isCorrect) {
                word.srsLevel = Math.max(0, word.srsLevel + 1 - mistakeCount * 0.5);
            } else {
                word.srsLevel = Math.max(0, word.srsLevel - 1);
            }
            console.log(`[SRS Update] ${wordEn} -> Level ${word.srsLevel}`);
            this.saveWords().catch(error => {
                console.error('Lỗi khi cập nhật mức ghi nhớ trên Firebase.', error);
            });
        }
    }

    removeWord(id) {
        this.activeWords = this.activeWords.filter(word => word.id !== id);
    }
}
