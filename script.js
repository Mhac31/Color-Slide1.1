"use strict";

const GAME_CONFIG = Object.freeze({
  colors: Object.freeze(["red", "blue", "green", "yellow"]),
  progression: Object.freeze({
    initialBoardSize: 5,
    targetBorder: 1,
    tilesAddedPerPuzzle: 1,
  }),
  puzzle: Object.freeze({
    baseScrambleMoves: 70,
    scrambleMovesPerBoardCell: 1.2,
    maxScrambleMoves: 500,
    transitionMs: 480,
    successMs: 1200,
    moveAnimationMs: 190,
    magneticSnapMs: 140,
    invalidReturnMs: 180,
    dragAxisLockThresholdPx: 8,
  }),
  timer: Object.freeze({
    startingSeconds: 180,
    maximumSeconds: 300,
    performanceAllowance: Object.freeze({
      baseSeconds: 12,
      secondsPerTargetTile: 1.25,
      secondsPerBoardSize: 1.8,
      secondsPerColoredTile: 0.18,
      secondsPerScrambleMove: 0.16,
      movesPerScrambleMove: 0.45,
      movesPerTargetTile: 0.75,
      movesPerColoredTile: 0.15,
    }),
    rewardBands: Object.freeze([
      Object.freeze({ minimumPerformance: 0.9, seconds: 30, label: "Exceptional" }),
      Object.freeze({ minimumPerformance: 0.78, seconds: 25, label: "Very fast" }),
      Object.freeze({ minimumPerformance: 0.62, seconds: 20, label: "Fast" }),
      Object.freeze({ minimumPerformance: 0.4, seconds: 15, label: "Normal" }),
      Object.freeze({ minimumPerformance: 0.18, seconds: 5, label: "Slow" }),
      Object.freeze({ minimumPerformance: 0, seconds: 0, label: "Very slow" }),
    ]),
  }),
  scoring: Object.freeze({
    basePointsByTargetSize: Object.freeze({ 3: 100, 4: 200, 5: 350, 6: 550, 7: 800 }),
    fallbackPointsPerTargetSize: 250,
    maximumSpeedBonusRatio: 0.6,
    maximumEfficiencyBonusRatio: 0.4,
  }),
});
const COLORS = GAME_CONFIG.colors;
const EMPTY_TILE = null;
const COLORBLIND_STORAGE_KEY = "colorGridColorblindMode";
const SOUND_STORAGE_KEY = "colorGridSoundEnabled";
const BEST_SCORE_STORAGE_KEY = "colorGridBestScore";

const targetGrid = document.querySelector("#target-grid");
const targetMatchProgress = document.querySelector("#target-match-progress");
const playerGrid = document.querySelector("#player-grid");
const moveCountDisplay = document.querySelector("#move-count");
const scoreDisplay = document.querySelector("#score");
const bestScoreDisplay = document.querySelector("#best-score");
const puzzleCountDisplay = document.querySelector("#puzzle-count");
const timerDisplay = document.querySelector("#timer");
const timerStat = document.querySelector("#timer-stat");
const statusMessage = document.querySelector("#status-message");
const gridHint = document.querySelector("#grid-hint");
const roundNumberDisplay = document.querySelector("#round-number");
const successOverlay = document.querySelector("#success-overlay");
const successParticles = document.querySelector("#success-particles");
const newHighScoreBanner = document.querySelector("#new-high-score-banner");
const gameOverPanel = document.querySelector("#game-over-panel");
const finalScoreDisplay = document.querySelector("#final-score");
const finalBestScoreDisplay = document.querySelector("#final-best-score");
const finalPuzzlesDisplay = document.querySelector("#final-puzzles");
const finalMovesDisplay = document.querySelector("#final-moves");
const personalBestBanner = document.querySelector("#personal-best-banner");
const playAgainButton = document.querySelector("#play-again-button");
const colorblindToggle = document.querySelector("#colorblind-toggle");
const soundToggleSetting = document.querySelector("#sound-toggle-setting");
const soundToggleButton = document.querySelector("#sound-toggle");
const gameSettingsButton = document.querySelector("#game-settings-button");
const startScreen = document.querySelector("#start-screen");
const gameScreen = document.querySelector("#game-screen");
const settingsScreen = document.querySelector("#settings-screen");
const howToScreen = document.querySelector("#how-to-screen");
const pauseOverlay = document.querySelector("#pause-overlay");
const unlockOverlay = document.querySelector("#unlock-overlay");
const pauseButton = document.querySelector("#pause-button");
const resumeButton = document.querySelector("#resume-button");
const unlockContinueButton = document.querySelector("#unlock-continue-button");
const menuBestScoreDisplay = document.querySelector("#menu-best-score");
const boardDimensionsDisplay = document.querySelector("#board-dimensions");
const matchingDimensionsDisplay = document.querySelector("#matching-dimensions");
const targetSubtitle = document.querySelector("#target-subtitle");
const progressValue = document.querySelector("#progress-value");
const progressBar = document.querySelector("#progress-bar");
const progressFill = document.querySelector("#progress-fill");
const nextUnlockDisplay = document.querySelector("#next-unlock");
const timeRewardDisplay = document.querySelector("#time-reward");
const progressTrack = document.querySelector("#progress-bar");
const rewardBaseDisplay = document.querySelector("#reward-base");
const rewardSpeedDisplay = document.querySelector("#reward-speed");
const rewardEfficiencyDisplay = document.querySelector("#reward-efficiency");
const rewardFinalPointsDisplay = document.querySelector("#reward-final-points");
const rewardTimeDisplay = document.querySelector("#reward-time");
const COLOR_MARKS = {
  red: { name: "Red", symbol: "●", letter: "R" },
  blue: { name: "Blue", symbol: "◆", letter: "B" },
  green: { name: "Green", symbol: "▲", letter: "G" },
  yellow: { name: "Yellow", symbol: "★", letter: "Y" },
};

let targetPattern = [];
let playerPattern = [];
let totalMoves = 0;
let score = 0;
let bestScore = loadBestScore();
let puzzlesCompleted = 0;
let remainingSeconds = 0;
let timerInterval = null;
let transitionTimeout = null;
let scoreAnimationFrame = null;
const activeSlideAnimations = new WeakMap();
const landingEffectTimeouts = new WeakMap();
let slideGeneration = 0;
let dragSession = null;
let dragReturnTimeout = null;
let reservedDestinationIndex = null;
let timerStarted = false;
let isTransitioning = false;
let isAnimatingMove = false;
let gameOver = false;
let puzzleRewarded = false;
let newHighScoreThisRun = false;
let colorblindMode = true;
let soundEnabled = false;
let audioContext = null;
let boardSize = GAME_CONFIG.progression.initialBoardSize;
let targetSize = boardSize - (GAME_CONFIG.progression.targetBorder * 2);
let boardTileCount = boardSize * boardSize;
let coloredTileCount = targetSize * targetSize;
let matchZoneIndices = [];
let isPaused = false;
let pendingBoardUnlock = false;
let settingsReturnScreen = "start-screen";
let timeRewardTimeout = null;
let puzzleMoves = 0;
let puzzleStartedAt = 0;
let puzzlePausedMs = 0;
let pauseStartedAt = 0;
let scrambleComplexity = 0;

function getStartingSeconds() {
  return Math.min(GAME_CONFIG.timer.maximumSeconds, GAME_CONFIG.timer.startingSeconds);
}

function updateBoardDimensions() {
  targetSize = boardSize - (GAME_CONFIG.progression.targetBorder * 2);
  boardTileCount = boardSize * boardSize;
  const firstRow = Math.floor((boardSize - targetSize) / 2);
  const firstColumn = Math.floor((boardSize - targetSize) / 2);
  matchZoneIndices = Array.from({ length: targetSize * targetSize }, (_, index) => {
    const row = firstRow + Math.floor(index / targetSize);
    const column = firstColumn + (index % targetSize);
    return row * boardSize + column;
  });
  playerGrid.style.setProperty("--grid-size", String(boardSize));
  playerGrid.style.setProperty("--zone-start", String(Math.floor((boardSize - targetSize) / 2) + 1));
  playerGrid.style.setProperty("--zone-size", String(targetSize));
  targetGrid.style.setProperty("--grid-size", String(targetSize));
  boardDimensionsDisplay.textContent = `${boardSize} × ${boardSize}`;
  matchingDimensionsDisplay.textContent = `CENTER ${targetSize} × ${targetSize}`;
  targetSubtitle.textContent = `Match this ${targetSize} × ${targetSize} center pattern`;
  playerGrid.setAttribute(
    "aria-label",
    `Sliding puzzle board, ${boardSize} by ${boardSize}. Match the center ${targetSize} by ${targetSize}.`,
  );
}

function updateProgressDisplay() {
  const progress = Math.min(coloredTileCount, boardTileCount);
  progressValue.textContent = `${progress} / ${boardTileCount}`;
  progressTrack.setAttribute("aria-valuemax", String(boardTileCount));
  progressTrack.setAttribute("aria-valuenow", String(progress));
  progressFill.style.width = `${(progress / boardTileCount) * 100}%`;
  nextUnlockDisplay.textContent = progress === boardTileCount
    ? `Next board: ${boardSize + 1} × ${boardSize + 1}`
    : `Next puzzle: ${progress + GAME_CONFIG.progression.tilesAddedPerPuzzle} tiles`;
}

function loadBestScore() {
  try {
    const storedScore = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY);
    if (storedScore === null) {
      return 0;
    }

    const savedScore = Number(storedScore);
    if (storedScore.trim() === "" || !Number.isSafeInteger(savedScore) || savedScore < 0) {
      console.warn("[COLOR GRID] The saved best score is invalid; starting with 0.");
      return 0;
    }

    return savedScore;
  } catch (error) {
    console.warn("[COLOR GRID] Could not load the saved best score.", error);
    return 0;
  }
}

function saveBestScore() {
  try {
    window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(bestScore));
  } catch (error) {
    console.warn("[COLOR GRID] Could not save the best score.", error);
  }
}

function loadColorblindPreference() {
  try {
    const savedPreference = window.localStorage.getItem(COLORBLIND_STORAGE_KEY);
    return savedPreference === null ? true : savedPreference === "true";
  } catch (error) {
    console.warn("[COLOR GRID] Could not load the colorblind mode preference.", error);
    return true;
  }
}

function saveColorblindPreference(enabled) {
  try {
    window.localStorage.setItem(COLORBLIND_STORAGE_KEY, String(enabled));
  } catch (error) {
    console.warn("[COLOR GRID] Could not save the colorblind mode preference.", error);
  }
}

function loadSoundPreference() {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("[COLOR GRID] Could not load the sound preference.", error);
    return false;
  }
}

function saveSoundPreference(enabled) {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
  } catch (error) {
    console.warn("[COLOR GRID] Could not save the sound preference.", error);
  }
}

function applyColorblindMode(enabled) {
  colorblindMode = enabled;
  document.documentElement.classList.toggle("colorblind-mode", colorblindMode);
}

function applySoundPreference(enabled) {
  soundEnabled = enabled;
  soundToggleSetting.checked = enabled;
  soundToggleButton.setAttribute("aria-pressed", String(enabled));
  soundToggleButton.setAttribute("aria-label", enabled ? "Turn sound off" : "Turn sound on");
  soundToggleButton.querySelector("span").textContent = enabled ? "SOUND ON" : "SOUND OFF";
}

function playSound(frequency, duration = 0.06) {
  if (!soundEnabled) {
    return;
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  try {
    audioContext ??= new AudioContextConstructor();
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    console.warn("[COLOR GRID] Could not play a sound effect.", error);
  }
}

// Fisher-Yates keeps every tile while giving it a random new position.
function shufflePattern(pattern) {
  const shuffled = [...pattern];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

// Build an exact-size inventory while keeping every color available to the target.
function makeColorInventory() {
  const inventory = [...COLORS];

  while (inventory.length < coloredTileCount) {
    inventory.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
  }

  return shufflePattern(inventory).slice(0, coloredTileCount);
}

// Draw the target from this board's inventory without using any color too often.
function makeTargetPattern(inventory, previousTarget) {
  let pattern;

  do {
    const availableTiles = [...inventory];
    pattern = Array.from({ length: targetSize * targetSize }, () => {
      const tileIndex = Math.floor(Math.random() * availableTiles.length);
      return availableTiles.splice(tileIndex, 1)[0];
    });
  } while (
    new Set(pattern).size < 2
    || (previousTarget && pattern.every((color, index) => color === previousTarget[index]))
  );

  return pattern;
}

function getAdjacentTileIndices(index) {
  const row = Math.floor(index / boardSize);
  const column = index % boardSize;
  const adjacent = [];

  if (row > 0) adjacent.push(index - boardSize);
  if (row < boardSize - 1) adjacent.push(index + boardSize);
  if (column > 0) adjacent.push(index - 1);
  if (column < boardSize - 1) adjacent.push(index + 1);

  return adjacent;
}

function areAdjacentTileIndices(firstIndex, secondIndex) {
  if (
    !Number.isInteger(firstIndex)
    || !Number.isInteger(secondIndex)
    || firstIndex < 0
    || secondIndex < 0
    || firstIndex >= boardTileCount
    || secondIndex >= boardTileCount
  ) {
    return false;
  }

  const firstRow = Math.floor(firstIndex / boardSize);
  const firstColumn = firstIndex % boardSize;
  const secondRow = Math.floor(secondIndex / boardSize);
  const secondColumn = secondIndex % boardSize;
  return Math.abs(firstRow - secondRow) + Math.abs(firstColumn - secondColumn) === 1;
}

function canSlideTileTo(tileIndex, destinationIndex) {
  if (
    !Number.isInteger(tileIndex)
    || !Number.isInteger(destinationIndex)
    || tileIndex < 0
    || destinationIndex < 0
    || tileIndex >= boardTileCount
    || destinationIndex >= boardTileCount
    || tileIndex === destinationIndex
    || playerPattern[tileIndex] === EMPTY_TILE
    || playerPattern[destinationIndex] !== EMPTY_TILE
  ) {
    return false;
  }

  const sourceRow = Math.floor(tileIndex / boardSize);
  const sourceColumn = tileIndex % boardSize;
  const destinationRow = Math.floor(destinationIndex / boardSize);
  const destinationColumn = destinationIndex % boardSize;
  if (sourceRow !== destinationRow && sourceColumn !== destinationColumn) {
    return false;
  }

  const rowStep = Math.sign(destinationRow - sourceRow);
  const columnStep = Math.sign(destinationColumn - sourceColumn);
  const step = (rowStep * boardSize) + columnStep;
  for (let index = tileIndex + step; index !== destinationIndex; index += step) {
    if (playerPattern[index] !== EMPTY_TILE) {
      return false;
    }
  }
  return true;
}

function getSolvedBoard(targetPattern, inventory) {
  const board = Array(boardTileCount).fill(EMPTY_TILE);
  const remainingInventory = [...inventory];

  matchZoneIndices.forEach((boardIndex, targetIndex) => {
    board[boardIndex] = targetPattern[targetIndex];
    remainingInventory.splice(remainingInventory.indexOf(targetPattern[targetIndex]), 1);
  });

  const outsideIndices = Array.from(
    { length: boardTileCount },
    (_, index) => index,
  ).filter((index) => !matchZoneIndices.includes(index));

  const outsideContents = shufflePattern([
    ...remainingInventory,
    ...Array(boardTileCount - coloredTileCount).fill(EMPTY_TILE),
  ]);
  shufflePattern(outsideIndices).forEach((boardIndex, index) => {
    board[boardIndex] = outsideContents[index];
  });

  return board;
}

function getEmptyIndices(board) {
  return board.reduce((indices, color, index) => {
    if (color === EMPTY_TILE) {
      indices.push(index);
    }
    return indices;
  }, []);
}

function getMoveOptions(board) {
  const options = [];
  getEmptyIndices(board).forEach((emptyIndex) => {
    getAdjacentTileIndices(emptyIndex).forEach((tileIndex) => {
      if (board[tileIndex] !== EMPTY_TILE) {
        options.push({ tileIndex, emptyIndex });
      }
    });
  });
  return options;
}

function getMovableTileIndices(board) {
  return new Set(getMoveOptions(board).map(({ tileIndex }) => tileIndex));
}

function countAdjacentEmptyPairs(board) {
  return getEmptyIndices(board).reduce((pairCount, emptyIndex) => {
    return pairCount + getAdjacentTileIndices(emptyIndex)
      .filter((neighborIndex) => board[neighborIndex] === EMPTY_TILE).length;
  }, 0) / 2;
}

// Legal scramble moves preserve a reverse path to the target arrangement.
function scrambleBoard(board, pattern) {
  const density = coloredTileCount / boardTileCount;
  const scrambleMoves = Math.min(
    GAME_CONFIG.puzzle.maxScrambleMoves,
    Math.round(
      GAME_CONFIG.puzzle.baseScrambleMoves
      + (boardTileCount * GAME_CONFIG.puzzle.scrambleMovesPerBoardCell)
      + (density * 45),
    ),
  );
  let previousMove = null;
  const scrambleHistory = [];

  for (let move = 0; move < scrambleMoves; move += 1) {
    let options = getMoveOptions(board);
    if (options.length === 0) {
      break;
    }
    const nonReverseOptions = options.filter((option) => (
      !previousMove
      || option.tileIndex !== previousMove.emptyIndex
      || option.emptyIndex !== previousMove.tileIndex
    ));
    if (nonReverseOptions.length > 0) {
      options = nonReverseOptions;
    }
    let bestGroupScore = Infinity;
    let bestOptions = [];
    const sampleCount = Math.min(16, options.length);
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const option = options[Math.floor(Math.random() * options.length)];
      const candidate = [...board];
      [candidate[option.emptyIndex], candidate[option.tileIndex]] =
        [candidate[option.tileIndex], candidate[option.emptyIndex]];
      const groupScore = countAdjacentEmptyPairs(candidate);
      if (groupScore < bestGroupScore) {
        bestGroupScore = groupScore;
        bestOptions = [option];
      } else if (groupScore === bestGroupScore) {
        bestOptions.push(option);
      }
    }
    const moveOption = bestOptions[Math.floor(Math.random() * bestOptions.length)];
    [board[moveOption.emptyIndex], board[moveOption.tileIndex]] =
      [board[moveOption.tileIndex], board[moveOption.emptyIndex]];
    scrambleHistory.push(moveOption);
    previousMove = moveOption;
  }

  while (isCenterSolved(board, pattern)) {
    const options = getMoveOptions(board);
    if (options.length === 0) {
      break;
    }
    const moveOption = options[Math.floor(Math.random() * options.length)];
    [board[moveOption.emptyIndex], board[moveOption.tileIndex]] =
      [board[moveOption.tileIndex], board[moveOption.emptyIndex]];
    scrambleHistory.push(moveOption);
  }

  const solutionMoves = scrambleHistory.reverse().map(({ tileIndex, emptyIndex }) => ({
    tileIndex: emptyIndex,
    emptyIndex: tileIndex,
  }));
  return {
    board,
    complexity: scrambleHistory.length,
    solutionMoves,
  };
}

function checkPattern() {
  const centerPattern = matchZoneIndices.map((boardIndex) => playerPattern[boardIndex]);
  const matches = centerPattern.every((color, index) => {
    return color !== EMPTY_TILE && color === targetPattern[index];
  });

  return matches;
}

function isCenterSolved(board, pattern) {
  return matchZoneIndices.every((boardIndex, targetIndex) => {
    return board[boardIndex] !== EMPTY_TILE && board[boardIndex] === pattern[targetIndex];
  });
}

function makePuzzle(previousTarget = null) {
  const inventory = makeColorInventory();
  const pattern = makeTargetPattern(inventory, previousTarget);
  const scrambled = scrambleBoard(getSolvedBoard(pattern, inventory), pattern);

  return {
    target: pattern,
    board: scrambled.board,
    complexity: scrambled.complexity,
    solutionMoves: scrambled.solutionMoves,
  };
}

function makeTile(color, index, isInteractive, isMatched = false) {
  const tile = document.createElement("button");
  const isMatchZoneTile = isInteractive && matchZoneIndices.includes(index);
  const isEmpty = color === EMPTY_TILE;
  tile.className = `tile ${isEmpty ? "tile-empty" : `tile-${color}`}${isMatchZoneTile ? " is-match-zone" : ""}`;
  if (!isInteractive) {
    tile.classList.add(isMatched ? "is-matched" : "is-unmatched");
  }
  tile.type = "button";
  const colorInfo = isEmpty ? null : COLOR_MARKS[color];
  const zoneLabel = isMatchZoneTile ? ", matching zone" : "";
  const targetLabel = isInteractive ? "" : ", target";
  tile.setAttribute(
    "aria-label",
    `${isEmpty ? "Empty space" : `${colorInfo.name} tile${targetLabel}`}, position ${index + 1}${zoneLabel}${isInteractive ? "" : isMatched ? ", matched" : ", unmatched"}`,
  );

  if (colorInfo) {
    const mark = document.createElement("span");
    mark.className = "tile-mark";
    mark.setAttribute("aria-hidden", "true");

    const symbol = document.createElement("span");
    symbol.className = "tile-symbol";
    symbol.textContent = colorInfo.symbol;

    const letter = document.createElement("span");
    letter.className = "tile-letter";
    letter.textContent = colorInfo.letter;

    mark.append(symbol, letter);
    tile.append(mark);
  } else {
    tile.disabled = true;
    tile.tabIndex = -1;
  }

  if (isInteractive) {
    tile.dataset.index = String(index);
    tile.disabled = isEmpty || gameOver || isTransitioning || isPaused;
  } else {
    tile.tabIndex = -1;
    tile.disabled = true;
  }

  return tile;
}

function renderTarget() {
  targetGrid.replaceChildren(
    ...targetPattern.map((color, index) => {
      const currentColor = playerPattern[matchZoneIndices[index]];
      return makeTile(color, index, false, currentColor === color);
    }),
  );
  targetGrid.setAttribute("aria-label", `Target ${targetSize} by ${targetSize} color pattern`);
  updateTargetMatches();
}

function updateTargetMatches() {
  let matchedCount = 0;
  Array.from(targetGrid.children).forEach((tile, index) => {
    const isMatched = playerPattern[matchZoneIndices[index]] === targetPattern[index];
    if (isMatched) {
      matchedCount += 1;
    }
    tile.classList.toggle("is-matched", isMatched);
    tile.classList.toggle("is-unmatched", !isMatched);
    const colorName = COLOR_MARKS[targetPattern[index]].name;
    tile.setAttribute(
      "aria-label",
      `${colorName} target tile, position ${index + 1}, ${isMatched ? "matched" : "unmatched"}`,
    );
  });
  targetMatchProgress.textContent = `${matchedCount} / ${targetPattern.length} matched`;
  targetMatchProgress.setAttribute("aria-label", `${matchedCount} of ${targetPattern.length} target tiles matched`);
}

function renderPlayerGrid() {
  slideGeneration += 1;
  dragSession = null;
  reservedDestinationIndex = null;
  isAnimatingMove = false;
  if (dragReturnTimeout !== null) {
    window.clearTimeout(dragReturnTimeout);
    dragReturnTimeout = null;
  }
  playerGrid.querySelectorAll(".tile").forEach((tile) => {
    activeSlideAnimations.get(tile)?.cancel();
    const timeoutId = landingEffectTimeouts.get(tile);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      landingEffectTimeouts.delete(tile);
    }
    tile.classList.remove("is-dragging", "is-returning", "is-drag-available", "is-drop-target");
    tile.style.removeProperty("--drag-x");
    tile.style.removeProperty("--drag-y");
    tile.style.removeProperty("--drag-scale");
    tile.style.removeProperty("--drag-rest-scale");
    tile.style.removeProperty("pointer-events");
    tile.style.removeProperty("transition");
  });
  playerGrid.replaceChildren(
    ...playerPattern.map((color, index) => makeTile(color, index, true)),
  );
}

function updateTileLabels() {
  colorblindToggle.checked = colorblindMode;
  applyColorblindMode(colorblindMode);
}

function setTilesDisabled(disabled) {
  const movableTiles = getMovableTileIndices(playerPattern);
  playerGrid.querySelectorAll(".tile").forEach((tile) => {
    const index = Number(tile.dataset.index);
    tile.disabled = disabled || isPaused || gameOver || isTransitioning
      || isAnimatingMove
      || playerPattern[index] === EMPTY_TILE
      || !movableTiles.has(index);
  });
}

function setDragTargetIndicators(destinationIndex = null, availableIndices = []) {
  const availableSet = new Set(availableIndices);
  playerGrid.querySelectorAll(".tile").forEach((tile) => {
    const index = Number(tile.dataset.index);
    const isAvailable = availableSet.has(index) && playerPattern[index] === EMPTY_TILE;
    tile.classList.toggle("is-drag-available", isAvailable);
    tile.classList.toggle("is-drop-target", index === destinationIndex && isAvailable);
  });
}

function clearDragTargetIndicators() {
  playerGrid.querySelectorAll(".is-drag-available, .is-drop-target").forEach((tile) => {
    tile.classList.remove("is-drag-available", "is-drop-target");
  });
}

function setScreen(screen) {
  [startScreen, gameScreen, settingsScreen, howToScreen].forEach((element) => {
    element.hidden = element !== screen;
  });
}

function openSettings(returnScreen) {
  settingsReturnScreen = returnScreen;
  setScreen(settingsScreen);
  document.querySelector("#settings-title").focus();
}

function pauseGame() {
  if (gameOver || isPaused) {
    return;
  }

  isPaused = true;
  pauseStartedAt = performance.now();
  stopTimer();
  setTilesDisabled(true);
  pauseOverlay.hidden = false;
  resumeButton.focus();
}

function resumeGame() {
  if (!isPaused) {
    return;
  }

  isPaused = false;
  if (pauseStartedAt > 0) {
    puzzlePausedMs += Math.max(0, performance.now() - pauseStartedAt);
    pauseStartedAt = 0;
  }
  pauseOverlay.hidden = true;
  setTilesDisabled(false);
  if (timerStarted) {
    startTimer();
  }
  if (isTransitioning && transitionTimeout === null) {
    finishPuzzleTransition();
  }
  setStatus(
    timerStarted
      ? "Time is running! Slide tiles to match the target."
      : `Ready when you are. Your ${remainingSeconds} seconds start on your first move.`,
  );
  pauseButton.focus();
}

function showTimeReward(seconds) {
  timeRewardDisplay.textContent = `+${seconds} sec`;
  timeRewardDisplay.classList.remove("is-visible");
  void timeRewardDisplay.offsetWidth;
  timeRewardDisplay.classList.add("is-visible");
  window.clearTimeout(timeRewardTimeout);
  timeRewardTimeout = window.setTimeout(() => {
    timeRewardDisplay.classList.remove("is-visible");
    timeRewardTimeout = null;
  }, 1250);
}

function returnToMenu() {
  stopTimer();
  if (transitionTimeout !== null) {
    window.clearTimeout(transitionTimeout);
    transitionTimeout = null;
  }
  if (timeRewardTimeout !== null) {
    window.clearTimeout(timeRewardTimeout);
    timeRewardTimeout = null;
  }
  isPaused = false;
  isTransitioning = false;
  pendingBoardUnlock = false;
  pauseOverlay.hidden = true;
  unlockOverlay.hidden = true;
  gameOverPanel.hidden = true;
  setScreen(startScreen);
  document.querySelector("#start-button").focus();
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function getPuzzlePerformance() {
  const now = performance.now();
  const elapsedSeconds = puzzleStartedAt > 0
    ? Math.max(0, (now - puzzleStartedAt - puzzlePausedMs) / 1000)
    : 0;
  const allowance = GAME_CONFIG.timer.performanceAllowance;
  const targetTileCount = targetSize * targetSize;
  const timeAllowance = allowance.baseSeconds
    + targetTileCount * allowance.secondsPerTargetTile
    + boardSize * allowance.secondsPerBoardSize
    + coloredTileCount * allowance.secondsPerColoredTile
    + scrambleComplexity * allowance.secondsPerScrambleMove;
  const moveAllowance = Math.max(
    12,
    scrambleComplexity * allowance.movesPerScrambleMove
      + targetTileCount * allowance.movesPerTargetTile
      + coloredTileCount * allowance.movesPerColoredTile,
  );
  const timeRatio = elapsedSeconds / timeAllowance;
  const moveRatio = puzzleMoves / moveAllowance;
  const performanceScore = Math.max(0, Math.min(1, 1 - (timeRatio * 0.65) - (moveRatio * 0.35)));
  return {
    elapsedSeconds,
    timeRatio,
    moveRatio,
    performanceScore,
  };
}

function getBasePoints(size) {
  return GAME_CONFIG.scoring.basePointsByTargetSize[size]
    ?? GAME_CONFIG.scoring.basePointsByTargetSize[7]
      + ((size - 7) * GAME_CONFIG.scoring.fallbackPointsPerTargetSize);
}

function calculatePuzzleReward() {
  const performance = getPuzzlePerformance();
  const basePoints = getBasePoints(targetSize);
  const densityFactor = 0.8 + (0.2 * (coloredTileCount / boardTileCount));
  const speedBonus = Math.round(
    basePoints
      * Math.max(0, 1 - performance.timeRatio)
      * GAME_CONFIG.scoring.maximumSpeedBonusRatio
      * densityFactor,
  );
  const efficiencyBonus = Math.round(
    basePoints
      * Math.max(0, 1 - performance.moveRatio)
      * GAME_CONFIG.scoring.maximumEfficiencyBonusRatio
      * densityFactor,
  );
  const timeBand = GAME_CONFIG.timer.rewardBands.find((band) => (
    performance.performanceScore >= band.minimumPerformance
  ));
  return {
    ...performance,
    basePoints,
    speedBonus,
    efficiencyBonus,
    finalPoints: basePoints + speedBonus + efficiencyBonus,
    timeReward: timeBand ? timeBand.seconds : 0,
    performanceLabel: timeBand ? timeBand.label : "Very slow",
  };
}

function updateTimerDisplay() {
  timerDisplay.textContent = formatTime(remainingSeconds);
  timerStat.classList.toggle("is-warning", remainingSeconds <= 20 && remainingSeconds > 10);
  timerStat.classList.toggle("is-urgent", remainingSeconds <= 10);
}

function startTimer() {
  if (timerInterval !== null || gameOver || isPaused) {
    return;
  }

  timerStarted = true;
  if (puzzleStartedAt === 0) {
    puzzleStartedAt = performance.now();
    puzzlePausedMs = 0;
  }
  setStatus("Time is running! Drag tiles into the highlighted pattern.");
  timerInterval = window.setInterval(() => {
    remainingSeconds = Math.max(0, remainingSeconds - 1);
    updateTimerDisplay();

    if (remainingSeconds === 0) {
      endGame();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval !== null) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
}

function setStatus(message) {
  statusMessage.lastChild.textContent = ` ${message}`;
}

function getTileFocusScale(isInMatchZone) {
  // Read CSS values so slides use the right scale on desktop and small screens.
  const scaleProperty = isInMatchZone ? "--focus-tile-scale" : "--outer-tile-scale";
  return Number.parseFloat(window.getComputedStyle(playerGrid).getPropertyValue(scaleProperty));
}

// Slide a colored tile along a clear row or column and animate its move.
function slideTile(tileIndex, emptyIndex, startRect = null, startScale = null) {
  if (
    isPaused
    || gameOver
    || isTransitioning
    || isAnimatingMove
    || reservedDestinationIndex !== null
    || !canSlideTileTo(tileIndex, emptyIndex)
  ) {
    return false;
  }

  const movingTile = playerGrid.querySelector(`.tile[data-index="${tileIndex}"]`);
  const emptyTile = playerGrid.querySelector(`.tile[data-index="${emptyIndex}"]`);
  if (!movingTile || !emptyTile) {
    return false;
  }

  isAnimatingMove = true;
  reservedDestinationIndex = emptyIndex;
  const animationGeneration = slideGeneration;
  const startingRect = startRect || movingTile.getBoundingClientRect();
  const before = {
    left: startingRect.left + (startingRect.width / 2),
    top: startingRect.top + (startingRect.height / 2),
    scale: startScale ?? getTileFocusScale(movingTile.classList.contains("is-match-zone")),
    wasInMatchZone: movingTile.classList.contains("is-match-zone"),
  };

  [playerPattern[tileIndex], playerPattern[emptyIndex]] =
    [playerPattern[emptyIndex], playerPattern[tileIndex]];
  const marker = document.createComment("tile swap");
  playerGrid.replaceChild(marker, movingTile);
  playerGrid.replaceChild(movingTile, emptyTile);
  playerGrid.replaceChild(emptyTile, marker);
  const isMatchZoneTile = matchZoneIndices.includes(emptyIndex);
  movingTile.dataset.index = String(emptyIndex);
  movingTile.setAttribute(
    "aria-label",
    `${COLOR_MARKS[playerPattern[emptyIndex]].name} tile, position ${emptyIndex + 1}${isMatchZoneTile ? ", matching zone" : ""}`,
  );
  movingTile.classList.toggle("is-match-zone", isMatchZoneTile);
  emptyTile.dataset.index = String(tileIndex);
  emptyTile.setAttribute(
    "aria-label",
    `Empty space, position ${tileIndex + 1}${matchZoneIndices.includes(tileIndex) ? ", matching zone" : ""}`,
  );
  emptyTile.classList.toggle("is-match-zone", matchZoneIndices.includes(tileIndex));
  setTilesDisabled(true);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reservedDestinationIndex = null;
    isAnimatingMove = false;
    setTilesDisabled(false);
    return true;
  }

  const destinationRect = movingTile.getBoundingClientRect();
  const offsetX = before.left - (destinationRect.left + (destinationRect.width / 2));
  const offsetY = before.top - (destinationRect.top + (destinationRect.height / 2));
  const isInMatchZone = movingTile.classList.contains("is-match-zone");
  const afterScale = getTileFocusScale(isInMatchZone);
  if (
    offsetX === 0
    && offsetY === 0
    && Math.abs(before.scale - afterScale) < 0.001
  ) {
    reservedDestinationIndex = null;
    isAnimatingMove = false;
    setTilesDisabled(false);
    return true;
  }
  activeSlideAnimations.get(movingTile)?.cancel();
  window.clearTimeout(landingEffectTimeouts.get(movingTile));
  landingEffectTimeouts.delete(movingTile);
  movingTile.classList.remove("is-magnetic-land");
  movingTile.classList.add("is-sliding");
  const isEnteringMatchZone = !before.wasInMatchZone && isInMatchZone;
  const snapDistance = Math.hypot(offsetX, offsetY);
  const isMagneticSnap = startRect !== null
    && snapDistance <= Math.min(destinationRect.width, destinationRect.height) * 0.25;
  const animation = movingTile.animate([
    { transform: `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${before.scale})` },
    { transform: `translate3d(0, 0, 0) scale(${afterScale})` },
  ], {
    duration: isMagneticSnap
      ? GAME_CONFIG.puzzle.magneticSnapMs
      : GAME_CONFIG.puzzle.moveAnimationMs,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  });
  activeSlideAnimations.set(movingTile, animation);

  const clearSlideState = (landed = false) => {
    if (activeSlideAnimations.get(movingTile) === animation) {
      activeSlideAnimations.delete(movingTile);
      movingTile.classList.remove("is-sliding");
      if (animationGeneration !== slideGeneration) {
        return;
      }
      if (landed && isEnteringMatchZone) {
        movingTile.classList.add("is-magnetic-land");
        const timeoutId = window.setTimeout(() => {
          movingTile.classList.remove("is-magnetic-land");
          landingEffectTimeouts.delete(movingTile);
        }, 560);
        landingEffectTimeouts.set(movingTile, timeoutId);
      }
      reservedDestinationIndex = null;
      isAnimatingMove = false;
      setTilesDisabled(false);
    }
  };
  animation.addEventListener("finish", () => clearSlideState(true), { once: true });
  animation.addEventListener("cancel", () => clearSlideState(), { once: true });
  return true;
}

function showReward(isNewHighScore) {
  successParticles.replaceChildren();
  const particleColors = ["#ff5b66", "#4c9fff", "#42d6a0", "#ffd05a", "#b6adff"];

  particleColors.forEach((color, colorIndex) => {
    for (let particleIndex = 0; particleIndex < 4; particleIndex += 1) {
      const particle = document.createElement("span");
      const angle = ((colorIndex * 4 + particleIndex) / 20) * Math.PI * 2;
      const distance = 55 + ((colorIndex + particleIndex) % 3) * 22;
      particle.className = "success-particle";
      particle.style.setProperty("--particle-x", `${Math.cos(angle) * distance}px`);
      particle.style.setProperty("--particle-y", `${Math.sin(angle) * distance}px`);
      particle.style.setProperty("--particle-color", color);
      successParticles.append(particle);
    }
  });

  newHighScoreBanner.hidden = !isNewHighScore;
  successOverlay.hidden = false;
  successOverlay.classList.remove("is-visible");
  void successOverlay.offsetWidth;
  successOverlay.classList.add("is-visible");
  playerGrid.classList.add("is-success");
}

function animateScore(fromScore, toScore) {
  if (scoreAnimationFrame !== null) {
    window.cancelAnimationFrame(scoreAnimationFrame);
    scoreAnimationFrame = null;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scoreDisplay.textContent = String(toScore);
    return;
  }

  const startTime = performance.now();
  const duration = 520;
  const updateScore = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const easedProgress = 1 - (1 - progress) ** 3;
    scoreDisplay.textContent = String(Math.round(fromScore + (toScore - fromScore) * easedProgress));

    if (progress < 1) {
      scoreAnimationFrame = window.requestAnimationFrame(updateScore);
    } else {
      scoreAnimationFrame = null;
    }
  };

  scoreAnimationFrame = window.requestAnimationFrame(updateScore);
}

function finishPuzzleTransition() {
  transitionTimeout = null;

  if (gameOver || isPaused) {
    return;
  }

  isTransitioning = false;
  playerGrid.classList.remove("is-entering");
  targetGrid.classList.remove("is-entering");
  setTilesDisabled(false);
  gridHint.textContent = "Drag along a row or column toward an empty cell";
  setStatus("New pattern! Match the outlined center to build your score.");
}

function startNextPuzzle() {
  if (coloredTileCount >= boardTileCount) {
    showBoardUnlock();
    return;
  }

  successOverlay.hidden = true;
  successOverlay.classList.remove("is-visible");
  playerGrid.classList.remove("is-success");
  const nextPuzzle = makePuzzle(targetPattern);
  targetPattern = nextPuzzle.target;
  playerPattern = nextPuzzle.board;
  scrambleComplexity = nextPuzzle.complexity;
  puzzleMoves = 0;
  puzzleStartedAt = performance.now();
  puzzlePausedMs = 0;
  puzzleRewarded = false;
  roundNumberDisplay.textContent = String(puzzlesCompleted + 1).padStart(2, "0");
  updateBoardDimensions();
  isTransitioning = true;
  renderTarget();
  renderPlayerGrid();
  updateProgressDisplay();
  targetGrid.classList.add("is-entering");
  playerGrid.classList.add("is-entering");
  setTilesDisabled(true);
  transitionTimeout = window.setTimeout(
    finishPuzzleTransition,
    GAME_CONFIG.puzzle.transitionMs,
  );
}

function showBoardUnlock() {
  pendingBoardUnlock = true;
  const nextSize = boardSize + 1;
  const nextTargetSize = nextSize - (GAME_CONFIG.progression.targetBorder * 2);
  document.querySelector("#unlock-title").textContent = "BOARD FULL!";
  document.querySelector("#unlock-description").textContent =
    `The ${boardSize} × ${boardSize} board is full. Your next board is ${nextSize} × ${nextSize} with a ${nextTargetSize} × ${nextTargetSize} target and ${nextTargetSize * nextTargetSize} tiles.`;
  unlockOverlay.hidden = false;
  unlockContinueButton.focus();
}

function completePuzzle() {
  if (gameOver || puzzleRewarded) {
    return;
  }

  puzzleRewarded = true;
  const reward = calculatePuzzleReward();
  puzzlesCompleted += 1;
  const previousScore = score;
  score += reward.finalPoints;
  remainingSeconds = Math.min(
    GAME_CONFIG.timer.maximumSeconds,
    remainingSeconds + reward.timeReward,
  );
  const achievedNewHighScore = score > bestScore;
  const showNewHighScoreCue = achievedNewHighScore && !newHighScoreThisRun;
  if (achievedNewHighScore) {
    bestScore = score;
    bestScoreDisplay.textContent = String(bestScore);
    menuBestScoreDisplay.textContent = String(bestScore);
    saveBestScore();
  }
  if (showNewHighScoreCue) {
    newHighScoreThisRun = true;
  }
  animateScore(previousScore, score);
  puzzleCountDisplay.textContent = String(puzzlesCompleted);
  rewardBaseDisplay.textContent = String(reward.basePoints);
  rewardSpeedDisplay.textContent = `+${reward.speedBonus}`;
  rewardEfficiencyDisplay.textContent = `+${reward.efficiencyBonus}`;
  rewardFinalPointsDisplay.textContent = `+${reward.finalPoints} POINTS`;
  rewardTimeDisplay.textContent = `+${reward.timeReward} SECONDS`;
  updateTimerDisplay();
  showTimeReward(reward.timeReward);
  showReward(showNewHighScoreCue);
  setStatus(
    `Pattern matched! +${reward.finalPoints} points and +${reward.timeReward} seconds (${reward.performanceLabel.toLowerCase()}).`,
  );
  transitionTimeout = window.setTimeout(() => {
    transitionTimeout = null;
    if (!gameOver) {
      coloredTileCount = Math.min(
        boardTileCount,
        coloredTileCount + GAME_CONFIG.progression.tilesAddedPerPuzzle,
      );
      updateProgressDisplay();
      if (coloredTileCount === boardTileCount) {
        const emptyPositions = getEmptyIndices(playerPattern);
        emptyPositions.forEach((index) => {
          playerPattern[index] = COLORS[Math.floor(Math.random() * COLORS.length)];
        });
        renderPlayerGrid();
        renderTarget();
        setTilesDisabled(true);
        showBoardUnlock();
      } else {
        startNextPuzzle();
      }
    }
  }, GAME_CONFIG.puzzle.successMs);
}

function getDragDestinationCells(sourceIndex) {
  const sourceRow = Math.floor(sourceIndex / boardSize);
  const sourceColumn = sourceIndex % boardSize;
  const sourceTile = playerGrid.querySelector(`.tile[data-index="${sourceIndex}"]`);
  const sourceRect = sourceTile.getBoundingClientRect();
  const lanes = {
    horizontal: { "-1": [], "1": [] },
    vertical: { "-1": [], "1": [] },
  };
  const directions = [
    { axis: "horizontal", direction: -1, rowStep: 0, columnStep: -1 },
    { axis: "horizontal", direction: 1, rowStep: 0, columnStep: 1 },
    { axis: "vertical", direction: -1, rowStep: -1, columnStep: 0 },
    { axis: "vertical", direction: 1, rowStep: 1, columnStep: 0 },
  ];

  directions.forEach(({ axis, direction, rowStep, columnStep }) => {
    const lane = lanes[axis][direction];
    let row = sourceRow + rowStep;
    let column = sourceColumn + columnStep;
    while (row >= 0 && row < boardSize && column >= 0 && column < boardSize) {
      const index = (row * boardSize) + column;
      if (playerPattern[index] !== EMPTY_TILE) {
        break;
      }

      const destination = playerGrid.querySelector(`.tile[data-index="${index}"]`);
      if (!destination) {
        break;
      }
      const rect = destination.getBoundingClientRect();
      lane.push({
        index,
        centerX: rect.left + (rect.width / 2),
        centerY: rect.top + (rect.height / 2),
      });
      row += rowStep;
      column += columnStep;
    }
  });

  return {
    sourceCenterX: sourceRect.left + (sourceRect.width / 2),
    sourceCenterY: sourceRect.top + (sourceRect.height / 2),
    lanes,
  };
}

function getDragLaneIndices(destinationCells, axis = null, direction = null) {
  if (axis !== null) {
    return destinationCells.lanes[axis][direction].map(({ index }) => index);
  }

  return Object.values(destinationCells.lanes)
    .flatMap((directions) => Object.values(directions)
      .flatMap((cells) => cells.map(({ index }) => index)));
}

function getDragDestinationIndex(destinationCells, axis, direction, axisPosition, pointerOffset) {
  if (axis === null || direction === null) {
    return null;
  }

  const sourcePosition = axis === "horizontal"
    ? destinationCells.sourceCenterX
    : destinationCells.sourceCenterY;
  let destinationIndex = null;
  let nearestDistance = Math.abs(axisPosition - sourcePosition - pointerOffset);
  destinationCells.lanes[axis][direction].forEach((cell) => {
    const cellPosition = axis === "horizontal" ? cell.centerX : cell.centerY;
    const distance = Math.abs(axisPosition - cellPosition - pointerOffset);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      destinationIndex = cell.index;
    }
  });
  return destinationIndex;
}

function resetDraggedTile(tile) {
  tile.classList.remove("is-dragging", "is-returning");
  tile.style.removeProperty("--drag-x");
  tile.style.removeProperty("--drag-y");
  tile.style.removeProperty("--drag-scale");
  tile.style.removeProperty("--drag-rest-scale");
  tile.style.removeProperty("pointer-events");
  tile.style.removeProperty("transition");
}

function returnDraggedTile(drag) {
  isAnimatingMove = true;
  setTilesDisabled(true);
  const generation = slideGeneration;
  drag.tile.classList.remove("is-dragging");
  drag.tile.classList.add("is-returning");
  drag.tile.style.setProperty("--drag-x", "0px");
  drag.tile.style.setProperty("--drag-y", "0px");
  drag.tile.style.setProperty("--drag-scale", String(drag.restScale));

  const finishReturn = (event) => {
    if (event && (event.target !== drag.tile || event.propertyName !== "transform")) {
      return;
    }
    if (dragReturnTimeout !== null) {
      window.clearTimeout(dragReturnTimeout);
      dragReturnTimeout = null;
    }
    resetDraggedTile(drag.tile);
    if (generation !== slideGeneration) {
      return;
    }
    isAnimatingMove = false;
    setTilesDisabled(false);
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishReturn();
    return;
  }

  drag.tile.addEventListener("transitionend", finishReturn, { once: true });
  dragReturnTimeout = window.setTimeout(
    finishReturn,
    GAME_CONFIG.puzzle.invalidReturnMs + 80,
  );
}

function completePlayerMove(tileIndex, emptyIndex, startRect, startScale) {
  if (!slideTile(tileIndex, emptyIndex, startRect, startScale)) {
    setTilesDisabled(false);
    return false;
  }
  if (!timerStarted) {
    startTimer();
  }

  updateTargetMatches();
  playSound(420, 0.045);
  const patternMatched = checkPattern();
  totalMoves += 1;
  puzzleMoves += 1;
  moveCountDisplay.textContent = String(totalMoves);
  gridHint.textContent = "Drag along a row or column toward an empty cell";
  setStatus("Nice slide. Keep going!");

  if (patternMatched && !puzzleRewarded) {
    playSound(660, 0.16);
    isTransitioning = true;
    setTilesDisabled(true);
    completePuzzle();
  }
  return true;
}

function handlePointerDown(event) {
  if (
    !event.isPrimary
    || event.button !== 0
    || gameOver
    || isTransitioning
    || isPaused
    || isAnimatingMove
    || reservedDestinationIndex !== null
    || dragSession !== null
  ) {
    return;
  }

  const tile = event.target.closest(".tile");
  if (!tile || tile.disabled) {
    return;
  }
  const tileIndex = Number(tile.dataset.index);
  if (
    !Number.isInteger(tileIndex)
    || playerPattern[tileIndex] === EMPTY_TILE
    || !getAdjacentTileIndices(tileIndex).some((index) => playerPattern[index] === EMPTY_TILE)
  ) {
    return;
  }

  event.preventDefault();
  const restScale = getTileFocusScale(tile.classList.contains("is-match-zone"));
  const destinationCells = getDragDestinationCells(tileIndex);
  dragSession = {
    pointerId: event.pointerId,
    tile,
    tileIndex,
    startX: event.clientX,
    startY: event.clientY,
    restScale,
    dragScale: restScale,
    destinationCells,
    pointerOffsetX: event.clientX - destinationCells.sourceCenterX,
    pointerOffsetY: event.clientY - destinationCells.sourceCenterY,
    axis: null,
    direction: null,
    laneCells: [],
    destinationIndex: null,
  };
  tile.style.setProperty("--drag-x", "0px");
  tile.style.setProperty("--drag-y", "0px");
  tile.style.setProperty("--drag-scale", String(restScale));
  tile.style.setProperty("--drag-rest-scale", String(restScale));
  tile.classList.add("is-dragging");
  setDragTargetIndicators(null, getDragLaneIndices(destinationCells));
  setStatus("Drag horizontally or vertically toward an empty cell.");

  if (event.isTrusted && typeof tile.setPointerCapture === "function") {
    tile.setPointerCapture(event.pointerId);
  }
}

function updateDragPosition(drag, event) {
  const deltaX = event.clientX - drag.startX;
  const deltaY = event.clientY - drag.startY;
  let axisLockedNow = false;

  if (drag.axis === null) {
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < GAME_CONFIG.puzzle.dragAxisLockThresholdPx) {
      return;
    }

    drag.axis = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
    const axisDelta = drag.axis === "horizontal" ? deltaX : deltaY;
    drag.direction = Math.sign(axisDelta);
    drag.laneCells = drag.destinationCells.lanes[drag.axis][drag.direction];
    axisLockedNow = true;
  }

  const axisDelta = drag.axis === "horizontal" ? deltaX : deltaY;
  const sourcePosition = drag.axis === "horizontal"
    ? drag.destinationCells.sourceCenterX
    : drag.destinationCells.sourceCenterY;
  const maxDistance = drag.laneCells.length > 0
    ? Math.abs((drag.axis === "horizontal"
      ? drag.laneCells[drag.laneCells.length - 1].centerX
      : drag.laneCells[drag.laneCells.length - 1].centerY) - sourcePosition)
    : 0;
  const travel = Math.min(Math.max(0, axisDelta * drag.direction), maxDistance);
  const constrainedOffset = drag.direction * travel;
  drag.tile.style.setProperty(
    "--drag-x",
    `${drag.axis === "horizontal" ? constrainedOffset : 0}px`,
  );
  drag.tile.style.setProperty(
    "--drag-y",
    `${drag.axis === "vertical" ? constrainedOffset : 0}px`,
  );

  const axisPosition = drag.axis === "horizontal" ? event.clientX : event.clientY;
  const pointerOffset = drag.axis === "horizontal" ? drag.pointerOffsetX : drag.pointerOffsetY;
  const destinationIndex = getDragDestinationIndex(
    drag.destinationCells,
    drag.axis,
    drag.direction,
    axisPosition,
    pointerOffset,
  );
  if (axisLockedNow || destinationIndex !== drag.destinationIndex) {
    drag.destinationIndex = destinationIndex;
    setDragTargetIndicators(
      destinationIndex,
      getDragLaneIndices(drag.destinationCells, drag.axis, drag.direction),
    );
    setStatus(
      drag.laneCells.length === 0
        ? "An occupied tile blocks that direction."
        : destinationIndex === null
          ? "Slide farther along the lane to reach an empty cell."
          : "Release to snap into the highlighted empty cell.",
    );
  }
}

function handlePointerMove(event) {
  const drag = dragSession;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  updateDragPosition(drag, event);
}

function prepareDraggedTileForGlide(tile) {
  tile.classList.remove("is-dragging", "is-returning");
  tile.style.setProperty("transition", "none");
  tile.style.removeProperty("--drag-x");
  tile.style.removeProperty("--drag-y");
  tile.style.removeProperty("--drag-scale");
  tile.style.removeProperty("--drag-rest-scale");
  tile.style.removeProperty("pointer-events");
  void tile.offsetWidth;
  tile.style.removeProperty("transition");
}

function finishPointerDrag(event, cancelled = false) {
  const drag = dragSession;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  if (event.cancelable) {
    event.preventDefault();
  }
  if (!cancelled) {
    updateDragPosition(drag, event);
  }
  dragSession = null;
  clearDragTargetIndicators();
  const axisPosition = drag.axis === "horizontal" ? event.clientX : event.clientY;
  const pointerOffset = drag.axis === "horizontal" ? drag.pointerOffsetX : drag.pointerOffsetY;
  const destinationIndex = cancelled
    ? null
    : getDragDestinationIndex(
      drag.destinationCells,
      drag.axis,
      drag.direction,
      axisPosition,
      pointerOffset,
    );

  if (
    destinationIndex !== null
    && !gameOver
    && !isTransitioning
    && !isPaused
    && canSlideTileTo(drag.tileIndex, destinationIndex)
  ) {
    const draggedRect = drag.tile.getBoundingClientRect();
    prepareDraggedTileForGlide(drag.tile);
    if (!completePlayerMove(drag.tileIndex, destinationIndex, draggedRect, drag.restScale)) {
      setStatus("That move is no longer available.");
    }
    return;
  }

  returnDraggedTile(drag);
  setStatus(cancelled ? "Move cancelled. Tile returned." : "Invalid destination. Tile returned.");
}

function handleKeyboardMove(event) {
  const directions = {
    ArrowUp: -boardSize,
    ArrowDown: boardSize,
    ArrowLeft: -1,
    ArrowRight: 1,
  };
  const offset = directions[event.key];
  if (offset === undefined) {
    return;
  }

  const tile = event.target.closest(".tile");
  if (
    !tile
    || tile.disabled
    || isAnimatingMove
    || reservedDestinationIndex !== null
    || dragSession !== null
    || isPaused
    || gameOver
    || isTransitioning
  ) {
    return;
  }
  const tileIndex = Number(tile.dataset.index);
  const destinationIndex = tileIndex + offset;
  if (!areAdjacentTileIndices(tileIndex, destinationIndex)) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  if (playerPattern[destinationIndex] !== EMPTY_TILE) {
    return;
  }
  completePlayerMove(
    tileIndex,
    destinationIndex,
    tile.getBoundingClientRect(),
    getTileFocusScale(tile.classList.contains("is-match-zone")),
  );
}

function endGame() {
  gameOver = true;
  isPaused = false;
  isTransitioning = false;
  stopTimer();
  successOverlay.hidden = true;
  successOverlay.classList.remove("is-visible");
  playerGrid.classList.remove("is-success");

  if (scoreAnimationFrame !== null) {
    window.cancelAnimationFrame(scoreAnimationFrame);
    scoreAnimationFrame = null;
    scoreDisplay.textContent = String(score);
  }

  if (transitionTimeout !== null) {
    window.clearTimeout(transitionTimeout);
    transitionTimeout = null;
  }

  playerGrid.classList.remove("is-entering");
  targetGrid.classList.remove("is-entering");
  setTilesDisabled(true);
  gridHint.textContent = "The run is over";
  setStatus("Time's up. Play again for another run!");
  finalScoreDisplay.textContent = String(score);
  finalBestScoreDisplay.textContent = String(bestScore);
  finalPuzzlesDisplay.textContent = String(puzzlesCompleted);
  finalMovesDisplay.textContent = String(totalMoves);
  personalBestBanner.hidden = !newHighScoreThisRun;
  gameOverPanel.hidden = false;
  playAgainButton.focus();
}

function startGame() {
  stopTimer();
  if (scoreAnimationFrame !== null) {
    window.cancelAnimationFrame(scoreAnimationFrame);
    scoreAnimationFrame = null;
  }
  if (transitionTimeout !== null) {
    window.clearTimeout(transitionTimeout);
    transitionTimeout = null;
  }

  totalMoves = 0;
  score = 0;
  puzzlesCompleted = 0;
  boardSize = GAME_CONFIG.progression.initialBoardSize;
  updateBoardDimensions();
  coloredTileCount = targetSize * targetSize;
  pendingBoardUnlock = false;
  newHighScoreThisRun = false;
  remainingSeconds = getStartingSeconds();
  timerStarted = false;
  puzzleStartedAt = 0;
  puzzlePausedMs = 0;
  pauseStartedAt = 0;
  puzzleMoves = 0;
  isTransitioning = false;
  gameOver = false;
  isPaused = false;
  puzzleRewarded = false;
  const firstPuzzle = makePuzzle();
  targetPattern = firstPuzzle.target;
  playerPattern = firstPuzzle.board;
  scrambleComplexity = firstPuzzle.complexity;

  moveCountDisplay.textContent = "0";
  scoreDisplay.textContent = "0";
  bestScoreDisplay.textContent = String(bestScore);
  puzzleCountDisplay.textContent = "0";
  roundNumberDisplay.textContent = "01";
  updateTimerDisplay();
  gameOverPanel.hidden = true;
  pauseOverlay.hidden = true;
  unlockOverlay.hidden = true;
  personalBestBanner.hidden = true;
  successOverlay.hidden = true;
  successOverlay.classList.remove("is-visible");
  newHighScoreBanner.hidden = true;
  playerGrid.classList.remove("is-success");
  gridHint.textContent = "Drag along a row or column toward an empty cell";
  setStatus(`Ready when you are. Your ${remainingSeconds} seconds start on your first move.`);
  updateProgressDisplay();
  renderTarget();
  renderPlayerGrid();
  setTilesDisabled(false);
  setScreen(gameScreen);
  pauseButton.focus();
}

playerGrid.addEventListener("pointerdown", handlePointerDown);
playerGrid.addEventListener("pointermove", handlePointerMove);
playerGrid.addEventListener("pointerup", finishPointerDrag);
playerGrid.addEventListener("pointercancel", (event) => finishPointerDrag(event, true));
playerGrid.addEventListener("lostpointercapture", (event) => finishPointerDrag(event, true));
playerGrid.addEventListener("keydown", handleKeyboardMove);
playAgainButton.addEventListener("click", startGame);
document.querySelector("#start-button").addEventListener("click", startGame);
document.querySelector("#how-to-button").addEventListener("click", () => setScreen(howToScreen));
document.querySelector("#settings-button").addEventListener("click", () => openSettings("start-screen"));
document.querySelector("#how-to-screen .back-button").addEventListener("click", () => setScreen(startScreen));
document.querySelector("#settings-screen .back-button").addEventListener("click", () => {
  setScreen(settingsReturnScreen === "game-screen" ? gameScreen : startScreen);
});
pauseButton.addEventListener("click", pauseGame);
resumeButton.addEventListener("click", resumeGame);
document.querySelector("#pause-settings-button").addEventListener("click", () => openSettings("game-screen"));
gameSettingsButton.addEventListener("click", () => {
  pauseGame();
  openSettings("game-screen");
});
document.querySelector("#quit-button").addEventListener("click", returnToMenu);
document.querySelector("#game-over-menu-button").addEventListener("click", returnToMenu);
document.querySelector(".brand").addEventListener("click", (event) => {
  event.preventDefault();
  if (!gameScreen.hidden && !gameOver) {
    pauseGame();
    return;
  }
  returnToMenu();
});
unlockContinueButton.addEventListener("click", () => {
  if (!pendingBoardUnlock) {
    return;
  }
  boardSize += 1;
  updateBoardDimensions();
  coloredTileCount = targetSize * targetSize;
  pendingBoardUnlock = false;
  document.querySelector("#unlock-title").textContent = "BIGGER GRID!";
  unlockOverlay.hidden = true;
  updateProgressDisplay();
  startNextPuzzle();
});

soundToggleButton.addEventListener("click", () => {
  applySoundPreference(!soundEnabled);
  saveSoundPreference(soundEnabled);
  if (soundEnabled) {
    playSound(520, 0.08);
  }
});

soundToggleSetting.addEventListener("change", () => {
  applySoundPreference(soundToggleSetting.checked);
  saveSoundPreference(soundEnabled);
  if (soundEnabled) {
    playSound(520, 0.08);
  }
});

colorblindToggle.addEventListener("change", () => {
  colorblindMode = colorblindToggle.checked;
  applyColorblindMode(colorblindMode);
  saveColorblindPreference(colorblindMode);
  setStatus(`Colorblind mode ${colorblindMode ? "on" : "off"}.`);
});

colorblindMode = loadColorblindPreference();
updateTileLabels();
applySoundPreference(loadSoundPreference());
bestScoreDisplay.textContent = String(bestScore);
menuBestScoreDisplay.textContent = String(bestScore);
updateBoardDimensions();
updateProgressDisplay();
setScreen(startScreen);
