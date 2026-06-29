const API_BASE = 'https://api.dicionario-aberto.net';
const MAX_GUESSES = 14;
const POINTS_BY_GUESS = [5, 5, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1];

class BetweenleGame {
    constructor() {
        this.secretWord = '';
        this.lowerBound = null;
        this.upperBound = null;
        this.guesses = [];
        this.attempts = 0;
        this.score = 0;
        this.gameOver = false;
        this.loading = false;
        this.commonWords = new Set();
        this.commonWordsList = [];

        this.prepareElements();
        this.loadWordList().then(() => this.init());
    }

    prepareElements() {
        this.el = {
            status: document.getElementById('dailyWordStatus'),
            lowerBound: document.getElementById('lowerBound'),
            upperBound: document.getElementById('upperBound'),
            guessInput: document.getElementById('guessInput'),
            submitBtn: document.getElementById('submitBtn'),
            message: document.getElementById('message'),
            distanceInfo: document.getElementById('distanceInfo'),
            attempts: document.getElementById('attempts'),
            remaining: document.getElementById('remaining'),
            score: document.getElementById('score'),
            guessList: document.getElementById('guessList'),
            alphabetRow: document.getElementById('alphabetRow'),
            alphabetHint: document.getElementById('alphabetHint'),
            currentGuess: document.getElementById('currentGuess'),
            distanceAbove: document.getElementById('distanceAbove'),
            distanceBelow: document.getElementById('distanceBelow'),
            newGameBtn: document.getElementById('newGameBtn'),
        };
    }

    init() {
        this.el.guessInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                this.submitGuess();
            }
        });

        this.el.guessInput.addEventListener('input', () => {
            this.updatePreview(this.normalize(this.el.guessInput.value), null);
        });

        this.el.submitBtn.addEventListener('click', () => {
            this.submitGuess();
        });

        this.el.newGameBtn.addEventListener('click', () => {
            this.resetGame();
        });

        this.resetGame();
    }

    async loadWordList() {
        try {
            const response = await fetch('words_api.txt');
            if (!response.ok) throw new Error('Falha ao carregar lista local de palavras');
            const text = await response.text();
            const words = text
                .split(/\r?\n/)
                .map((word) => this.removeAccents(word.trim().toLowerCase()))
                .filter((word) => word.length > 0);
            this.commonWordsList = Array.from(new Set(words)).sort();
            this.commonWords = new Set(this.commonWordsList);
        } catch (error) {
            console.warn('Erro ao carregar words_api.txt:', error);
            this.commonWordsList = [];
            this.commonWords = new Set();
        }
    }

    async loadDailyWord() {
        this.loading = true;
        this.el.status.textContent = 'A carregar a palavra do dia…';

        try {
            const response = await fetch(`${API_BASE}/wotd`);
            if (!response.ok) throw new Error('Falha ao carregar palavra do dia');

            const data = await response.json();
            const parser = new DOMParser();
            const doc = parser.parseFromString(data.xml, 'application/xml');
            const orth = doc.querySelector('orth');
            const word = orth ? orth.textContent.trim().toLowerCase() : '';

            if (!word) {
                throw new Error('Resposta inválida do API');
            }

            this.secretWord = word;
            this.el.status.textContent = 'Palavra do dia carregada com sucesso';
        } catch (error) {
            console.warn('Erro ao carregar palavra do dia:', error);
            this.secretWord = '';
            this.el.status.textContent = 'Não foi possível carregar a palavra do dia. Tente novamente mais tarde.';
        } finally {
            this.loading = false;
        }
    }

    async resetGame() {
        this.lowerBound = null;
        this.upperBound = null;
        this.guesses = [];
        this.attempts = 0;
        this.score = 0;
        this.gameOver = false;

        this.clearMessage();
        this.updatePreview('', null);
        this.updateDistance('Faça um palpite para começar.');
        this.updateBounds();
        this.renderAlphabet();
        this.updateStats();
        this.renderGuesses();
        this.el.guessInput.disabled = false;
        this.el.submitBtn.disabled = false;

        if (!this.secretWord) {
            await this.loadDailyWord();
        }

        if (!this.secretWord) {
            this.el.status.textContent = 'Impossível jogar sem palavra do dia.';
            this.el.guessInput.disabled = true;
            this.el.submitBtn.disabled = true;
            return;
        }

        this.el.guessInput.value = '';
        this.el.guessInput.focus();
    }

    async submitGuess() {
        if (this.loading || this.gameOver) {
            return;
        }

        const guess = this.normalize(this.el.guessInput.value);
        if (!guess) {
            this.showMessage('Digite uma palavra para enviar.', 'error');
            return;
        }

        if (this.guesses.some(item => item.word === guess)) {
            this.showMessage('Você já tentou essa palavra.', 'duplicate');
            return;
        }

        const exists = await this.checkWordExists(guess);
        if (!exists) {
            this.showMessage(`"${guess}" não está no Dicionário Aberto.`, 'error');
            return;
        }

        if (this.lowerBound && this.compareWords(guess, this.lowerBound) <= 0) {
            this.showMessage(`"${guess}" deve ser maior que "${this.lowerBound}".`, 'out-of-range');
            return;
        }

        if (this.upperBound && this.compareWords(guess, this.upperBound) >= 0) {
            this.showMessage(`"${guess}" deve ser menor que "${this.upperBound}".`, 'out-of-range');
            return;
        }

        this.attempts += 1;
        const distance = this.computeDistance(guess, this.secretWord);
        let result = '';
        let status = 'success';

        const maxLen = Math.max(this.secretWord.length, guess.length);
        const percent = this.computeDistancePercent(distance, maxLen);
        const percentLabel = this.formatDistancePercent(percent);

        if (guess === this.secretWord) {
            this.score = this.getScoreForGuess(this.attempts);
            result = `Acertou! ${this.attempts} tentativas, ${this.score} ponto${this.score === 1 ? '' : 's'}.`;
            this.showMessage(result, 'success');
            this.updatePreview(guess, percent);
            this.endGame(true);
        } else {
            if (this.compareWords(guess, this.secretWord) < 0) {
                this.lowerBound = guess;
                result = `A palavra é maior. ${distance} palavras, ${percentLabel}.`;
            } else {
                this.upperBound = guess;
                result = `A palavra é menor. ${distance} palavras, ${percentLabel}.`;
            }
            this.showMessage(result, status);
            this.updateDistance(`Distância até a palavra do dia: ${distance} (${percentLabel}).`);
            this.updatePreview(guess, percent);
            if (this.attempts >= MAX_GUESSES) {
                this.endGame(false);
            }
        }

        this.guesses.unshift({ word: guess, distance, percent: percentLabel, result, success: guess === this.secretWord });
        this.updateBounds();
        this.renderAlphabet();
        this.updateStats();
        this.renderGuesses();
        this.el.guessInput.value = '';
        this.el.guessInput.focus();
    }

    async checkWordExists(word) {
        const normalized = this.removeAccents(this.normalize(word));
        if (this.commonWords.has(normalized)) {
            return true;
        }

        const singulars = this.getSingularCandidates(normalized);
        for (const candidate of singulars) {
            if (this.commonWords.has(candidate)) {
                return true;
            }
        }

        return await this.checkRemoteWord(word, [normalized, ...singulars]);
    }

    async checkRemoteWord(word, candidates = []) {
        const candidatesToTry = [word.toLowerCase(), this.removeAccents(word.toLowerCase()), ...candidates];
        const seen = new Set();

        for (const candidate of candidatesToTry) {
            if (!candidate || seen.has(candidate)) continue;
            seen.add(candidate);
            try {
                const response = await fetch(`${API_BASE}/word/${encodeURIComponent(candidate)}`);
                if (!response.ok) continue;
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    return true;
                }
            } catch (error) {
                console.warn('Erro ao verificar palavra remota:', error);
            }
        }

        return false;
    }

    getSingularCandidates(word) {
        const candidates = [];
        if (word.endsWith('ões')) candidates.push(word.slice(0, -3) + 'ão');
        if (word.endsWith('ães')) candidates.push(word.slice(0, -3) + 'ão');
        if (word.endsWith('ais')) candidates.push(word.slice(0, -3) + 'al');
        if (word.endsWith('eis')) candidates.push(word.slice(0, -3) + 'el');
        if (word.endsWith('ois')) candidates.push(word.slice(0, -3) + 'ol');
        if (word.endsWith('uis')) candidates.push(word.slice(0, -3) + 'ul');
        if (word.endsWith('ões')) candidates.push(word.slice(0, -2));
        if (word.endsWith('es')) candidates.push(word.slice(0, -2));
        if (word.endsWith('s')) candidates.push(word.slice(0, -1));
        return Array.from(new Set(candidates)).filter(Boolean);
    }

    normalize(text) {
        return text.trim().toLowerCase();
    }

    compareWords(a, b) {
        return a.localeCompare(b, 'pt', { sensitivity: 'base' });
    }

    computeDistance(a, b) {
        const left = this.removeAccents(this.normalize(a));
        const right = this.removeAccents(this.normalize(b));
        const matrix = Array.from({ length: left.length + 1 }, () => []);

        for (let i = 0; i <= left.length; i++) {
            matrix[i][0] = i;
        }
        for (let j = 0; j <= right.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= left.length; i++) {
            for (let j = 1; j <= right.length; j++) {
                const cost = left[i - 1] === right[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[left.length][right.length];
    }

    removeAccents(text) {
        return text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    }

    getScoreForGuess(guessNumber) {
        return POINTS_BY_GUESS[Math.min(guessNumber - 1, POINTS_BY_GUESS.length - 1)];
    }

    updateBounds() {
        this.el.lowerBound.textContent = this.lowerBound || 'Sem limite';
        this.el.upperBound.textContent = this.upperBound || 'Sem limite';
    }

    updateStats() {
        this.el.attempts.textContent = this.attempts;
        this.el.remaining.textContent = Math.max(0, MAX_GUESSES - this.attempts);
        this.el.score.textContent = this.score;
    }

    updatePreview(word, percent) {
        this.el.currentGuess.textContent = word || 'palavra';
        const hasPercent = typeof percent === 'number';

        if (!hasPercent) {
            this.el.distanceAbove.textContent = '';
            this.el.distanceBelow.textContent = '';
            return;
        }

        const label = `Distância: ${this.formatDistancePercent(percent)}`;
        if (percent > 50) {
            this.el.distanceAbove.textContent = label;
            this.el.distanceBelow.textContent = '';
        } else {
            this.el.distanceAbove.textContent = '';
            this.el.distanceBelow.textContent = label;
        }
    }

    renderAlphabet() {
        const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
        const lower = this.lowerBound ? this.lowerBound.toUpperCase() : null;
        const upper = this.upperBound ? this.upperBound.toUpperCase() : null;
        const currentPrefix = this.normalize(this.el.guessInput.value).toUpperCase();
        const { fixedPrefix, possible } = this.computeAlphabetConstraints(lower, upper, currentPrefix);

        this.el.alphabetRow.innerHTML = letters.map((letter) => {
            const isFixed = fixedPrefix.includes(letter);
            const isPossible = possible.includes(letter);
            const stateClass = isFixed ? 'letter-fixed' : isPossible ? 'letter-possible' : 'letter-excluded';
            return `<span class="letter-block ${stateClass}">${letter}</span>`;
        }).join('');

        if (fixedPrefix.length > 0) {
            this.el.alphabetHint.textContent = `Prefixo fixo: ${fixedPrefix.join('')}`;
        } else if (currentPrefix.length > 0) {
            this.el.alphabetHint.textContent = possible.length > 0 ? `Letras possíveis para a próxima posição de "${currentPrefix}": ${possible.join('')}` : 'Nenhuma letra possível para esse prefixo.';
        } else if (possible.length === 26) {
            this.el.alphabetHint.textContent = 'Todas as letras ainda são possíveis.';
        } else if (possible.length > 0) {
            this.el.alphabetHint.textContent = `Próxima letra possível: ${possible[0]}–${possible[possible.length - 1]}`;
        } else {
            this.el.alphabetHint.textContent = 'Ainda não há prefixo fixo definido.';
        }
    }

    computeAlphabetConstraints(lower, upper, currentPrefix) {
        const alphabet = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
        const normalizedPrefix = currentPrefix.toLowerCase();
        const fixedPrefix = [];

        if (lower && upper) {
            const lowerNormalized = lower.toLowerCase();
            const upperNormalized = upper.toLowerCase();
            const minLength = Math.min(lowerNormalized.length, upperNormalized.length);
            let index = 0;

            while (index < minLength && lowerNormalized[index] === upperNormalized[index]) {
                fixedPrefix.push(lowerNormalized[index].toUpperCase());
                index += 1;
            }
        }

        if (this.commonWordsList.length > 0) {
            const possibleSet = new Set();
            const prefixLength = normalizedPrefix.length;
            const lowerNormalized = lower ? lower.toLowerCase() : null;
            const upperNormalized = upper ? upper.toLowerCase() : null;

            for (const word of this.commonWordsList) {
                if (lowerNormalized && this.compareWords(word, lowerNormalized) <= 0) continue;
                if (upperNormalized && this.compareWords(word, upperNormalized) >= 0) continue;
                if (!word.startsWith(normalizedPrefix)) continue;
                if (word.length > prefixLength) {
                    possibleSet.add(word[prefixLength].toUpperCase());
                }
            }

            const possible = Array.from(possibleSet).sort();
            if (possible.length > 0 || currentPrefix.length > 0) {
                return { fixedPrefix, possible };
            }
        }

        if (!lower || !upper) {
            return { fixedPrefix, possible: alphabet };
        }

        const minLength = Math.min(lower.length, upper.length);
        let index = 0;

        while (index < minLength && lower[index] === upper[index]) {
            index += 1;
        }

        if (index >= minLength) {
            return { fixedPrefix, possible: alphabet };
        }

        const start = lower.charCodeAt(index);
        const end = upper.charCodeAt(index);
        const possible = [];

        for (let code = start; code <= end; code += 1) {
            possible.push(String.fromCharCode(code));
        }

        return { fixedPrefix, possible };
    }

    formatDistancePercent(value) {
        if (value > 10) {
            return `${Math.round(value)}%`;
        }
        if (value > 1) {
            return `${value.toFixed(1)}%`;
        }
        return `${value.toFixed(2)}%`;
    }

    computeDistancePercent(distance, maxLen) {
        if (!maxLen) {
            return 0;
        }
        return (distance / maxLen) * 100;
    }

    renderGuesses() {
        this.el.guessList.innerHTML = '';

        if (this.guesses.length === 0) {
            this.el.guessList.innerHTML = '<div class="guess-item">Nenhum palpite ainda.</div>';
            return;
        }

        this.guesses.forEach(({ word, result, percent, success }) => {
            const item = document.createElement('div');
            item.className = 'guess-item';
            item.innerHTML = `<span>${word}</span><small>${success ? '✔️ Acertou' : `${result} (${percent})`}</small>`;
            this.el.guessList.appendChild(item);
        });
    }

    showMessage(text, type) {
        this.el.message.textContent = text;
        this.el.message.className = `message ${type}`;
    }

    clearMessage() {
        this.el.message.textContent = '';
        this.el.message.className = 'message';
    }

    updateDistance(text) {
        this.el.distanceInfo.textContent = text;
    }

    endGame(won) {
        this.gameOver = true;
        this.el.guessInput.disabled = true;
        this.el.submitBtn.disabled = true;

        if (!won) {
            this.showMessage('Fim de jogo. Reinicie para tentar novamente.', 'error');
            this.updateDistance('Fim de jogo. Sem revelação da palavra.');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new BetweenleGame();
});
