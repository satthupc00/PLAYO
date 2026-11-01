// Tạo nội dung GitHub Release từ whatsnew.json
const w = require('../whatsnew.json');
const d = w.date.split('-').reverse().join('/');
let md = `## M PlayO v${w.version} · ${d}\n\n`;
for (const [k, t] of [['new', 'Mới'], ['improved', 'Cải thiện'], ['fixed', 'Sửa lỗi']])
  if (w[k] && w[k].length) md += `### ${t}\n` + w[k].map(x => `- ${x}`).join('\n') + '\n\n';
md += 'Tải file **M-PlayO-Setup-' + w.version + '.exe** bên dưới để cài. Máy đã cài bản cũ sẽ tự nhận bản mới.\n';
process.stdout.write(md);
