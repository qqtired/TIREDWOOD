import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import './fitting-room.css';
import '../ui/fishstyle.css';
import { FittingPage } from './page.ts';

const root = document.getElementById('fitting-room');
if (root) void new FittingPage(root).start();
