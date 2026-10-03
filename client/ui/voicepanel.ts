// Вкладка «Голос» в меню — ЗАГЛУШКА до слияния с веткой rework/voice: там настоящая панель (переключатели, выбор
// устройства, проверка микрофона, список людей) с той же сигнатурой. Меню (client/ui/menu/menu.ts) вызывает
// mountVoicePanel(корень вкладки), когда вкладку открыли, и функцию, которую она вернула, — когда с неё ушли.
// Пока во вкладку переезжают нынешние настройки голоса (<details> из client/ui/voice.ts), а уходя — возвращаются
// на место. Голос включается после ответа сервера: если вкладку открыли раньше, ждём, пока настройки появятся.

export function mountVoicePanel(root: HTMLElement): () => void {
  const empty = document.createElement('p');
  empty.className = 'vp-empty';
  empty.textContent = 'Голосовой чат сейчас недоступен: его включает сервер, настройки появятся здесь после подключения.';
  root.append(empty);
  let moved: { el: HTMLDetailsElement; home: Node | null; next: Node | null; open: boolean } | null = null;
  const grab = (): boolean => {
    const el = document.querySelector<HTMLDetailsElement>('details.voice-settings');
    if (!el) return false;
    moved = { el, home: el.parentNode, next: el.nextSibling, open: el.open };
    el.open = true;
    root.append(el);
    return true;
  };
  let watch: MutationObserver | null = null;
  if (!grab()) {
    watch = new MutationObserver(() => {
      if (grab()) {
        watch?.disconnect();
        watch = null;
      }
    });
    watch.observe(document.body, { childList: true, subtree: true });
  }
  return () => {
    watch?.disconnect();
    watch = null;
    empty.remove();
    const m = moved;
    moved = null;
    // настройки голоса могли убрать совсем (VoiceUi.dispose) — тогда назад не возвращаем
    if (!m || !m.el.isConnected) return;
    m.el.open = m.open;
    if (m.home) m.home.insertBefore(m.el, m.next && m.next.parentNode === m.home ? m.next : null);
    else m.el.remove();
  };
}
