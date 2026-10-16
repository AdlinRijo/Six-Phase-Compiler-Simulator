import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationController } from '../src/animations/animation-controller.js';

afterEach(() => vi.useRealTimers());

describe('animation controller', () => {
  it('pauses the current schedule and resumes after the remaining delay', () => {
    vi.useFakeTimers();
    const onStep = vi.fn();
    const controller = new AnimationController({ onStep, reducedMotion: true });
    controller.setSteps([{ phase: 'lex' }, { phase: 'parse' }]);
    controller.play();
    expect(onStep).toHaveBeenCalledTimes(1);
    controller.pause();
    vi.advanceTimersByTime(100);
    expect(onStep).toHaveBeenCalledTimes(1);
    controller.resume();
    vi.advanceTimersByTime(15);
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep.mock.calls[1][0].phase).toBe('parse');
  });

  it('advances manually in step mode, resets on restart, and completes after the last step', () => {
    const onFinish = vi.fn();
    const resets = [vi.fn(), vi.fn()];
    const controller = new AnimationController({ onFinish, reducedMotion: true });
    controller.setStepMode(true);
    controller.setSteps([
      { phase: 'lex', reset: resets[0] },
      { phase: 'parse', reset: resets[1] }
    ]);
    controller.play();
    expect(controller.isPlaying).toBe(false);
    expect(onFinish).not.toHaveBeenCalled();
    controller.resume();
    expect(onFinish).toHaveBeenCalledTimes(1);
    controller.restart();
    expect(resets[0]).toHaveBeenCalledTimes(1);
    expect(resets[1]).toHaveBeenCalledTimes(1);
  });
});
