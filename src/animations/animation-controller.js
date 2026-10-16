import { animate } from 'animejs';

export class AnimationController {
  constructor({ onStep = () => {}, onFinish = () => {}, reducedMotion = false } = {}) {
    this.onStep = onStep;
    this.onFinish = onFinish;
    this.reducedMotion = reducedMotion;
    this.steps = [];
    this.index = 0;
    this.speed = 1;
    this.stepMode = false;
    this.timer = null;
    this.deadline = 0;
    this.remaining = 0;
    this.waiting = false;
    this.animation = null;
    this.activeStep = null;
    this.generation = 0;
    this.playing = false;
  }

  setSteps(steps) {
    this.cancel();
    this.steps = steps;
    this.index = 0;
  }

  setSpeed(speed) { this.speed = speed; }
  setReducedMotion(value) { this.reducedMotion = value; }
  setStepMode(value) { this.stepMode = value; }
  get isPlaying() { return this.playing; }

  play() {
    if (this.playing) return;
    if (this.index >= this.steps.length) { this.restart(); return; }
    this.playing = true;
    this.advance(this.generation);
  }

  pause() {
    this.playing = false;
    if (this.waiting) this.remaining = Math.max(0, this.deadline - Date.now());
    clearTimeout(this.timer);
    this.animation?.pause();
  }

  resume() {
    if (this.playing) return;
    if (this.index >= this.steps.length) { this.restart(); return; }
    this.playing = true;
    this.animation?.play();
    if (this.waiting) this.schedule(this.remaining, this.generation);
    else this.advance(this.generation);
  }

  next() {
    this.pause();
    if (this.index >= this.steps.length) return;
    if (this.waiting && this.activeStep?.element) {
      this.animation?.cancel?.();
      this.activeStep.element.style.opacity = '1';
      this.activeStep.element.style.transform = 'translateY(0)';
      this.waiting = false;
    }
    this.activeStep = this.steps[this.index];
    this.applyStep(this.steps[this.index], this.index, true);
    this.index++;
    if (this.index === this.steps.length) this.onFinish();
  }

  previous() {
    this.pause();
    this.animation?.cancel?.();
    this.waiting = false;
    this.index = Math.max(0, this.index - 1);
    this.steps[this.index]?.reset?.();
    this.onStep(this.steps[this.index], this.index, 'back');
  }

  restart() {
    this.pause();
    this.animation?.cancel?.();
    this.generation++;
    this.steps.forEach((step) => step.reset?.());
    this.index = 0;
    this.playing = true;
    this.waiting = false;
    this.activeStep = null;
    this.animation = null;
    this.advance(this.generation);
  }

  cancel() {
    this.pause();
    this.generation++;
    this.animation?.cancel?.();
    this.animation = null;
    this.waiting = false;
    this.activeStep = null;
    this.steps.forEach((step) => step.reset?.());
  }

  advance(generation) {
    if (!this.playing || generation !== this.generation) return;
    if (this.index >= this.steps.length) {
      this.playing = false;
      this.onFinish();
      return;
    }
    const step = this.steps[this.index];
    const index = this.index++;
    this.activeStep = step;
    this.applyStep(step, index, false);
    if (this.stepMode) {
      this.playing = false;
      if (this.index >= this.steps.length) this.onFinish();
      return;
    }
    const duration = this.reducedMotion ? 0 : 420 / this.speed;
    if (step?.element && !this.reducedMotion) {
      this.animation = animate(step.element, {
        opacity: [0, 1],
        translateY: [7, 0],
        duration,
        ease: 'outCubic'
      });
    }
    this.schedule(this.reducedMotion ? 15 : duration, generation);
  }

  schedule(duration, generation) {
    this.waiting = true;
    this.remaining = duration;
    this.deadline = Date.now() + duration;
    this.timer = setTimeout(() => {
      this.waiting = false;
      this.remaining = 0;
      this.advance(generation);
    }, duration);
  }

  applyStep(step, index, immediate) {
    if (!step) return;
    step.reveal?.();
    if (immediate && step.element) {
      step.element.style.opacity = '1';
      step.element.style.transform = 'translateY(0)';
    }
    this.onStep(step, index, 'forward');
  }
}
