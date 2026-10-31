// «Веранда v3» — «Ракушка»: перестройка снятой разметки, если концепцию не сделать одним CSS (в игре — правка компонентов).
// Цепочка хуков v3: v/veranda3.js → v/veranda3-msg.js → v/veranda3-fight.js → v/veranda3-water.js → v/veranda3-plaza.js → v/veranda3-quiz.js.
(() => {
  const prev = window.__HUDV?.veranda3;
  (window.__HUDV ||= {}).veranda3 = (scene) => {
    prev?.(scene);
  };
})();
