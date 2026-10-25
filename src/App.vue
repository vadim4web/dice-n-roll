<script setup>
import { ref } from 'vue';
import IconSprite from './components/IconSprite.vue';
import SvgIcon from './components/SvgIcon.vue';
import GameDie from './components/GameDie.vue';
import DieFace from './components/DieFace.vue';
import GameModal from './components/GameModal.vue';
import { useDiceGame } from './composables/useDiceGame.js';

const {
  game, muted, busy, modal, toastMessage, confetti, bustFlash, newRecord, pendingMode, visualDice, heldDice,
  selection, validSelection, prospective, recordList, bestRecord, chance, goal, progress, time, urgent,
  rollLabel, riskText, messages, tip, format, roll, bank, toggleDie, newGame, requestNewGame, toggleSound,
} = useDiceGame();
const rollButton = ref(null);
function goPlay() { modal.value = ''; rollButton.value?.focus(); }
const recordDate = date => new Date(date).toLocaleDateString('ru-RU');
</script>

<template>
  <IconSprite />
  <aside class="rail" aria-label="Основное меню">
    <a href="./" class="brand-mark" aria-label="Dice’n’Roll, главная"><SvgIcon name="dice" /></a>
    <div class="rail-main">
      <button class="rail-button active" aria-label="Играть" title="Играть" @click="goPlay"><SvgIcon name="dice" /></button>
      <button class="rail-button" aria-label="Личные рекорды" title="Личные рекорды" @click="modal = 'records'"><SvgIcon name="cup" /></button>
      <button class="rail-button" aria-label="Как играть" title="Как играть" @click="modal = 'rules'"><SvgIcon name="info" /></button>
    </div>
    <button class="rail-button sound-button" :aria-label="muted ? 'Включить звук' : 'Выключить звук'" :title="muted ? 'Включить звук' : 'Выключить звук'" @click="toggleSound"><SvgIcon :name="muted ? 'mute' : 'sound'" /></button>
    <div class="rail-footer">D’R</div>
  </aside>
  <div class="app-shell">
    <header class="topbar">
      <a href="./" class="wordmark">dice<span>’n’</span>roll<span class="wordmark-dot">.</span></a>
      <div class="header-tag"><span class="live-dot" /> МАЛЕНЬКИЙ ПЕРЕРЫВ. БОЛЬШАЯ УДАЧА.</div>
      <div class="header-actions">
        <div class="mobile-tools">
          <button class="icon-button sound-button" :aria-label="muted ? 'Включить звук' : 'Выключить звук'" @click="toggleSound"><SvgIcon :name="muted ? 'mute' : 'sound'" /></button>
          <button class="icon-button" aria-label="Личные рекорды" @click="modal = 'records'"><SvgIcon name="cup" /></button>
        </div>
        <button class="help-button" @click="modal = 'rules'"><SvgIcon name="info" /> Как играть <span>↗</span></button>
      </div>
    </header>
    <main>
      <section class="page-heading">
        <div><div class="eyebrow"><span /> ROLL. RISK. REPEAT.</div><h1>А вдруг <em>повезёт?</em><span class="heading-star">✳</span></h1><p>Шесть костей. Один выбор. Ещё один бросок?</p></div>
        <div class="best-badge"><div class="trophy-circle"><SvgIcon name="cup" /></div><div><span>ТВОЙ ЛУЧШИЙ СЧЁТ</span><strong id="personal-best">{{ format(bestRecord) }}</strong></div><div class="badge-star">✧</div></div>
      </section>
      <div class="game-layout">
        <section class="game-column" aria-label="Игровой стол">
          <div class="game-toolbar">
            <div class="mode-tabs" role="group" aria-label="Режим игры">
              <button :class="['mode-tab', { active: game.mode === 'classic' }]" :aria-pressed="game.mode === 'classic'" :disabled="busy" data-mode="classic" @click="game.mode !== 'classic' && requestNewGame('classic')"><SvgIcon name="dice" /> Классика <span>10 раундов</span></button>
              <button :class="['mode-tab', { active: game.mode === 'blitz' }]" :aria-pressed="game.mode === 'blitz'" :disabled="busy" data-mode="blitz" @click="game.mode !== 'blitz' && requestNewGame('blitz')"><SvgIcon name="bolt" /> Блиц <span>90 секунд</span></button>
            </div>
            <button id="restart" class="restart-button" title="Начать новую игру" :disabled="busy" @click="requestNewGame()"><SvgIcon name="roll" /><span>Заново</span></button>
          </div>
          <div id="game-table" :class="['game-table', { 'bust-flash': bustFlash }]">
            <div class="table-top">
              <div class="round-display"><span>{{ game.mode === 'blitz' ? 'НА ТАЙМЕРЕ' : 'РАУНД' }}</span><strong><span id="round-number" :style="{ color: urgent ? '#f0ba8f' : '' }">{{ game.mode === 'blitz' ? time : String(game.round).padStart(2, '0') }}</span><small v-if="game.mode === 'classic'"> / 10</small></strong></div>
              <div class="round-bank"><span>НА КОНУ В РАУНДЕ</span><div><strong id="round-score">{{ format(prospective) }}</strong><span class="points-label">очков</span></div></div>
              <div class="risk-status" :style="{ color: game.phase === 'rolled' && chance >= 40 ? '#edc094' : '' }"><span class="live-dot" /><span>{{ riskText }}</span></div>
            </div>
            <div class="table-decor decor-one">✳</div><div class="table-decor decor-two">+</div>
            <div id="dice-stage" :class="['dice-stage', { rolling: busy }]" aria-label="Кости">
              <GameDie v-for="(value, index) in (visualDice || game.dice)" :key="index" :value="value" :index="index" :held="heldDice.includes(index)" :selected="!busy && game.selected.includes(index)" :disabled="busy || game.phase !== 'rolled'" @select="toggleDie" />
            </div>
            <div class="table-message" aria-live="polite"><div class="message-title">{{ messages.title }}</div><p>{{ messages.text }}</p></div>
            <div class="selection-strip"><span class="selection-dot" /><span>{{ messages.selection }}</span><strong v-if="validSelection && !busy">+{{ format(selection.points) }}</strong></div>
            <div class="table-bottom"><span>THE DICE ARE IN YOUR HANDS</span><span class="mini-brand">D’R <SvgIcon name="dice" /></span></div>
          </div>
          <div class="action-panel">
            <button id="roll-button" ref="rollButton" class="roll-button" :disabled="busy || (game.phase === 'rolled' && !validSelection)" @click="roll"><SvgIcon name="dice" /><span>{{ rollLabel }}</span><kbd>SPACE</kbd></button>
            <button id="bank-button" class="bank-button" :disabled="busy || !validSelection" @click="bank"><span>{{ validSelection ? `Забрать ${format(prospective)}` : 'Забрать очки' }}</span><SvgIcon name="arrow" /></button>
          </div>
          <div class="under-actions"><span><span class="keyboard-symbol">⌨</span> <kbd>1–6</kbd> выбрать кости <i>·</i> <kbd>Enter</kbd> забрать</span><span>{{ game.rolls ? `Бросков за игру: ${game.rolls}` : 'Твой следующий любимый перерыв' }}</span></div>
          <section class="combo-section">
            <div class="section-title"><h2>Знакомься, твои счастливые комбинации</h2><button @click="modal = 'rules'">Все правила <SvgIcon name="arrow" /></button></div>
            <div class="combo-grid">
              <div class="combo-card"><div class="combo-visual"><span class="tiny-die"><DieFace :value="1" /></span></div><div><strong>Единица</strong><span>Маленькое начало</span></div><b>100</b></div>
              <div class="combo-card"><div class="combo-visual"><span class="tiny-die"><DieFace :value="5" /></span></div><div><strong>Пятёрка</strong><span>Тоже приятно</span></div><b>50</b></div>
              <div class="combo-card"><div class="combo-visual triple"><span v-for="i in 3" :key="i" class="tiny-die"><DieFace :value="3" /></span></div><div><strong>Три одинаковых</strong><span>Вот это уже комбо</span></div><b>×100</b></div>
            </div>
          </section>
        </section>
        <aside class="session-column">
          <section class="score-card">
            <div class="card-eyebrow"><span>ТВОЯ ИГРА</span><span class="session-dot">●</span></div><span class="total-label">Общий счёт</span><div id="total-score" class="total-score">{{ format(game.total) }}</div>
            <div class="score-goal"><span>{{ game.total < 1000 ? 'Разогрев до' : 'Следующая цель:' }} {{ format(goal) }}</span><span>{{ progress }}%</span></div><div class="progress-track"><div :style="{ width: `${progress}%` }" /></div>
            <div class="session-stats"><div><span>Лучший раунд</span><strong>{{ game.bestRound ? format(game.bestRound) : '—' }}</strong></div><div><span>Удачных бросков</span><strong>{{ game.successful }}</strong></div></div>
          </section>
          <section class="risk-card"><div class="risk-card-icon">✳</div><div class="eyebrow">МАЛЕНЬКИЙ СОВЕТ</div><h2>Жадность —<br>тоже стратегия<span>.</span></h2><p>{{ tip }}</p><div class="risk-card-footer"><span>Чувствуешь этот азарт?</span><SvgIcon name="arrow" /></div></section>
          <section class="history-card">
            <div class="section-title"><h2>Последние раунды</h2><span>{{ game.mode === 'classic' ? `${game.history.length} / 10` : `${game.history.length} раундов` }}</span></div>
            <div id="round-history">
              <template v-if="game.history.length"><div v-for="round in game.history.slice(-3).reverse()" :key="round.round" :class="['history-row', { bust: round.bust }]"><span class="history-index">{{ String(round.round).padStart(2, '0') }}</span><span class="history-name">{{ round.bust ? 'Не в этот раз' : round.points >= 1000 ? 'Мощный раунд' : 'В копилку' }}</span><strong>{{ round.bust ? '0' : '+' + format(round.points) }}</strong></div></template>
              <div v-else class="history-empty"><div class="history-empty-dice"><SvgIcon name="dice" /></div><p>Пока чистый лист</p><span>Самое интересное впереди</span></div>
            </div>
          </section>
        </aside>
      </div>
      <footer><span>Сделано для «ну ещё один раз».</span><span><span class="footer-dot" /> Никаких ставок. Только твой рекорд.</span><span>DICE’N’ROLL © 2026</span></footer>
    </main>
  </div>

  <GameModal :open="!!modal" @close="modal = ''">
    <template v-if="modal === 'rules'">
      <h2 id="modal-title">Удача любит<br>ещё один бросок<span class="accent">.</span></h2><p>Собери больше очков за 10 раундов. Или выбери блиц и успей за 90 секунд.</p>
      <div class="rules-steps">
        <div class="rule-step"><span class="step-number">1</span><div><strong>Бросай и выбирай</strong><p>Единицы, пятёрки и от трёх одинаковых приносят очки. Лучшая комбинация выделяется автоматически — её можно изменить кликом.</p></div></div>
        <div class="rule-step"><span class="step-number">2</span><div><strong>Забрать или рискнуть?</strong><p>Забери очки в общий счёт и начни новый раунд. Или оставь выбранные кости и брось остальные, чтобы увеличить очки раунда.</p></div></div>
        <div class="rule-step"><span class="step-number">3</span><div><strong>Пустой бросок = всё сгорело</strong><p>Нет комбинаций? Очки текущего раунда пропадают. Сохранённый общий счёт остаётся. Если все шесть костей дали очки, можно бросить их все снова!</p></div></div>
      </div>
      <div class="rules-table"><span>Каждая единица / пятёрка</span><b>100 / 50</b><span>Три одинаковых 2–6</span><b>число × 100</b><span>Три единицы</span><b>1 000</b><span>Каждая следующая одинаковая</span><b>удваивает тройку</b><span>Стрит 1–6 / три пары</span><b>1 500</b></div>
      <p class="rules-note">Комбинации собираются в пределах одного броска. В блице таймер идёт и при открытых правилах; по окончании незабранные очки сгорают. Звук: кнопка динамика в меню или клавиша M.</p><button class="modal-primary" @click="modal = ''">Понятно. Погнали!</button>
    </template>
    <template v-else-if="modal === 'records'">
      <h2 id="modal-title">Твоя полоса удачи<span class="accent">.</span></h2><p>{{ game.mode === 'classic' ? 'Классика · 10 раундов' : 'Блиц · 90 секунд' }} · Личные рекорды в этом браузере</p>
      <template v-if="recordList.length"><div v-for="(record, i) in recordList" :key="`${record.date}-${i}`" class="record-item"><span class="rank">{{ i + 1 }}</span><div><p>{{ i === 0 ? 'Планка, которую стоит поднять' : 'Хорошая была игра' }}</p><small>{{ recordDate(record.date) }}</small></div><strong>{{ format(record.score) }}</strong></div></template>
      <div v-else class="results-hero"><div class="results-icon">✧</div><p>Первый рекорд пока ждёт тебя.<br>Закончи игру — и он появится здесь.</p></div>
      <button class="modal-primary" @click="modal = ''">Вернуться к костям</button>
    </template>
    <template v-else-if="modal === 'confirm'">
      <h2 id="modal-title">{{ pendingMode !== game.mode ? 'Сменим темп?' : 'Начнём с чистого листа?' }}</h2><p>Текущая игра завершится без сохранения в рекорды. Начать {{ pendingMode === 'classic' ? 'классическую игру на 10 раундов' : 'блиц на 90 секунд' }}?</p><button id="confirm-new" class="modal-primary" @click="newGame(pendingMode)">Начать новую игру</button><button class="modal-secondary" @click="modal = ''">Продолжить текущую</button>
    </template>
    <template v-else-if="modal === 'results'">
      <div class="results-hero"><div class="results-icon"><SvgIcon name="cup" /></div><h2 id="modal-title">{{ game.total >= 3000 ? 'Удача тебя запомнит.' : 'Ну как тут остановиться?' }}</h2><p>{{ game.mode === 'blitz' ? 'Время вышло' : 'Все 10 раундов позади' }}. Вот твой результат:</p><div class="results-score">{{ format(game.total) }}</div><span class="eyebrow results-caption">ОЧКОВ В КОПИЛКЕ</span><div v-if="newRecord" class="new-record">✦ Новый личный рекорд!</div><div class="results-details"><div><strong>{{ format(game.bestRound) }}</strong><span>ЛУЧШИЙ РАУНД</span></div><div><strong>{{ game.successful }}</strong><span>УДАЧНЫХ БРОСКОВ</span></div></div></div>
      <button class="modal-primary" @click="newGame()">Ну ещё один раз <SvgIcon name="arrow" /></button><button class="modal-secondary" @click="modal = 'records'">Посмотреть рекорды</button>
    </template>
  </GameModal>
  <div id="toast" :class="['toast', { show: toastMessage }]" role="status">{{ toastMessage }}</div>
  <div id="confetti" aria-hidden="true"><span v-for="piece in confetti" :key="piece.id" class="confetto" :style="piece.style" /></div>
</template>
