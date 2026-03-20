import figlet from 'figlet';
import chalk from 'chalk';

const purple = '#7c3aed';
const teal = '#2dd4bf';

function applyGradient(text: string): string {
  const lines = text.split('\n');
  const maxLen = Math.max(...lines.map((l) => l.length));
  return lines
    .map((line) => {
      let result = '';
      for (const [i, char] of [...line].entries()) {
        const ratio = maxLen > 1 ? i / (maxLen - 1) : 0;
        result += chalk.hex(lerpColor(purple, teal, ratio))(char);
      }

      return result;
    })
    .join('\n');
}

function lerpColor(a: string, b: string, t: number): string {
  const ar = Number.parseInt(a.slice(1, 3), 16);
  const ag = Number.parseInt(a.slice(3, 5), 16);
  const ab = Number.parseInt(a.slice(5, 7), 16);
  const br = Number.parseInt(b.slice(1, 3), 16);
  const bg = Number.parseInt(b.slice(3, 5), 16);
  const bb = Number.parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

export function renderBanner(): string {
  const text = figlet.textSync('cawpilot', {
    font: 'Small',
    horizontalLayout: 'default',
  });
  return applyGradient(text);
}

export function gradientText(text: string): string {
  let result = '';
  const chars = [...text];
  for (const [i, char] of chars.entries()) {
    const ratio = chars.length > 1 ? i / (chars.length - 1) : 0;
    result += chalk.hex(lerpColor(purple, teal, ratio))(char);
  }

  return result;
}
