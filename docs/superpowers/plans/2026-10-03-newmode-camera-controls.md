# Камеры новых режимов: единый знак pitch

## Статус / что осталось
Завершено, camera lines frozen. После дополнительного review: 12/12 узких камерных проверок прошли; предшествующий gate — 52/52 и npm run check. Границы: камеры/input в Skill/Hide/Boat scenes; дополнительное разрешение ведущего — canonical ray в server/hide/game.ts. Миры/модели/геометрию/общий Input не меняем.

- [x] Причина: общий Input уменьшает pitch при движении мыши вниз; viewDir.y=+sin(pitch). Sky поднимает камеру при positive pitch и смотрит в фиксированную точку; HIDE использует противоположный знак и в клиенте, и в server ray.
- [x] Red: исполнить реальные scene.frame с настоящей THREE.Camera в Node; проверить вверх/вниз, W/S/диагонали, HIDE ray и стену Sky.
- [x] Sky перевести на существующий collision-aware cameraRig; HIDE camera/listener/server ray — на viewDir. Boat проверить по старой Race chase camera, не менять знаки без дефекта.
- [x] Целевые проверки, handoff/freeze камеры визуальным владельцам; отметить непройденную ручную браузерную приёмку.

Boat/Race имеют камеру погони; pitch там не управляет физикой газа/тормоза. Полный build/browser и ручная визуальная приёмка — ведущий, IAB не используется.

Результат: новая проверка исполняет реальные scene.frame/Input.mouse и THREE.Camera в Node, stub только asset URL/CSS imports и DOM/WebGL plumbing. Пять исходных регрессий наблюдались RED; после исправления все green. HIDE listener и серверный ray имеют bit-identical выход viewDir при одинаковых углах, камера совпадает до1e-12. Sky использует back6 и стартовый pitch−0.25, движущаяся коллизия ставится до cameraRig. Boat scene/physics не изменены: W/S корректны, вертикальный pitch игнорируется как в старой гонке. IAB/browser/human acceptance не выполнялись.

## Дополнительный review: накопленный pitch за пределами режима
- [x] Воспроизвести разворот на обоих пределах через реальный Input.mouse и проверить пакет encode/decode.
- [x] Ограничивать сам input.pitch до сериализации/отрисовки в Sky/HIDE; сохранить геометрию, HUD, общую чувствительность и sign convention.
- [x] Повторить узкие camera checks и вернуть freeze.

Дополнительный fix проверен red→green для верхнего и нижнего пределов обоих режимов: raw Input.pitch теперь ограничивается до input serialization, rendered pitch берётся из того же значения. Реальный Input.mouse после двух движений по600 px и обратного20 px сразу меняет камеру; декодированный пакет содержит Math.fround ограниченного угла. HUD/геометрия/общий Input/сервер не менялись в этом follow-up.
