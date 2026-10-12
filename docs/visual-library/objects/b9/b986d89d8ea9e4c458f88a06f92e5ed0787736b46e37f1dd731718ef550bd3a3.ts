// Вход страницы /lab/: шрифт, оформление и страница. Игру и её сеть эта страница не трогает.
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import './lab.css';
import { LabPage } from './page.ts';

const root = document.getElementById('lab');
if (root) new LabPage(root).start();
