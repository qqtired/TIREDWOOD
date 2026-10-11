// Картинки снастей и наград — одни для лавки Семёна, журнала, примерочной и карточки следующей награды.
// Источники imagegen и промпты — client/assets/fishgear/PROVENANCE.md; готовые общие иконки — assets/ui/icons/.
// Литеральные URL Vite превращает в файлы сборки с хешем (CSP img-src 'self').
const pic = (url: URL): string => `<img src="${url.href}" alt="" draggable="false">`;

export const FISH_ICONS: Readonly<Record<string, string>> = {
  // Одежда и питомцы коллекции.
  'h:angler': pic(new URL('../assets/ui/icons/wd-h-fisher.webp', import.meta.url)),
  'a:angler': pic(new URL('../assets/fishgear/reward-angler-vest.webp', import.meta.url)),
  'e:angler': pic(new URL('../assets/ui/icons/wd-e-angler.webp', import.meta.url)),
  'h:sou': pic(new URL('../assets/fishgear/reward-sou-hat.webp', import.meta.url)),
  'a:oilskin': pic(new URL('../assets/fishgear/reward-oilskin.webp', import.meta.url)),
  'h:captain': pic(new URL('../assets/fishgear/reward-captain-hat.webp', import.meta.url)),
  'a:tunic': pic(new URL('../assets/fishgear/reward-captain-tunic.webp', import.meta.url)),
  'a:kukan': pic(new URL('../assets/fishgear/reward-kukan.webp', import.meta.url)),
  'a:net': pic(new URL('../assets/fishgear/reward-net.webp', import.meta.url)),
  's:gull': pic(new URL('../assets/fishgear/reward-gull.webp', import.meta.url)),
  's:parrot': pic(new URL('../assets/fishgear/reward-parrot.webp', import.meta.url)),
  // Удочки: обычная в заданиях Семёна и косметическая обычная используют одну картинку.
  'r:basic': pic(new URL('../assets/fishgear/rod-basic.webp', import.meta.url)),
  'r:hazel': pic(new URL('../assets/fishgear/rod-hazel.webp', import.meta.url)),
  'r:carved': pic(new URL('../assets/fishgear/rod-carved.webp', import.meta.url)),
  'r:gold': pic(new URL('../assets/fishgear/rod-gold.webp', import.meta.url)),
  // Поплавки.
  'b:classic': pic(new URL('../assets/ui/icons/float.webp', import.meta.url)),
  'b:quill': pic(new URL('../assets/fishgear/bobber-quill.webp', import.meta.url)),
  'b:duck': pic(new URL('../assets/fishgear/bobber-duck.webp', import.meta.url)),
  'b:firefly': pic(new URL('../assets/fishgear/bobber-firefly.webp', import.meta.url)),
  'b:goldfish': pic(new URL('../assets/fishgear/bobber-goldfish.webp', import.meta.url)),
  // Темы шкалы: карточки вещей — картинки, живые миниатюры выбора — по прежним CSS-темам fishstyle.css.
  'w:wood': pic(new URL('../assets/fishgear/frame-wood.webp', import.meta.url)),
  'w:chart': pic(new URL('../assets/fishgear/frame-chart.webp', import.meta.url)),
  'w:night': pic(new URL('../assets/fishgear/frame-night.webp', import.meta.url)),
  'w:gold': pic(new URL('../assets/fishgear/frame-gold.webp', import.meta.url)),
  'n:anchor': pic(new URL('../assets/fishgear/badge-anchor.webp', import.meta.url)),
  // Остров «Последний свет».
  'b:bellbuoy': pic(new URL('../assets/fishgear/bobber-bellbuoy.webp', import.meta.url)),
  'r:lighthouse': pic(new URL('../assets/fishgear/rod-lighthouse.webp', import.meta.url)),
  's:puffin': pic(new URL('../assets/fishgear/reward-puffin.webp', import.meta.url)),
  'h:keeper': pic(new URL('../assets/fishgear/reward-keeper-hat.webp', import.meta.url)),
  'a:keeper': pic(new URL('../assets/fishgear/reward-keeper-sweater.webp', import.meta.url)),
  'w:fog': pic(new URL('../assets/fishgear/frame-fog.webp', import.meta.url)),
  'n:lighthouse': pic(new URL('../assets/fishgear/badge-lighthouse.webp', import.meta.url)),
};
