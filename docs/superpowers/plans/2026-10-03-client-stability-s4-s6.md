# S4–S6: reconnect HUD, GLB recovery, static shadows

Статус: исходники сохранены в `/tmp/opus-client-s4-s6-Wtz6fY`; точные причины подтверждены кодом. Исходники worker заморожены; 13/13 focused tests и scoped TypeScript PASS. Root владеет App reset на закрытии WS, браузером и полным release gate.

- [x] Прочитать исходный аудит и текущие TokensHud, два GLB cache, Renderer; проверить установленный Three 0.186.1.
- [x] S4: защита от отложенного callback предыдущего поколения HUD; reset границы подключения интегрирует root. Проверить fresh 175 после pending150, обычную задержку и немедленный новый баланс.
- [x] S5: один ограниченный повтор загрузки, общий in-flight/success cache, eviction после окончательного отказа в critter/boat. Проверить реальные GLB, concurrent callers, вход без reload, dispose до завершения.
- [x] S6: после собственного восстановления Three инвалидировать статические тени; проверить настоящий Renderer callback с подменой только GPU-зависимости и точный Three source order.
- [x] Узкие regression/type checks; передать root список, подтверждения и freeze.

Исходные модели, материалы, экономика и протокол не меняются. Никаких SSH/deploy, полного gate или запуска сервера этим worker. Откат точечный из исходных копий; runtime visual loss→restore на Lobby/Fort/Boat/Fight подтверждает root, CPU-тест сам по себе не доказывает изображение.
