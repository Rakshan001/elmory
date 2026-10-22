// synthetic 50k-line TS-like file with mostly-unique identifiers (seeded)
import { writeFileSync } from 'node:fs';
let s = 12345; const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32;
const words = ['user','token','auth','cache','blob','path','record','state','fact','quote','chain','head','store','index','event','signal','team','task','worker','graph'];
const id = () => words[(r() * 20) | 0] + (r() < 0.5 ? words[(r() * 20) | 0][0].toUpperCase() + words[(r() * 20) | 0].slice(1) : '') + ((r() * 1000) | 0);
const T = [
  () => `  const ${id()} = await ${id()}(${id()}, ${(r()*100)|0});`,
  () => `  if (${id()}.${id()} === '${id()}') return ${id()};`,
  () => `export function ${id()}(${id()}: string, ${id()}: number): ${r()<.5?'void':'string'} {`,
  () => `  ${id()}.push({ ${id()}: ${id()}, ${id()}: [${(r()*9)|0}, ${(r()*9)|0}] });`,
  () => `}`,
  () => `  // ${id()} handles ${id()} before ${id()}`,
  () => ``,
];
const lines = []; for (let i = 0; i < 50000; i++) lines.push(T[(r() * T.length) | 0]());
writeFileSync(process.argv[2], lines.join('\n') + '\n');
