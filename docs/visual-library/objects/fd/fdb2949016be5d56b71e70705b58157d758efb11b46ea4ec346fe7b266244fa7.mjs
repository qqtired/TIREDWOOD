// Один раз переносит существующие ресурсы в независимый пакет. Игру не изменяет.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(dir);
const game='[LOCAL_PATH]';
const pack='[LOCAL_PATH]';
const files={
 background:'lab/ui/img/bg-plaza-wide.jpg',
 heart:'client/assets/ui/icons/heart.webp',rain:'client/assets/ui/icons/rain.webp',anchor:'client/assets/ui/icons/anchor.webp',voice:'client/assets/ui/icons/voice.webp',token:'client/assets/ui/icons/token.webp',journal:'client/assets/ui/icons/journal.webp',dungeon:'client/assets/ui/icons/dungeon.webp',shield:'client/assets/ui/icons/shield.webp',bell:'client/assets/ui/icons/bell.webp',warn:'client/assets/ui/icons/warn.webp',zombie:'client/assets/ui/icons/zombie.webp',
 bag:'client/assets/fishshop/bag1.webp',beer:'client/assets/fishshop/beer.webp',marker:'client/assets/ui/icons/marker.webp',shotgun:'client/assets/fort/shotgun.webp',gren:'client/assets/fort/gren.webp',
 'emote-wave':'client/assets/ui/icons/emote.webp','emote-dance':'client/assets/ui/icons/music.webp','emote-tired':'client/assets/ui/icons/wd-e-sleepy.webp','emote-laugh':'client/assets/ui/icons/wd-e-happy.webp','emote-five':'client/assets/ui/icons/emote.webp','emote-heart':'client/assets/ui/icons/heart.webp',
 'd-wave':'client/assets/dungeon/icons/ui-wave.webp','d-lantern':'client/assets/dungeon/icons/weapon-lantern.webp','d-embers':'client/assets/dungeon/icons/weapon-embers.webp','d-pickaxe':'client/assets/dungeon/icons/weapon-pickaxe.webp','d-might':'client/assets/dungeon/icons/passive-might.webp','d-speed':'client/assets/dungeon/icons/passive-speed.webp','d-dash':'client/assets/dungeon/icons/active-dash.webp','d-strike':'client/assets/dungeon/icons/active-strike.webp','d-kills':'client/assets/dungeon/icons/ui-kills.webp','d-chest':'client/assets/dungeon/icons/pickup-chest.webp',
};
const manifest={};
for(const [id,src]of Object.entries(files)){const name=id+path.extname(src);fs.copyFileSync(path.join(game,src),path.join(root,'assets',name));manifest[id]='assets/'+name;}
const {COIN_HTML}=await import(path.join(game,'client/ui/coin.ts'));const coin=decodeURIComponent(COIN_HTML.match(/src="data:image\/svg\+xml,([^"]+)/)[1]);fs.writeFileSync(path.join(root,'assets','coin.svg'),coin);manifest.coin='../assets/coin.svg';
const {jellyPortrait}=await import(path.join(pack,'client/ui/kit/avatar.ts'));const {DEFAULT_OUTFIT}=await import(path.join(pack,'shared/outfit.ts'));fs.writeFileSync(path.join(root,'assets','avatar.svg'),jellyPortrait({...DEFAULT_OUTFIT,c:7,h:'cap'},'portrait'));
fs.writeFileSync(path.join(dir,'./assets.json'),JSON.stringify(manifest,null,2)+'\n');
for(const [name,src] of Object.entries({'./tokens.css':'client/ui/kit/./tokens.css','./kit.css':'client/ui/kit/./kit.css','./combat.css':'client/ui/kit/./combat.css','./dungeon.css':'client/dungeon/./dungeon.css'}))fs.copyFileSync(path.join(game,src),path.join(dir,name));
const fonts=[];
for(const [family,weights]of [['rubik',[400,600,700,800]],['rubik-mono-one',[400]],['alegreya-sans',[700,800,900]],['alegreya-sc',[900]]])for(const weight of weights)for(const subset of ['latin','cyrillic']){const name=`${family}-${subset}-${weight}-normal.woff2`;fs.copyFileSync(path.join(game,'node_modules','@fontsource',family,'files',name),path.join(root,'assets',name));fonts.push({family:{rubik:'Rubik','rubik-mono-one':'Rubik Mono One','alegreya-sans':'Alegreya Sans','alegreya-sc':'Alegreya SC'}[family],weight,subset,path:'assets/'+name});}
fs.writeFileSync(path.join(dir,'./fonts.json'),JSON.stringify(fonts,null,2)+'\n');
console.log(`Captured ${Object.keys(manifest).length} assets, ${fonts.length} font files; no game mutations.`);
