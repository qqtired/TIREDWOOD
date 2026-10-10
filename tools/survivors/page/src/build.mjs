import fs from 'node:fs';
const parts=['p3a-core.js','p3b-stage.js','p3c-sections-a.js','p3d-sections-b.js','p3e-sections-c.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
const script='<script>\n(function () {\n\'use strict\';\n'+parts+'\n})();\n</script>\n';
fs.writeFileSync('/Users/tired/Desktop/game-opus-survivors/docs/survivors/page/index.html', fs.readFileSync('p1-style.html','utf8')+fs.readFileSync('p2-body.html','utf8')+script);
fs.writeFileSync('check.js',parts);
