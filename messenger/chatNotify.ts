/** Short notification chime for incoming chat messages. */
export function playChatSound(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.22);
    setTimeout(() => { void ctx.close(); }, 300);
  } catch {
    /* audio blocked or unavailable */
  }
}

export const CHAT_EMOJIS = [
  '😀', '😂', '😍', '🥰', '😊', '😢', '😮', '🤔', '😎', '🙏',
  '👍', '👏', '🙌', '💪', '👋', '❤️', '🔥', '🎉', '✅', '💯',
  '⭐', '✨', '🎊', '😅', '🤝', '💡', '📎', '☕', '🚀', '👀',
];
