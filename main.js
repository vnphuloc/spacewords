import { WordManager } from './wordManager.js';
import { GameEngine } from './gameEngine.js';

document.addEventListener('DOMContentLoaded', async () => {
    const wordManager = new WordManager();
    const gameEngine = new GameEngine('game-canvas', wordManager);
    const homeScreen = document.getElementById('home-screen');
    const toolPanel = document.getElementById('tool-panel');
    const toolPanelContent = document.getElementById('tool-panel-content');
    const resultModal = document.getElementById('result-modal');
    const resultModalEyebrow = document.getElementById('result-modal-eyebrow');
    const resultModalTitle = document.getElementById('result-modal-title');
    const resultModalMessage = document.getElementById('result-modal-message');
    const resultModalScore = document.getElementById('result-modal-score');
    const gameUi = document.querySelectorAll('.game-ui');
    const scoreEl = document.getElementById('score');
    const progressEl = document.getElementById('mission-status');
    const difficultyStorageKey = 'spacewords-difficulty';
    const fallSpeedStorageKey = 'spacewords-fall-speed';
    const fallSpeedRange = { min: 0.1, max: 2, step: 0.1 };
    const difficultyOptions = {
        easy: {
            label: 'Dễ',
            description: 'Từ mới chỉ xuất hiện sau khi hoàn thành từ trước. Từ dài sẽ lùi nhẹ mỗi lần nhập đúng. Có 50% cơ hội hồi 1 tim.',
            spawnProgress: null,
            speedMin: 0.85,
            speedMax: 0.85,
            lifeRecoveryChance: 0.5,
            correctCharacterRetreat: 10
        },
        medium: {
            label: 'Trung bình',
            description: 'Từ mới xuất hiện khi từ đang rơi đi được 60% màn hình. Có 30% cơ hội hồi 1 tim.',
            spawnProgress: 0.6,
            speedMin: 0.75,
            speedMax: 0.95,
            lifeRecoveryChance: 0.3,
            correctCharacterRetreat: 0
        },
        hard: {
            label: 'Khó',
            description: 'Từ mới xuất hiện khi từ đang rơi ở khoảng 40–50% màn hình. Có 10% cơ hội hồi 1 tim.',
            spawnProgress: 0.45,
            speedMin: 0.65,
            speedMax: 1.05,
            lifeRecoveryChance: 0.1,
            correctCharacterRetreat: 0
        }
    };

    function loadDifficulty() {
        const savedDifficulty = localStorage.getItem(difficultyStorageKey);
        return Object.hasOwn(difficultyOptions, savedDifficulty) ? savedDifficulty : 'easy';
    }

    function loadFallSpeed() {
        const savedSpeed = Number(localStorage.getItem(fallSpeedStorageKey));
        return Number.isFinite(savedSpeed) &&
            savedSpeed >= fallSpeedRange.min &&
            savedSpeed <= fallSpeedRange.max
            ? savedSpeed
            : 1;
    }

    function formatFallSpeed(speed) {
        return `${speed.toFixed(1)}×`;
    }

    let score = 0;
    let lives = 3;
    let spawnedCount = 0;
    const maxWords = 20;
    const maxLives = 5;
    let currentTarget = null;
    let gameEnded = false;
    let isStartingGame = false;
    let victoryTimer = null;
    let difficulty = loadDifficulty();
    let fallSpeed = loadFallSpeed();
    gameEngine.setFallSpeedMultiplier(fallSpeed);

    function updateHUD() {
        scoreEl.textContent = String(score).padStart(6, '0');
        progressEl.textContent = `MISSION ${spawnedCount}/${maxWords}`;
        const livesEl = document.getElementById('lives');
        livesEl.textContent = `${'♥ '.repeat(lives)}${'♡ '.repeat(maxLives - lives)}`.trim();
        livesEl.setAttribute('aria-label', `${lives} tim còn lại`);
    }

    function showHome() {
        if (victoryTimer) {
            clearTimeout(victoryTimer);
            victoryTimer = null;
        }
        gameEngine.stop();
        gameEngine.activeLaserTarget = null;
        gameEngine.clearCompletedWords();
        wordManager.activeWords = [];
        currentTarget = null;
        gameEngine.clear();
        homeScreen.hidden = false;
        gameUi.forEach(element => { element.hidden = true; });
        toolPanel.hidden = true;
    }

    function hideResultModal() {
        resultModal.hidden = true;
    }

    function showResultModal(isVictory, failedWord, reason) {
        resultModalEyebrow.textContent = isVictory ? 'Mission complete' : 'Mission failed';
        resultModalTitle.textContent = isVictory ? 'Chúc mừng!' : 'Game over';
        resultModalMessage.textContent = isVictory
            ? 'Bạn đã hoàn thành đủ 20 từ vựng trong nhiệm vụ này.'
            : reason === 'lives'
                ? 'Bạn đã hết tim. Hãy thử lại để cải thiện điểm số.'
                : `Từ "${failedWord.en}" (${failedWord.vn}) đã chạm vạch đỏ.`;
        resultModalScore.textContent = String(score).padStart(6, '0');
        resultModal.hidden = false;
        resultModal.querySelector('[data-action="restart-game"]').focus();
    }

    function cancelGame() {
        hideResultModal();
        showHome();
    }

    async function startGame() {
        if (isStartingGame) return;

        isStartingGame = true;
        const startButtons = document.querySelectorAll(
            '[data-action="start"], [data-action="restart-game"]'
        );
        startButtons.forEach(button => {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
        });

        try {
            await wordManager.loadFromFirebase();

            if (wordManager.dictionary.length === 0) {
                window.alert('Hãy thêm ít nhất một từ vựng trước khi bắt đầu.');
                return;
            }

            hideResultModal();
            homeScreen.hidden = true;
            toolPanel.hidden = true;
            gameUi.forEach(element => { element.hidden = false; });
            score = 0;
            lives = 3;
            spawnedCount = 0;
            gameEnded = false;
            currentTarget = null;
            gameEngine.clearCompletedWords();
            wordManager.activeWords = [];
            updateHUD();
            gameEngine.start();
            spawnWord();
        } catch (error) {
            console.error('Lỗi khi tự động tải dữ liệu trước khi bắt đầu game.', error);
            window.alert(`Không thể tải dữ liệu mới nhất: ${error.message}`);
        } finally {
            isStartingGame = false;
            startButtons.forEach(button => {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            });
        }
    }

    function spawnWord() {
        if (spawnedCount >= maxWords) return;
        wordManager.spawnWord(gameEngine.canvas.width, difficultyOptions[difficulty]);
        spawnedCount++;
        const spawnedWord = wordManager.activeWords[wordManager.activeWords.length - 1];
        spawnedWord.willRecoverLife =
            lives < maxLives &&
            spawnedCount < maxWords &&
            Math.random() < difficultyOptions[difficulty].lifeRecoveryChance;
        updateHUD();
    }

    function recoverLifeForWord(word) {
        if (word.willRecoverLife && lives < maxLives) {
            lives++;
            updateHUD();
        }
    }

    gameEngine.onWordProgress = word => {
        if (
            difficultyOptions[difficulty].spawnProgress !== null &&
            word.spawnProgress !== null
        ) {
            spawnWord();
        }
    };

    function endGame(isVictory = false, failedWord = null, reason = 'danger-line') {
        if (gameEnded) return;
        gameEnded = true;
        gameEngine.stop();
        if (failedWord && !failedWord.penalized) {
            wordManager.updateSrsLevel(failedWord.en, false);
            failedWord.penalized = true;
        }
        wordManager.saveWords().catch(error => {
            console.error('Lỗi khi tự động upload dữ liệu sau màn chơi.', error);
        });
        showHome();
        showResultModal(isVictory, failedWord, reason);
    }

    gameEngine.onGameOver = failedWord => endGame(false, failedWord);

    function escapeHtml(value) {
        return value.replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[character]));
    }

    function formatLevel(level) {
        return Number.isInteger(level) ? String(level) : level.toFixed(1);
    }

    function openPanel(type, editingWordEn = null) {
        const browseList = wordManager.dictionary.map(word => {
            const escapedEn = escapeHtml(word.en);
            const escapedVn = escapeHtml(word.vn);
            if (word.en === editingWordEn) {
                return `
                    <li data-word="${escapedEn}">
                        <form class="word-form word-edit-form" id="edit-word-form">
                            <label>English
                                <input name="en" required maxlength="40" autocomplete="off" value="${escapedEn}">
                            </label>
                            <label>Vietnamese
                                <input name="vn" required maxlength="80" autocomplete="off" value="${escapedVn}">
                            </label>
                            <input type="hidden" name="originalEn" value="${escapedEn}">
                            <span class="word-list__actions">
                                <button class="panel-submit" type="submit">Save</button>
                                <button class="word-list__cancel" type="button" data-cancel-edit>Cancel</button>
                            </span>
                            <p class="panel-message" id="edit-panel-message" aria-live="polite"></p>
                        </form>
                    </li>`;
            }
            return `
                <li data-word="${escapedEn}">
                    <span><strong>${escapedEn}</strong><span class="word-list__meaning">${escapedVn}</span></span>
                    <span class="word-list__actions">
                        <button type="button" data-edit-word="${escapedEn}">Edit</button>
                        <button type="button" data-remove-word="${escapedEn}">Remove</button>
                    </span>
                </li>`;
        }).join('');
        const trashList = wordManager.trash.length
                ? wordManager.trash.map(word => `
                    <li data-word="${escapeHtml(word.en)}">
                        <span>
                            <strong>${escapeHtml(word.en)}</strong>
                            <span class="word-list__meaning">${escapeHtml(word.vn)} · Level ${formatLevel(word.srsLevel)}</span>
                        </span>
                        <span class="word-list__actions">
                            <button type="button" data-restore-word="${escapeHtml(word.en)}">Restore</button>
                            <button type="button" data-permanently-remove-word="${escapeHtml(word.en)}">Delete permanently</button>
                        </span>
                    </li>`).join('')
                : '<li class="word-list__empty">Thùng rác đang trống.</li>';

        const templates = {
            add: `
                <h3>Add <span>vocabulary</span></h3>
                <form class="word-form" id="word-form">
                    <label>English
                        <input id="english-word" name="en" required maxlength="40" autocomplete="off" aria-controls="word-suggestions" aria-expanded="false" placeholder="e.g. telescope">
                        <div class="word-suggestions" id="word-suggestions" role="listbox" aria-label="Từ vựng tương ứng" hidden></div>
                    </label>
                    <label>Vietnamese
                        <input id="vietnamese-meaning" name="vn" required maxlength="80" autocomplete="off" placeholder="e.g. kính thiên văn">
                    </label>
                    <button class="panel-submit" type="submit">Add word</button>
                    <p class="panel-message" id="panel-message" aria-live="polite"></p>
                </form>`,
            browse: `
                <h3>Browse <span>vocabulary</span></h3>
                <div class="word-data-actions">
                    <button class="panel-submit" type="button" data-load-firebase>Load dữ liệu</button>
                    <button class="word-list__cancel" type="button" data-upload-firebase>Upload dữ liệu</button>
                </div>
                <p class="panel-message" id="browse-panel-message" aria-live="polite"></p>
                <ul class="word-list">${browseList || '<li class="word-list__empty">Kho từ vựng đang trống.</li>'}</ul>
                <h4 class="word-list__heading">Trash <span>(${wordManager.trash.length})</span></h4>
                <ul class="word-list word-list--trash">${trashList}</ul>`,
            stats: (() => {
                const total = wordManager.dictionary.length;
                const mastered = wordManager.dictionary.filter(word => word.srsLevel >= 3).length;
                const learning = wordManager.dictionary.filter(word => word.srsLevel > 0 && word.srsLevel < 3).length;
                const average = total
                    ? (wordManager.dictionary.reduce((sum, word) => sum + word.srsLevel, 0) / total).toFixed(1)
                    : '0.0';
                return `
                    <h3>Memory <span>stats</span></h3>
                    <div class="stats-grid">
                        <div><strong>${total}</strong><span>Total words</span></div>
                        <div><strong>${mastered}</strong><span>Mastered</span></div>
                        <div><strong>${average}</strong><span>Average level</span></div>
                    </div>
                    <p class="panel-message">${learning} từ đang trong quá trình học.</p>
                    <ul class="word-list stats-word-list" aria-label="Mức độ từng từ">
                        ${wordManager.dictionary.map(word => `
                            <li>
                                <span>
                                    <strong>${escapeHtml(word.en)}</strong>
                                    <span class="word-list__meaning">${escapeHtml(word.vn)}</span>
                                </span>
                                <span class="stats-word-list__level">Level ${formatLevel(word.srsLevel)}</span>
                            </li>`).join('')}
                    </ul>`;
            })(),
            settings: `
                <h3>Game <span>settings</span></h3>
                <div class="settings-control">
                    <div class="settings-control__header">
                        <span class="settings-control__label">Độ khó nhiệm vụ</span>
                        <output id="difficulty-value">${difficultyOptions[difficulty].label}</output>
                    </div>
                    <div class="difficulty-options" role="radiogroup" aria-label="Độ khó nhiệm vụ">
                        ${Object.entries(difficultyOptions).map(([value, option]) => `
                            <label class="difficulty-option${difficulty === value ? ' difficulty-option--selected' : ''}">
                                <input type="radio" name="difficulty" value="${value}"${difficulty === value ? ' checked' : ''}>
                                <span>
                                    <strong>${option.label}</strong>
                                    <small>${option.description}</small>
                                </span>
                            </label>`).join('')}
                    </div>
                </div>
                <div class="settings-control">
                    <div class="settings-control__header">
                        <label class="settings-control__label" for="fall-speed">Tốc độ rơi của từ</label>
                        <output id="fall-speed-value" for="fall-speed">${formatFallSpeed(fallSpeed)}</output>
                    </div>
                    <input
                        id="fall-speed"
                        type="range"
                        min="${fallSpeedRange.min}"
                        max="${fallSpeedRange.max}"
                        step="${fallSpeedRange.step}"
                        value="${fallSpeed}"
                    >
                    <div class="settings-control__scale" aria-hidden="true">
                        <span>Chậm</span>
                        <span>Nhanh</span>
                    </div>
                    <p class="panel-message">Thiết lập được lưu tự động và áp dụng từ nhiệm vụ tiếp theo.</p>
                </div>`
        };

        toolPanelContent.innerHTML = templates[type];
        toolPanel.hidden = false;

        if (type === 'add') {
            const form = document.getElementById('word-form');
            const englishInput = document.getElementById('english-word');
            const vietnameseInput = document.getElementById('vietnamese-meaning');
            const suggestions = document.getElementById('word-suggestions');

            function renderWordSuggestions(value) {
                const query = value.trim().toLowerCase();
                if (!query) {
                    suggestions.hidden = true;
                    suggestions.innerHTML = '';
                    englishInput.setAttribute('aria-expanded', 'false');
                    return;
                }

                const matches = wordManager.dictionary
                    .filter(word => word.en.startsWith(query))
                    .slice(0, 8);

                suggestions.innerHTML = matches.map(word => `
                    <button type="button" class="word-suggestion" role="option" data-suggest-word="${escapeHtml(word.en)}" data-suggest-meaning="${escapeHtml(word.vn)}">
                        <strong>${escapeHtml(word.en)}</strong>
                        <span>${escapeHtml(word.vn)}</span>
                    </button>`).join('');
                suggestions.hidden = matches.length === 0;
                englishInput.setAttribute('aria-expanded', String(matches.length > 0));
            }

            englishInput.addEventListener('input', event => {
                renderWordSuggestions(event.currentTarget.value);
            });

            suggestions.addEventListener('click', event => {
                const suggestion = event.target.closest('[data-suggest-word]');
                if (!suggestion) return;
                englishInput.value = suggestion.dataset.suggestWord;
                vietnameseInput.value = suggestion.dataset.suggestMeaning;
                renderWordSuggestions(englishInput.value);
                vietnameseInput.focus();
            });

            form.addEventListener('submit', event => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const added = wordManager.addWord(formData.get('en'), formData.get('vn'));
                const message = document.getElementById('panel-message');
                message.textContent = added
                    ? 'Đã thêm từ mới vào kho từ vựng.'
                    : 'Từ không hợp lệ hoặc đã tồn tại.';
                if (added) {
                    event.currentTarget.reset();
                    renderWordSuggestions('');
                }
            });

            englishInput.focus();
        }

        if (type === 'browse' && editingWordEn !== null) {
            const form = document.getElementById('edit-word-form');
            const englishInput = form.querySelector('[name="en"]');
            const vietnameseInput = form.querySelector('[name="vn"]');
            form.addEventListener('submit', event => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const updated = wordManager.updateWord(
                    formData.get('originalEn'),
                    formData.get('en'),
                    formData.get('vn')
                );
                const message = document.getElementById('edit-panel-message');
                message.textContent = updated
                    ? 'Đã cập nhật từ vựng.'
                    : 'Từ không hợp lệ hoặc bị trùng với một từ khác.';
                if (updated) openPanel('browse');
            });
            englishInput.focus();
            englishInput.select();
        }

        if (type === 'settings') {
            const difficultyOutput = document.getElementById('difficulty-value');
            document.querySelectorAll('input[name="difficulty"]').forEach(input => {
                input.addEventListener('change', event => {
                    difficulty = event.currentTarget.value;
                    difficultyOutput.value = difficultyOptions[difficulty].label;
                    difficultyOutput.textContent = difficultyOptions[difficulty].label;
                    document.querySelectorAll('.difficulty-option').forEach(option => {
                        option.classList.toggle(
                            'difficulty-option--selected',
                            option.querySelector('input').value === difficulty
                        );
                    });
                    localStorage.setItem(difficultyStorageKey, difficulty);
                });
            });

            const speedInput = document.getElementById('fall-speed');
            const speedOutput = document.getElementById('fall-speed-value');
            speedInput.addEventListener('input', event => {
                fallSpeed = Number(event.currentTarget.value);
                gameEngine.setFallSpeedMultiplier(fallSpeed);
                speedOutput.value = formatFallSpeed(fallSpeed);
                speedOutput.textContent = formatFallSpeed(fallSpeed);
                localStorage.setItem(fallSpeedStorageKey, String(fallSpeed));
            });
        }
    }

    document.addEventListener('click', event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'start') void startGame();
        if (action === 'restart-game') void startGame();
        if (action === 'close-result') {
            hideResultModal();
            showHome();
        }
        if (action === 'add' || action === 'browse' || action === 'stats' || action === 'settings') openPanel(action);
        if (action === 'close-panel') toolPanel.hidden = true;

        const cancelEditButton = event.target.closest('[data-cancel-edit]');
        if (cancelEditButton) {
            openPanel('browse');
            return;
        }

        const loadFirebaseButton = event.target.closest('[data-load-firebase]');
        if (loadFirebaseButton) {
            const message = document.getElementById('browse-panel-message');
            loadFirebaseButton.disabled = true;
            message.textContent = 'Đang tải dữ liệu từ Firebase...';
            wordManager.loadFromFirebase()
                .then(count => {
                    message.textContent = `Đã tải ${count} từ vựng từ Firebase.`;
                    openPanel('browse');
                })
                .catch(error => {
                    console.error('Lỗi khi tải dữ liệu từ Firebase từ Browse.', error);
                    message.textContent = `Không thể tải dữ liệu: ${error.message}`;
                    loadFirebaseButton.disabled = false;
                });
            return;
        }

        const uploadFirebaseButton = event.target.closest('[data-upload-firebase]');
        if (uploadFirebaseButton) {
            const message = document.getElementById('browse-panel-message');
            uploadFirebaseButton.disabled = true;
            message.textContent = 'Đang upload dữ liệu lên Firebase...';
            wordManager.saveWords()
                .then(() => {
                    message.textContent = `Đã upload ${wordManager.dictionary.length} từ vựng lên Firebase.`;
                    uploadFirebaseButton.disabled = false;
                })
                .catch(error => {
                    console.error('Lỗi khi upload dữ liệu lên Firebase từ Browse.', error);
                    message.textContent = `Không thể upload dữ liệu: ${error.message}`;
                    uploadFirebaseButton.disabled = false;
                });
            return;
        }

        const restoreButton = event.target.closest('[data-restore-word]');
        if (restoreButton) {
            wordManager.restoreWord(restoreButton.dataset.restoreWord);
            openPanel('browse');
            return;
        }

        const permanentlyRemoveButton = event.target.closest('[data-permanently-remove-word]');
        if (permanentlyRemoveButton) {
            wordManager.permanentlyRemoveWord(permanentlyRemoveButton.dataset.permanentlyRemoveWord);
            openPanel('browse');
            return;
        }

        const removeButton = event.target.closest('[data-remove-word]');
        if (removeButton) {
            wordManager.removeWordFromDictionary(removeButton.dataset.removeWord);
            openPanel('browse');
        }

        const editButton = event.target.closest('[data-edit-word]');
        if (editButton) {
            const originalEn = editButton.dataset.editWord;
            if (wordManager.dictionary.some(item => item.en === originalEn)) {
                openPanel('browse', originalEn);
            }
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' || event.key === 'Esc') {
            if (!resultModal.hidden) {
                event.preventDefault();
                hideResultModal();
                showHome();
                return;
            }

            if (!toolPanel.hidden) {
                event.preventDefault();
                toolPanel.hidden = true;
                return;
            }

            if (gameEngine.isRunning) {
                event.preventDefault();
                cancelGame();
                return;
            }
        }

        if (
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement ||
            event.target instanceof HTMLSelectElement ||
            event.target.isContentEditable
        ) {
            return;
        }

        if (!gameEngine.isRunning || event.key.length !== 1 || !/^[a-z]$/i.test(event.key)) return;

        const typedChar = event.key.toLowerCase();
        if (!currentTarget) {
            const potentialTargets = wordManager.activeWords.filter(
                word => word.en[0].toLowerCase() === typedChar
            );
            currentTarget = potentialTargets.length > 0
                ? potentialTargets.reduce((lowest, word) => word.y > lowest.y ? word : lowest)
                : wordManager.activeWords.reduce(
                    (lowest, word) => !lowest || word.y > lowest.y ? word : lowest,
                    null
                );
            if (!currentTarget) return;
            currentTarget.isLocked = true;
            gameEngine.activeLaserTarget = currentTarget;
        }

        const expectedChar = currentTarget.en[currentTarget.typedCount].toLowerCase();
        if (typedChar === expectedChar) {
            currentTarget.typedCount++;
            if (
                difficultyOptions[difficulty].correctCharacterRetreat > 0 &&
                currentTarget.en.length > 5
            ) {
                gameEngine.retreatWord(
                    currentTarget,
                    difficultyOptions[difficulty].correctCharacterRetreat
                );
            }
            if (currentTarget.typedCount === currentTarget.en.length) {
                score += 10;
                updateHUD();
                wordManager.updateSrsLevel(
                    currentTarget.en,
                    true,
                    currentTarget.mistakeCount
                );
                gameEngine.addCompletedWord(currentTarget);
                wordManager.removeWord(currentTarget.id);
                recoverLifeForWord(currentTarget);
                currentTarget = null;
                gameEngine.activeLaserTarget = null;
                if (
                    difficultyOptions[difficulty].spawnProgress === null &&
                    spawnedCount < maxWords
                ) {
                    spawnWord();
                }
                if (spawnedCount >= maxWords && wordManager.activeWords.length === 0) {
                    victoryTimer = setTimeout(() => {
                        victoryTimer = null;
                        endGame(true);
                    }, 900);
                }
            }
            return;
        }

        currentTarget.mistakeCount++;
        lives = Math.max(0, lives - 1);
        updateHUD();
        if (lives === 0) {
            endGame(false, currentTarget, 'lives');
            return;
        }
        gameEngine.canvas.style.transform = 'translateX(5px)';
        setTimeout(() => { gameEngine.canvas.style.transform = 'translateX(0)'; }, 50);
    });

    await wordManager.loadWords();
});
