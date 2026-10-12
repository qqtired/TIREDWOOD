import { FITTING_SLOTS, STAGE_NAMES, type FittingItem, type FittingProject, type FittingStage, type FittingTransform } from '../../shared/fitting-room.ts';
import { PALETTE, PALETTE_NAMES, SLOT_NAMES, TIER_NAMES, slotKey, type Slot, type Tier } from '../../shared/outfit.ts';
import { canPreview, createProject, equipItem, equipSet, normalizeProject, unequipSlot, updateItem, buildGenerationBrief } from './state.ts';
import { FittingScene } from './scene.ts';
import { download, exportBundle, imageUrl, importBundle, loadProject, readAsset, saveAsset, saveProject } from './storage.ts';
import { validateGlb } from './glb.ts';
import { h, button, field, input, select, dialog, icon } from './ui.ts';

type Phase = 'all' | 'references' | 'selected' | 'model' | 'approved';
const coins = new Intl.NumberFormat('ru-RU');
function priceLabel(item: FittingItem): string {
  return item.source === 'game' && ['trophy', 'jackpot', 'system', 'promo'].includes(item.tier)
    ? 'Не продаётся' : item.price ? `${coins.format(item.price)} жетонов` : 'Бесплатно';
}
function errorText(error: unknown): string { return error instanceof Error ? error.message : 'Не получилось. Попробуй ещё раз'; }

export class FittingPage {
  private readonly root: HTMLElement;
  private project = createProject();
  private selectedId = 'lab:harbor-beanie';
  private source: 'lab' | 'game' | 'sets' = 'lab';
  private phase: Phase = 'all';
  private slot: Slot | 'all' = 'all';
  private query = '';
  private scene: FittingScene | undefined;
  private thumbnails = new Map<string, string>();
  private loadedModels = new Map<string, string>();
  private list = h('div');
  private inspector = h('aside');
  private gallery = h('section');
  private stage = h('section');
  private canvas = h('canvas');
  private notice = h('p');
  private status = h('p');
  private fishWindow = h('div');
  private phaseNav = h('nav');
  private sourceNav = h('div');
  private slotFilter: HTMLSelectElement | undefined;
  private saveTimer = 0;
  private saving: Promise<void> = Promise.resolve();
  private motion = 'idle';
  private autoRotate = false;

  constructor(root: HTMLElement) { this.root = root; }
  async start(): Promise<void> {
    let warning = '';
    try { this.project = await loadProject() ?? this.project; } catch (error) { warning = errorText(error); }
    this.selectedId = this.project.equipped.h ?? this.project.items.find(item => item.source === 'lab')?.id ?? this.project.items[0]?.id ?? '';
    this.build();
    if (warning) this.message(warning, true);
    try {
      this.scene = new FittingScene(this.canvas);
      this.scene.setProject(this.project);
      await this.ensureModels();
      await this.makeThumbnails();
      this.paint();
    } catch (error) { this.message(`3D не запустилось. ${errorText(error)}`, true); }
    window.addEventListener('pagehide', () => { void this.persist(); });
    window.addEventListener('beforeunload', () => { this.scene?.dispose(); });
  }
  private selected(): FittingItem | undefined { return this.project.items.find(item => item.id === this.selectedId); }
  private message(text: string, bad = false): void {
    this.status.textContent = text;
    this.status.dataset.bad = String(bad);
  }
  private build(): void {
    this.status = h('p', { class: 'fr-status', role: 'status', 'aria-live': 'polite' }, 'Изменения сохраняются в этом браузере. Скачай проект, чтобы перенести его на другой компьютер.');
    const exportButton = button('Скачать проект', () => void this.run(async () => {
      await this.persist();
      download(await exportBundle(this.project), `tiredwood-fitting-room-${new Date().toISOString().slice(0, 10)}.json`);
      this.message('Копия содержит вещи, сеты, референсы и загруженные модели');
    }), 'fr-primary');
    exportButton.prepend(icon('download'));
    const add = h('details', { class: 'fr-add-menu' }, h('summary', {}, 'Добавить'), h('div', { class: 'fr-menu' },
      button('Пачку референсов', () => { add.open = false; this.addReferences(); }),
      button('Проект из файла', () => { add.open = false; this.pick('.json', false, files => void this.run(async () => {
        clearTimeout(this.saveTimer);
        await this.saving.catch(() => {});
        const project = await importBundle(files[0]);
        this.scene?.clearImportedModels();
        this.project = project;
        this.loadedModels.clear();
        this.selectedId = project.items.find(item => item.source === 'lab')?.id ?? project.items[0]?.id ?? '';
        await this.ensureModels();
        this.paint();
        this.message('Проект загружен вместе с файлами');
      })); }),
    ));
    const header = h('header', { class: 'fr-header' },
      h('div', { class: 'fr-brand' }, icon('jelly'), h('div', {}, h('span', {}, 'TIREDWOOD'), h('h1', {}, 'Примерочная'))),
      h('a', { href: window.location.pathname.startsWith('/lab/') ? '/lab/' : 'https://game.tired.solutions/lab/', class: 'fr-back' }, 'В лабораторию'),
      h('div', { class: 'fr-header-actions' }, button('Задание на референсы', () => this.generationDialog(), 'fr-quiet'), add, exportButton),
    );
    this.phaseNav = h('nav', { class: 'fr-phases', 'aria-label': 'Этапы разработки' });
    this.sourceNav = h('div', { class: 'fr-source', role: 'group', 'aria-label': 'Каталог' });
    const search = input('', value => { this.query = value; this.paintList(); }, 'search');
    search.placeholder = 'Найти вещь';
    search.setAttribute('aria-label', 'Найти вещь');
    search.addEventListener('input', () => { this.query = search.value; this.paintList(); this.paintGallery(); });
    const slots = select([['all', 'Все слоты'], ...FITTING_SLOTS.map(slot => [slot, SLOT_NAMES[slot]] as [string, string])], 'all', value => {
      this.slot = value as Slot | 'all'; this.paintList(); this.paintGallery();
    });
    slots.setAttribute('aria-label', 'Слот вещей');
    this.slotFilter = slots;
    this.list = h('div', { class: 'fr-list' });
    const sidebar = h('aside', { class: 'fr-catalog', 'aria-label': 'Каталог вещей' }, this.sourceNav, h('div', { class: 'fr-filters' }, search, slots), this.list,
      button('Сохранить наряд как сет', () => this.setDialog(), 'fr-save-set'),
    );
    this.canvas = h('canvas', { class: 'fr-canvas', 'aria-label': 'Желейка с надетыми вещами. Используй кнопки поворота под сценой.' });
    this.notice = h('p', { class: 'fr-stage-notice', hidden: true });
    this.fishWindow = h('div', { class: 'fr-fish-window', hidden: true, 'aria-label': 'Пример оформления окна вываживания' },
      h('span', {}, 'Пример окна вываживания'), h('div', { class: 'fr-fish-track' }, h('i'), h('b')), h('small', {}, 'Оформление из игры · без улова и наград'),
    );
    const environment = select([['studio', 'Студия'], ['pier', 'На пирсе']], 'studio', value => this.scene?.setEnvironment(value as 'studio' | 'pier'));
    environment.setAttribute('aria-label', 'Окружение примерки');
    const screenshot = button('', () => this.scene && download(dataBlob(this.scene.screenshot()), 'tiredwood-outfit.png'), 'fr-icon-button');
    screenshot.append(icon('camera'));
    screenshot.setAttribute('aria-label', 'Скачать снимок наряда');
    const motion = h('div', { class: 'fr-motion', role: 'group', 'aria-label': 'Движение персонажа' });
    for (const [key, label] of [['idle', 'Стоять'], ['walk', 'Идти'], ['wave', 'Махать'], ['dance', 'Танцевать']]) {
      const control = button(label, () => {
        this.motion = key; this.scene?.setMotion(key as 'idle' | 'walk' | 'wave' | 'dance');
        for (const item of motion.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === control));
      });
      control.setAttribute('aria-pressed', String(this.motion === key));
      motion.append(control);
    }
    const cameras = h('div', { class: 'fr-cameras', role: 'group', 'aria-label': 'Поворот камеры' });
    for (const [key, label] of [['front', 'Спереди'], ['back', 'Сзади'], ['side', 'Сбоку']]) cameras.append(button(label, () => this.scene?.setView(key as 'front' | 'back' | 'side')));
    const rotating = button('Вращать', () => {
      this.autoRotate = !this.autoRotate; this.scene?.setAutoRotate(this.autoRotate);
      rotating.setAttribute('aria-pressed', String(this.autoRotate));
    });
    rotating.setAttribute('aria-pressed', 'false');
    cameras.append(rotating);
    const colors = h('div', { class: 'fr-colors' });
    for (const [key, label] of [['c', 'Тело'], ['c2', 'Узор']] as const) {
      const row = h('div', { class: 'fr-color-row' }, h('span', {}, label));
      PALETTE.forEach((color, index) => {
        const swatch = button('', () => { this.commit({ ...this.project, outfit: { ...this.project.outfit, [key]: index } }); }, 'fr-swatch');
        swatch.style.setProperty('--swatch', `#${color.toString(16).padStart(6, '0')}`);
        swatch.dataset.color = `${key}:${index}`;
        swatch.title = PALETTE_NAMES[index];
        swatch.setAttribute('aria-label', `${label}: ${PALETTE_NAMES[index]}`);
        row.append(swatch);
      });
      colors.append(row);
    }
    this.stage = h('section', { class: 'fr-stage', 'aria-label': '3D-примерка' },
      h('div', { class: 'fr-stage-head' }, h('div', {}, h('h2', {}, 'На персонаже'), h('p', {}, 'Проверь посадку, движение и весь сет.')), h('div', { class: 'fr-stage-tools' }, environment, screenshot)),
      h('div', { class: 'fr-viewport' }, this.canvas, h('span', { class: 'fr-orbit-hint' }, 'Потяни, чтобы повернуть · колесо — ближе'), this.notice, this.fishWindow),
      h('div', { class: 'fr-stage-controls' }, motion, cameras), colors,
      h('div', { class: 'fr-equipped', 'aria-label': 'Надетые вещи' }),
    );
    this.gallery = h('section', { class: 'fr-gallery', hidden: true, 'aria-label': 'Галерея референсов' });
    this.inspector = h('aside', { class: 'fr-inspector', 'aria-label': 'Выбранная вещь' });
    this.root.replaceChildren(header, this.phaseNav, h('main', { class: 'fr-workspace' }, sidebar, h('div', { class: 'fr-center' }, this.stage, this.gallery), this.inspector),
      h('footer', { class: 'fr-footer' }, this.status, h('span', {}, 'Вещи Lab ждут отдельного решения о переносе в игру.')),
    );
    this.root.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
    this.root.addEventListener('drop', event => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) void this.run(() => this.importImages(files));
    });
    this.paint();
  }
  private items(): FittingItem[] {
    return this.project.items.filter(item => (this.source === 'sets' || item.source === this.source)
      && (this.slot === 'all' || item.slot === this.slot)
      && (!this.query || item.name.toLocaleLowerCase('ru').includes(this.query.toLocaleLowerCase('ru')))
      && (this.phase === 'all' || (this.phase === 'references' ? Boolean(item.reference) || item.stage === 'reference' : item.stage === this.phase)));
  }
  private paint(keepInspector = false): void {
    this.paintNav(); this.paintList(); if (!keepInspector) this.paintInspector(); this.paintGallery();
    if (this.slotFilter) this.slotFilter.value = this.slot;
    this.scene?.setProject(this.project);
    const item = this.selected();
    this.notice.hidden = !item || canPreview(item);
    this.notice.textContent = 'Для этой вещи пока есть только референс. Отметь понравившийся вариант — затем добавим его 3D-модель.';
    const windows = this.project.items.find(item => item.id === this.project.equipped.w);
    this.fishWindow.hidden = !windows;
    if (windows) this.fishWindow.dataset.frTheme = slotKey(this.project.outfit, 'w');
    for (const swatch of this.root.querySelectorAll<HTMLButtonElement>('[data-color]')) {
      const [key, index] = swatch.dataset.color!.split(':');
      swatch.setAttribute('aria-pressed', String(this.project.outfit[key as 'c' | 'c2'] === Number(index)));
    }
    const equipped = this.stage.querySelector('.fr-equipped')!;
    equipped.replaceChildren(...FITTING_SLOTS.flatMap(slot => {
      const item = this.project.items.find(item => item.id === this.project.equipped[slot]);
      if (!item) return [];
      const control = button(item.name, () => this.choose(item.id), 'fr-equipped-item');
      control.title = `${SLOT_NAMES[slot]} · нажми, чтобы открыть`;
      return [control];
    }));
  }
  private paintNav(): void {
    this.phaseNav.replaceChildren(...([['all', 'Примерка'], ['references', 'Референсы'], ['selected', 'Выбрано для 3D'], ['approved', 'К переносу']] as Array<[Phase, string]>).map(([phase, label]) => {
      const total = this.project.items.filter(item => item.source === 'lab' && (phase === 'all' ? canPreview(item) : phase === 'references' ? item.reference || item.stage === 'reference' : item.stage === phase)).length;
      const control = button(`${label} ${total}`, () => { this.phase = phase; this.source = 'lab'; this.paint(); }, 'fr-phase');
      control.setAttribute('aria-pressed', String(this.phase === phase));
      return control;
    }));
    this.sourceNav.replaceChildren(...([['lab', 'Кандидаты'], ['game', 'В игре'], ['sets', 'Сеты']] as const).map(([source, label]) => {
      const control = button(label, () => { this.source = source; this.phase = 'all'; this.paint(); });
      control.setAttribute('aria-pressed', String(this.source === source));
      return control;
    }));
  }
  private thumbnail(item: FittingItem, className = ''): HTMLElement {
    const image = h('img', { alt: item.name, loading: 'lazy', class: className });
    const placeholder = h('div', { class: `fr-thumb ${className}` }, h('span', {}, SLOT_NAMES[item.slot]));
    if (item.reference) void imageUrl(item.reference).then(url => { image.src = url; placeholder.replaceChildren(image); }).catch(() => { placeholder.title = 'Файл референса отсутствует'; });
    else if (this.thumbnails.has(item.id)) { image.src = this.thumbnails.get(item.id)!; placeholder.replaceChildren(image); }
    else { placeholder.append(icon('jelly')); }
    return placeholder;
  }
  private paintList(): void {
    if (this.source === 'sets') {
      this.list.replaceChildren(...this.project.sets.map(set => {
        const members = set.itemIds.map(id => this.project.items.find(item => item.id === id)!);
        const row = button('', () => void this.run(async () => { this.commit(equipSet(this.project, set.id)); this.selectedId = set.itemIds[0]; await this.ensureModels(); this.paint(); this.message(`Надет сет «${set.name}»`); }), 'fr-item fr-set-row');
        row.append(this.thumbnail(members[0]), h('span', { class: 'fr-item-text' }, h('strong', {}, set.name), h('small', {}, `${members.length} вещи · ${coins.format(members.reduce((sum, item) => sum + item.price, 0))} жетонов`)));
        return row;
      }));
      if (!this.project.sets.length) this.list.append(h('p', { class: 'fr-empty' }, 'Примерь вещи и сохрани наряд как сет.'));
      return;
    }
    const items = this.items();
    this.list.replaceChildren(...items.map(item => {
      const row = button('', () => this.choose(item.id), 'fr-item');
      row.dataset.itemId = item.id;
      row.setAttribute('aria-pressed', String(item.id === this.selectedId));
      row.append(this.thumbnail(item), h('span', { class: 'fr-item-text' }, h('strong', {}, item.name), h('small', {}, `${SLOT_NAMES[item.slot]} · ${priceLabel(item)}`),
        h('span', { class: 'fr-item-stage', 'data-stage': item.stage }, item.source === 'game' ? 'Игровая вещь' : STAGE_NAMES[item.stage])),
        ...(this.project.equipped[item.slot] === item.id ? [h('span', { class: 'fr-wearing', title: 'Надето', 'aria-label': 'Надето' }, '✓')] : []),
      );
      return row;
    }));
    if (!items.length) this.list.append(h('p', { class: 'fr-empty' }, 'Здесь пока пусто. Измени фильтр или добавь референсы.'));
  }
  private paintGallery(): void {
    const showing = this.phase === 'references' || this.phase === 'selected';
    this.gallery.hidden = !showing; this.stage.hidden = showing;
    if (!showing) return;
    const items = this.items();
    this.gallery.replaceChildren(h('div', { class: 'fr-gallery-head' }, h('h2', {}, this.phase === 'selected' ? 'Выбрано для создания 3D' : 'Референсы'),
      h('p', {}, 'Открой вариант и отметь понравившийся. Картинка и модель хранятся в одной карточке.')),
      h('div', { class: 'fr-reference-grid' }, ...items.map(item => {
        const card = button('', () => this.choose(item.id), 'fr-reference-card');
        card.setAttribute('aria-pressed', String(item.id === this.selectedId));
        card.append(this.thumbnail(item), h('strong', {}, item.name), h('small', {}, STAGE_NAMES[item.stage]));
        return card;
      })),
    );
    if (!items.length) this.gallery.append(h('div', { class: 'fr-gallery-empty' }, h('h3', {}, 'Начни с подборки'),
      h('p', {}, 'Добавь до 40 изображений за раз или подготовь задание на генерацию.'), button('Добавить референсы', () => this.addReferences(), 'fr-primary')));
  }
  private choose(id: string): void {
    this.selectedId = id; this.paintList(); this.paintInspector(); this.paintGallery();
    this.notice.hidden = canPreview(this.selected()!);
  }
  private paintInspector(): void {
    const item = this.selected();
    if (!item) { this.inspector.replaceChildren(h('p', { class: 'fr-empty' }, 'Выбери вещь в каталоге')); return; }
    const isLab = item.source === 'lab';
    const ready = canPreview(item);
    const wearing = this.project.equipped[item.slot] === item.id;
    const name = input(item.name, value => this.changeItem({ name: value })); name.maxLength = 120; name.disabled = !isLab;
    const price = input(String(item.price), value => this.changeItem({ price: Number(value) }), 'number'); price.min = '0'; price.step = '1'; price.disabled = !isLab;
    const notes = h('textarea', { rows: 3, maxlength: 4000, onchange: event => this.changeItem({ notes: (event.target as HTMLTextAreaElement).value }) }); notes.value = item.notes;
    const decision = select(Object.entries(STAGE_NAMES), item.stage, value => this.changeItem({ stage: value as FittingStage }));
    for (const option of decision.options) if (['approved', 'model'].includes(option.value)) option.disabled = !ready;
    const rarity = select(Object.entries(TIER_NAMES).filter(([key]) => isLab ? ['common', 'rare', 'epic', 'premium', 'free'].includes(key) : true), item.tier, value => this.changeItem({ tier: value as Tier })); rarity.disabled = !isLab;
    const preview = this.thumbnail(item, 'fr-inspector-image');
    if (item.reference) { preview.tabIndex = 0; preview.setAttribute('role', 'button'); preview.setAttribute('aria-label', 'Открыть референс крупно');
      const show = (): void => { void imageUrl(item.reference!).then(url => dialog(item.name, h('img', { src: url, alt: `Референс: ${item.name}`, class: 'fr-large-reference' }))).catch(error => this.message(errorText(error), true)); };
      preview.addEventListener('click', show); preview.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } });
    }
    const tryOn = button(wearing ? 'Снять вещь' : ready ? 'Примерить' : 'Выбрать для 3D', () => void this.run(async () => {
      if (!ready) { this.changeItem({ stage: 'selected' }); this.message('Вариант выбран. Теперь можно создать и добавить его 3D-модель'); return; }
      this.commit(wearing ? unequipSlot(this.project, item.slot) : equipItem(this.project, item.id));
      await this.ensureModels(); this.phase = 'all'; this.paint();
    }), 'fr-primary fr-wide');
    this.inspector.replaceChildren(h('div', { class: 'fr-inspector-title' }, h('h2', {}, item.name), h('span', { class: 'fr-origin' }, isLab ? 'Кандидат Lab' : 'В игре')), preview,
      h('p', { class: 'fr-reference-caption' }, item.reference ? 'Референс · нажми, чтобы рассмотреть' : ready ? '3D-модель' : 'Загрузи изображение референса'),
      h('div', { class: 'fr-inspector-fields' }, field('Название', name), h('div', { class: 'fr-field-pair' }, field('Цена, жетоны', price), field('Редкость', rarity)),
        isLab ? field('Решение', decision) : h('p', { class: 'fr-helper' }, `${priceLabel(item)} · данные действующего каталога`),
        field('Заметка', notes)), tryOn,
    );
    if (isLab && ['h', 'a', 'e', 's', 'r', 'b'].includes(item.slot)) this.inspector.append(button(item.asset ? 'Заменить 3D-модель' : 'Добавить 3D-модель', () => this.addModel(item), 'fr-wide'),
      ready ? button('Скачать модель GLB', () => void this.run(async () => {
        await this.ensureModels(); const data = await this.scene!.exportItemModel(item.id); download(new Blob([data], { type: 'model/gltf-binary' }), `${item.id.replace(/:/g, '-')}.glb`);
      }), 'fr-wide fr-quiet') : h('p', { class: 'fr-helper' }, 'Поддерживается GLB с текстурами внутри файла. До 20 МБ.'),
    );
    if (isLab && ['p', 'w', 'n'].includes(item.slot)) this.inspector.append(h('p', { class: 'fr-helper' }, 'Этот слот меняет оформление. Подготовим узор, окно или значок по выбранному референсу.'));
    if (item.asset) this.inspector.append(this.adjustment(item));
    const membership = select([['', 'Добавить в сет…'], ...this.project.sets.map(set => [set.id, set.name] as [string, string])], '', value => {
      if (!value) return;
      const sets = this.project.sets.map(set => set.id === value ? { ...set, itemIds: [...set.itemIds.filter(id => this.project.items.find(member => member.id === id)?.slot !== item.slot), item.id] } : set);
      this.commit(normalizeProject({ ...this.project, sets })); this.message('Вещь добавлена в сет. Прежняя вещь этого слота заменена');
    });
    membership.setAttribute('aria-label', 'Добавить выбранную вещь в сет');
    this.inspector.append(h('div', { class: 'fr-set-membership' }, h('h3', {}, 'Сеты'), membership,
      ...this.project.sets.filter(set => set.itemIds.includes(item.id)).map(set => h('p', {}, set.name)),
      h('small', {}, 'Одна вещь на слот. Цена сета — сумма цен вещей.')));
  }
  private adjustment(item: FittingItem): HTMLElement {
    const transform: FittingTransform = item.transform ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };
    const current = (): FittingTransform => this.selected()?.transform ?? transform;
    const controls = h('div', { class: 'fr-adjustments' });
    for (const [index, label] of ['Влево / вправо', 'Выше / ниже', 'Вперёд / назад'].entries()) {
      const control = input(String(transform.position[index]), value => {
        const latest = current(); const position = [...latest.position] as [number, number, number]; position[index] = Number(value);
        this.changeItem({ transform: { ...latest, position } });
      }, 'number'); control.step = '0.025'; controls.append(field(label, control));
    }
    const scale = input(String(transform.scale), value => this.changeItem({ transform: { ...current(), scale: Number(value) } }), 'number'); scale.step = '0.05'; scale.min = '0.05'; scale.max = '10';
    const turn = input(String(Math.round(transform.rotation[1] * 180 / Math.PI)), value => { const latest = current(); this.changeItem({ transform: { ...latest, rotation: [latest.rotation[0], Number(value) * Math.PI / 180, latest.rotation[2]] } }); }, 'number'); turn.step = '15';
    controls.append(field('Масштаб', scale), field('Поворот, градусы', turn));
    for (const [axis, label] of [[0, 'Наклон вперёд, градусы'], [2, 'Наклон вбок, градусы']] as const) {
      const tilt = input(String(Math.round(transform.rotation[axis] * 180 / Math.PI)), value => {
        const latest = current(); const rotation = [...latest.rotation] as [number, number, number]; rotation[axis] = Number(value) * Math.PI / 180;
        this.changeItem({ transform: { ...latest, rotation } });
      }, 'number'); tilt.step = '15'; controls.append(field(label, tilt));
    }
    return h('details', { class: 'fr-adjustment' }, h('summary', {}, 'Посадка модели'), controls);
  }
  private changeItem(patch: Partial<FittingItem>): void {
    try {
      this.commit(updateItem(this.project, this.selectedId, patch), patch.stage === undefined);
      const title = this.inspector.querySelector('h2'); if (title) title.textContent = this.selected()!.name;
    } catch (error) { this.message(errorText(error), true); this.paintInspector(); }
  }
  private commit(project: FittingProject, keepInspector = false): void {
    this.project = project; this.paint(keepInspector);
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { void this.persist(); }, 250);
  }
  private async persist(): Promise<void> {
    clearTimeout(this.saveTimer);
    const snapshot = this.project;
    this.saving = this.saving.catch(() => {}).then(() => saveProject(snapshot));
    try { await this.saving; this.message('Сохранено в этом браузере · полную копию можно скачать'); } catch (error) { this.message(errorText(error), true); }
  }
  private async ensureModels(): Promise<void> {
    if (!this.scene) return;
    this.scene.setProject(this.project);
    for (const item of this.project.items) {
      if (!item.asset || this.loadedModels.get(item.id) === item.asset) continue;
      const asset = await readAsset(item.asset);
      const data = await asset.blob.arrayBuffer(); validateGlb(data);
      await this.scene.setImportedModel(item.id, data, item.transform);
      this.loadedModels.set(item.id, item.asset);
    }
    this.scene.setProject(this.project);
  }
  private async makeThumbnails(): Promise<void> {
    if (!this.scene) return;
    for (const item of this.project.items.filter(item => item.model)) {
      this.scene.setProject(equipItem({ ...this.project, equipped: {}, outfit: { ...this.project.outfit, h: 'none', a: 'none', e: 'normal', s: undefined } }, item.id));
      this.thumbnails.set(item.id, this.scene.screenshot());
    }
    this.scene.setProject(this.project);
  }
  private pick(accept: string, multiple: boolean, on: (files: File[]) => void): void {
    const picker = h('input', { type: 'file', accept, multiple, hidden: true });
    document.body.append(picker);
    picker.addEventListener('change', () => { const files = Array.from(picker.files ?? []); picker.remove(); if (files.length) on(files); }, { once: true });
    picker.addEventListener('cancel', () => picker.remove(), { once: true });
    picker.click();
  }
  private addReferences(): void {
    const slot = select(FITTING_SLOTS.map(slot => [slot, SLOT_NAMES[slot]]), this.slot === 'all' ? this.selected()?.slot ?? 'h' : this.slot, () => {});
    const modal = dialog('Добавить референсы', h('p', { class: 'fr-helper' }, 'До 40 изображений PNG, JPEG или WebP за раз. Каждое станет отдельным кандидатом.'), field('Слот новых вещей', slot),
      button('Выбрать изображения', () => { const selectedSlot = slot.value as Slot; modal.close(); this.pick('image/png,image/jpeg,image/webp', true, files => void this.run(() => this.importImages(files, selectedSlot))); }, 'fr-primary'));
  }
  private async importImages(files: File[], slot: Slot = this.slot === 'all' ? this.selected()?.slot ?? 'h' : this.slot): Promise<void> {
    if (files.length > 40) throw new Error('Добавь не больше 40 референсов за раз');
    if (this.project.items.length + files.length > 1000) throw new Error('В проекте уже слишком много вещей');
    for (const file of files) if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Нужны PNG, JPEG или WebP до 8 МБ каждый');
    const items: FittingItem[] = [];
    for (const file of files) items.push({ id: `lab:${crypto.randomUUID()}`, name: file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Новый референс', slot, tier: 'common', price: 300, source: 'lab', stage: 'reference', notes: '', reference: await saveAsset(file) });
    this.selectedId = items[0]?.id ?? this.selectedId;
    this.source = 'lab'; this.phase = 'references'; this.slot = 'all';
    this.commit(normalizeProject({ ...this.project, items: [...this.project.items, ...items] }));
    this.message(`Добавлено референсов: ${items.length}. Выбери понравившиеся для создания 3D`);
  }
  private addModel(item: FittingItem): void {
    this.pick('.glb', false, files => void this.run(async () => {
      const file = files[0]; const data = await file.arrayBuffer(); validateGlb(data);
      if (!this.scene) throw new Error('Сначала нужно запустить 3D');
      await this.scene.setImportedModel(item.id, data, item.transform);
      const asset = await saveAsset(new File([data], file.name, { type: 'model/gltf-binary' }));
      this.loadedModels.set(item.id, asset);
      this.project = updateItem(this.project, item.id, { asset, stage: 'model' });
      this.phase = 'all'; this.commit(equipItem(this.project, item.id));
      this.message('3D-модель добавлена. Проверь её спереди, сзади и в движении');
    }));
  }
  private setDialog(): void {
    const members = Object.values(this.project.equipped).filter((id): id is string => Boolean(id));
    if (!members.length) { this.message('Сначала примерь хотя бы одну вещь', true); return; }
    const name = input('Новый сет', () => {}); name.maxLength = 120;
    const modal = dialog('Сохранить наряд как сет', field('Название сета', name), h('p', { class: 'fr-helper' }, `В сете ${members.length} вещи. Цвет тела остаётся твоим выбором.`),
      button('Сохранить сет', () => { try {
        const project = normalizeProject({ ...this.project, sets: [...this.project.sets, { id: `set:${crypto.randomUUID()}`, name: name.value, itemIds: members }] });
        modal.close(); this.source = 'sets'; this.commit(project);
      } catch (error) { this.message(errorText(error), true); } }, 'fr-primary'));
  }
  private generationDialog(): void {
    let slot: Slot = this.slot === 'all' ? this.selected()?.slot ?? 'h' : this.slot;
    let count = 40; let theme = 'Уютная набережная, лето и повседневные вещи';
    const brief = h('textarea', { class: 'fr-brief', rows: 12, readonly: true, 'aria-label': 'Задание для генерации референсов' });
    const update = (): void => { try { brief.value = buildGenerationBrief(slot, count, theme); } catch (error) { brief.value = errorText(error); } };
    update();
    const amount = input('40', value => { count = Number(value); update(); }, 'number'); amount.min = '1'; amount.max = '40';
    const subject = input(theme, value => { theme = value; update(); }); subject.maxLength = 1000;
    dialog('Задание на референсы', h('p', { class: 'fr-helper' }, 'Скопируй задание в чат с Codex. Он сгенерирует отдельные изображения; затем отберём варианты и создадим модели.'),
      h('div', { class: 'fr-field-pair' }, field('Слот', select(FITTING_SLOTS.map(slot => [slot, SLOT_NAMES[slot]]), slot, value => { slot = value as Slot; update(); })), field('Количество', amount)), field('Тема подборки', subject), brief,
      button('Скопировать задание', () => void this.run(async () => { if (!Number.isInteger(count) || count < 1 || count > 40) throw new Error('Выбери от 1 до 40 референсов'); await navigator.clipboard.writeText(brief.value); this.message('Задание скопировано. Отправь его в чат'); }), 'fr-primary'),
      button('Скачать задание', () => download(new Blob([brief.value], { type: 'text/plain;charset=utf-8' }), 'tiredwood-reference-brief.txt'), 'fr-quiet'),
    );
  }
  private async run(action: () => Promise<void>): Promise<void> {
    try { await action(); } catch (error) { this.message(errorText(error), true); }
  }
}

function dataBlob(data: string): Blob {
  const [header, body] = data.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/png';
  return new Blob([Uint8Array.from(atob(body), char => char.charCodeAt(0))], { type: mime });
}
