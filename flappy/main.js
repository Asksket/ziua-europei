(() => {
  'use strict';

  // Configuration constants
  const TARGET_WIDTH = 480;
  const TARGET_HEIGHT = 720;
  const BASE_GRAVITY_PX_PER_S2 = 2000;
  const FLAP_IMPULSE_PX_PER_S = -520;
  const PIPE_SPEED_PX_PER_S = 180;
  const PIPE_GAP_MIN = 140;
  const PIPE_GAP_MAX = 190;
  const PIPE_SPAWN_INTERVAL_S = 1.25;
  const PIPE_WIDTH = 78;
  const BIRD_RADIUS = 16;
  const GROUND_HEIGHT = 80;

  // Utilities
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const randomBetween = (min, max) => Math.random() * (max - min) + min;

  // Input manager
  class InputController {
    constructor() {
      this.isFlapRequested = false;
      this.keysDown = new Set();
      this._bindEvents();
    }

    _bindEvents() {
      window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if ([' ', 'arrowup', 'w'].includes(key)) {
          e.preventDefault();
          this.isFlapRequested = true;
        }
      });
      window.addEventListener('mousedown', () => {
        this.isFlapRequested = true;
      });
      window.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.isFlapRequested = true;
      }, { passive: false });
    }

    consumeFlap() {
      const flap = this.isFlapRequested;
      this.isFlapRequested = false;
      return flap;
    }
  }

  // Bird entity
  class Bird {
    constructor(x, y, radius) {
      this.initialX = x;
      this.initialY = y;
      this.radius = radius;
      this.yVelocity = 0;
      this.reset();
    }

    reset() {
      this.x = this.initialX;
      this.y = this.initialY;
      this.yVelocity = 0;
      this.rotation = 0;
    }

    flap() {
      this.yVelocity = FLAP_IMPULSE_PX_PER_S;
    }

    update(deltaTimeSeconds, gravity) {
      this.yVelocity += gravity * deltaTimeSeconds;
      this.y += this.yVelocity * deltaTimeSeconds;

      // Tilt based on vertical velocity
      this.rotation = clamp(this.yVelocity / 600, -0.35, 0.6);
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);

      // Body
      const r = this.radius;
      const bodyGradient = ctx.createLinearGradient(-r, -r, r, r);
      bodyGradient.addColorStop(0, '#ffd86b');
      bodyGradient.addColorStop(1, '#ffb347');
      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      // Eye
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(r * 0.3, -r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(r * 0.45, -r * 0.3, r * 0.18, 0, Math.PI * 2);
      ctx.fill();

      // Beak
      ctx.fillStyle = '#ff8c00';
      ctx.beginPath();
      ctx.moveTo(r * 0.9, 0);
      ctx.lineTo(r * 1.5, -r * 0.2);
      ctx.lineTo(r * 0.9, r * 0.2);
      ctx.closePath();
      ctx.fill();

      // Wing
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, r * 0.2, r * 0.6, r * 0.35, -0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // Pipes
  class PipePair {
    constructor(x, gapCenterY, gapSize, width, speed, canvasHeight) {
      this.x = x;
      this.gapCenterY = gapCenterY;
      this.gapSize = gapSize;
      this.width = width;
      this.speed = speed;
      this.canvasHeight = canvasHeight;
      this.scored = false;
    }

    update(deltaTimeSeconds) {
      this.x -= this.speed * deltaTimeSeconds;
    }

    draw(ctx) {
      const topPipeBottom = this.gapCenterY - this.gapSize / 2;
      const bottomPipeTop = this.gapCenterY + this.gapSize / 2;

      ctx.fillStyle = '#2ecc71';
      ctx.strokeStyle = '#27ae60';
      ctx.lineWidth = 4;

      // Top pipe
      ctx.beginPath();
      ctx.rect(this.x, 0, this.width, topPipeBottom);
      ctx.fill();
      ctx.stroke();

      // Bottom pipe
      ctx.beginPath();
      ctx.rect(this.x, bottomPipeTop, this.width, this.canvasHeight - bottomPipeTop);
      ctx.fill();
      ctx.stroke();

      // Lips
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(this.x - 6, topPipeBottom - 20, this.width + 12, 20);
      ctx.fillRect(this.x - 6, bottomPipeTop, this.width + 12, 20);
    }

    isOffscreen() {
      return this.x + this.width < 0;
    }

    checkCollision(bird) {
      const topPipeBottom = this.gapCenterY - this.gapSize / 2;
      const bottomPipeTop = this.gapCenterY + this.gapSize / 2;

      const closestX = clamp(bird.x, this.x, this.x + this.width);
      const closestYTop = clamp(bird.y, 0, topPipeBottom);
      const closestYBottom = clamp(bird.y, bottomPipeTop, this.canvasHeight);

      // If bird within gap horizontally, only collide with pipes outside the gap vertically
      const collidesTop = bird.y - bird.radius < topPipeBottom && bird.x + bird.radius > this.x && bird.x - bird.radius < this.x + this.width;
      const collidesBottom = bird.y + bird.radius > bottomPipeTop && bird.x + bird.radius > this.x && bird.x - bird.radius < this.x + this.width;

      return collidesTop || collidesBottom;
    }
  }

  // Game manager
  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

      this.state = 'ready'; // 'ready' | 'playing' | 'gameover'
      this.score = 0;
      this.bestScore = Number(localStorage.getItem('flap_best_score') || 0);

      this.input = new InputController();

      this.bird = new Bird(TARGET_WIDTH * 0.32, TARGET_HEIGHT * 0.45, BIRD_RADIUS);
      this.pipes = [];
      this.timeSinceLastPipe = 0;

      this.lastTimestamp = 0;
      this.gravity = BASE_GRAVITY_PX_PER_S2;

      this._bindEvents();
      this._resizeCanvas();
      requestAnimationFrame(this._tick);
    }

    _bindEvents() {
      window.addEventListener('resize', () => this._resizeCanvas());

      window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'r' && this.state === 'gameover') {
          this.reset();
        }
      });
    }

    _resizeCanvas() {
      const { canvas, ctx } = this;
      const ratio = this.pixelRatio;

      // Keep aspect ratio while fitting width
      const containerWidth = Math.min(window.innerWidth - 32, 640);
      const width = Math.max(320, containerWidth);
      const height = Math.round((TARGET_HEIGHT / TARGET_WIDTH) * width);

      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      this.viewportWidth = width;
      this.viewportHeight = height;
    }

    reset() {
      this.state = 'ready';
      this.score = 0;
      this.pipes = [];
      this.timeSinceLastPipe = 0;
      this.bird.reset();
    }

    _spawnPipe() {
      const gap = randomBetween(PIPE_GAP_MIN, PIPE_GAP_MAX);
      const margin = 40;
      const centerY = randomBetween(margin + gap / 2, this.viewportHeight - GROUND_HEIGHT - margin - gap / 2);
      const pipe = new PipePair(this.viewportWidth + 10, centerY, gap, PIPE_WIDTH, PIPE_SPEED_PX_PER_S, this.viewportHeight - GROUND_HEIGHT);
      this.pipes.push(pipe);
    }

    _update(deltaTimeSeconds) {
      const dt = clamp(deltaTimeSeconds, 0, 0.033);

      if (this.state === 'ready') {
        if (this.input.consumeFlap()) {
          this.state = 'playing';
          this.bird.flap();
        }
        // Idle float
        this.bird.y += Math.sin(performance.now() / 350) * 0.8;
        return;
      }

      if (this.state === 'playing') {
        if (this.input.consumeFlap()) {
          this.bird.flap();
        }
        this.timeSinceLastPipe += dt;
        if (this.timeSinceLastPipe >= PIPE_SPAWN_INTERVAL_S) {
          this.timeSinceLastPipe = 0;
          this._spawnPipe();
        }
        this.bird.update(dt, this.gravity);
        this.pipes.forEach(p => p.update(dt));
        this.pipes = this.pipes.filter(p => !p.isOffscreen());

        // Score when passing center of a pipe pair
        for (const pipe of this.pipes) {
          if (!pipe.scored && this.bird.x > pipe.x + pipe.width) {
            pipe.scored = true;
            this.score += 1;
            if (this.score > this.bestScore) {
              this.bestScore = this.score;
              localStorage.setItem('flap_best_score', String(this.bestScore));
            }
          }
        }

        // Collisions with pipes
        for (const pipe of this.pipes) {
          if (pipe.checkCollision(this.bird)) {
            this._gameOver();
            break;
          }
        }

        // Collisions with bounds
        if (this.bird.y - this.bird.radius < 0) {
          this._gameOver();
        }
        const groundY = this.viewportHeight - GROUND_HEIGHT;
        if (this.bird.y + this.bird.radius > groundY) {
          this._gameOver();
        }
      }
    }

    _draw() {
      const { ctx } = this;
      ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);

      // Sky gradient (background handled by CSS but draw subtle clouds)
      this._drawClouds();

      // Pipes
      for (const pipe of this.pipes) {
        pipe.draw(ctx);
      }

      // Ground
      this._drawGround();

      // Bird on top of ground for visual priority
      this.bird.draw(ctx);

      // UI
      this._drawUI();
    }

    _drawClouds() {
      const { ctx } = this;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffffff';
      const t = performance.now() / 2000;
      const baseY = this.viewportHeight * 0.18;
      for (let i = 0; i < 5; i++) {
        const x = ((i * 220 - (t * 60) % (this.viewportWidth + 300)) - 150);
        const y = baseY + Math.sin((t + i) * 1.1) * 10;
        this._drawCloud(x, y, 50, 24);
      }
      ctx.restore();
    }

    _drawCloud(x, y, w, h) {
      const { ctx } = this;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.6, y - h * 0.3, w * 0.8, h * 0.9, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 1.2, y, w * 0.7, h * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    _drawGround() {
      const { ctx } = this;
      const groundTop = this.viewportHeight - GROUND_HEIGHT;
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(0, groundTop, this.viewportWidth, GROUND_HEIGHT);
      // Grass
      ctx.fillStyle = '#3cb44b';
      ctx.fillRect(0, groundTop, this.viewportWidth, 14);
      // Dirt stripes
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (let x = 0; x < this.viewportWidth; x += 28) {
        ctx.fillRect(x, groundTop + 22, 18, 6);
      }
    }

    _drawUI() {
      const { ctx } = this;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f2b46';

      if (this.state === 'ready') {
        ctx.font = 'bold 40px Nunito, sans-serif';
        ctx.fillText('Tap to start', this.viewportWidth / 2, this.viewportHeight * 0.28);
        ctx.font = 'bold 20px Nunito, sans-serif';
        ctx.fillText('Press Space / Click / Tap to flap', this.viewportWidth / 2, this.viewportHeight * 0.34);
        ctx.fillText('Avoid the pipes!', this.viewportWidth / 2, this.viewportHeight * 0.39);
      }

      if (this.state === 'playing') {
        ctx.font = '900 48px Nunito, sans-serif';
        ctx.fillText(String(this.score), this.viewportWidth / 2, 70);
      }

      if (this.state === 'gameover') {
        ctx.font = '900 42px Nunito, sans-serif';
        ctx.fillText('Game Over', this.viewportWidth / 2, this.viewportHeight * 0.32);
        ctx.font = '900 28px Nunito, sans-serif';
        ctx.fillText(`Score: ${this.score}`, this.viewportWidth / 2, this.viewportHeight * 0.40);
        ctx.fillText(`Best: ${this.bestScore}`, this.viewportWidth / 2, this.viewportHeight * 0.46);
        ctx.font = 'bold 18px Nunito, sans-serif';
        ctx.fillText('Press R to restart', this.viewportWidth / 2, this.viewportHeight * 0.54);
      }

      ctx.restore();
    }

    _gameOver() {
      if (this.state !== 'gameover') {
        this.state = 'gameover';
      }
    }

    _tick = (timestampMs) => {
      const dt = (timestampMs - this.lastTimestamp) / 1000 || 0;
      this.lastTimestamp = timestampMs;

      this._update(dt);
      this._draw();
      requestAnimationFrame(this._tick);
    }
  }

  // Bootstrap game
  function start() {
    const canvas = document.getElementById('game');
    // Ensure canvas exists in DOM
    if (!canvas) return;
    const game = new Game(canvas);
    window.__flapGame = game; // expose for debugging
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

