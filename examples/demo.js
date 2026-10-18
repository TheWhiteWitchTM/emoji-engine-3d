/**
 * Witch Hunt, a one-scene trial of the built public API.
 * Run: npm run demo
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { installHostShims } from './dom-shim.js';
import { Canvas, Engine, Terminal, Utilities } from '../dist/index.js';

checkBundle('emoji-engine-3d.js');
checkBundle('emoji-engine-3d.min.js');
installHostShims();

checkFrame();
checkProject();
checkFollow();
checkChromeContract();
checkTerminal();
checkSolids();
checkCollision();

const engine = new Engine({ width: 480, height: 270, antialias: false });
const ui = Utilities.wrap(engine.canvas, { title: 'Witch Hunt' });
document.body.appendChild(ui.wrap);
if (ui.headerMiddle) ui.headerMiddle.textContent = 'demo';
if (ui.footer) ui.footer.textContent = 'ready';

const term = new Terminal({
  cols: 36,
  rows: 4,
  canvas: engine.canvas,
  cellWidth: 12,
  cellHeight: 18,
  layer: 'terminal',
});
term.write('Witch Hunt\n');
term.write('A hunter crosses the heath.');

const ground = engine.box(0, -0.15, 0, 24, 0.3, 24, '#3d5c3a');
const witch = engine.sprite('🧙‍♀️', 0, 0.6, 0, 1.2);
const hunter = engine.sprite('✝️', 0, 0.5, 5, 1);
engine.motion(hunter, 0, 0, -0.15);
engine.canvas.followDistance = 7;
engine.canvas.followHeight = 3;
engine.canvas.follow(witch);

if (witch.layer !== 'default' || witch.radius !== 0.6) fail('witch was not placed on its layer');
if (hunter.layer !== 'default' || hunter.radius !== 0.5) fail('hunter radius');
if (ground.sensor !== false) fail('ground should be solid');
engine.update();
close(witch.y, 0.6, 'witch sank into the ground');
close(hunter.z, 4.85, 'hunter step');

const gl = engine.canvas.gl;
gl.drawCalls.length = 0;
engine.canvas.draw();
const boxes = gl.drawCalls.filter((call) => call.kind === 'elements');
const sprites = gl.drawCalls.filter((call) => call.kind === 'arrays' && call.instances === 2);
const glass = gl.drawCalls.filter((call) => call.kind === 'arrays' && call.instances === 1);
if (boxes.length !== 1 || boxes[0].count !== 36 || boxes[0].instances !== 1) {
  fail(`box batch ${JSON.stringify(boxes)}`);
}
if (sprites.length !== 1 || sprites[0].count !== 6) fail(`sprite batch ${JSON.stringify(sprites)}`);
if (glass.length !== 1 || glass[0].count !== 6) fail(`glass batch ${JSON.stringify(glass)}`);
close(engine.canvas.camera.eye.z, witch.z + 7, 'scene camera');

console.log(line(term, 0));
console.log(line(term, 1));

let finished = false;
const failSafe = setTimeout(() => {
  engine.stop();
  fail('timed out before a collision');
}, 5000);

const off = engine.onCollision((a, b) => {
  off();
  if (finished) return;
  finished = true;
  clearTimeout(failSafe);
  console.log(`${a.emoji} hit ${b.emoji}`);
  term.write(`\n${a.emoji} meets ${b.emoji}`);
  if (ui.footer) ui.footer.textContent = 'contact';
  engine.beep(523, 80);
  engine.stop();
  if (!(hunter.z < 5)) fail('hunter did not move');
  if (a !== witch || b !== hunter) fail('pair order');
  console.log('demo ok');
  exit(0);
});
if (typeof off !== 'function') fail('onCollision must return an unsubscribe function');

engine.start();

function checkBundle(file) {
  const code = readFileSync(new URL(`../browser/${file}`, import.meta.url), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  try {
    vm.runInContext(code, sandbox, { filename: file });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${file} did not run: ${message}`);
  }
  const api = sandbox.EmojiEngine3D;
  const names = api ? Object.keys(api).join(',') : 'missing';
  if (typeof api?.Canvas !== 'function') fail(`${file} missing Canvas (${names})`);
  if (typeof api?.Terminal !== 'function') fail(`${file} missing Terminal (${names})`);
  if (typeof api?.Engine !== 'function') fail(`${file} missing Engine (${names})`);
  if (typeof api?.Utilities?.wrap !== 'function') fail(`${file} missing Utilities.wrap (${names})`);
  if (api.Canvas === sandbox.EmojiEngine) fail(`${file} used the 2D global`);
}

function checkFrame() {
  const ahead = Canvas.forward(0, 0);
  close(ahead.x, 0, 'yaw 0 x');
  close(ahead.y, 0, 'yaw 0 y');
  close(ahead.z, -1, 'yaw 0 z');
  const left = Canvas.forward(Math.PI / 2, 0);
  close(left.x, -1, 'yaw quarter x');
  close(left.y, 0, 'yaw quarter y');
  close(left.z, 0, 'yaw quarter z');
  const up = Canvas.forward(0, Math.PI / 2);
  close(up.x, 0, 'pitch up x');
  close(up.y, 1, 'pitch up y');
  close(up.z, 0, 'pitch up z');
  const right = Canvas.right(0);
  close(right.x, 1, 'right x');
  close(right.y, 0, 'right y');
  close(right.z, 0, 'right z');
  const turned = Canvas.right(Math.PI / 2);
  close(turned.x, 0, 'turned right x');
  close(turned.y, 0, 'turned right y');
  close(turned.z, -1, 'turned right z');
}

function checkProject() {
  const view = new Canvas({ width: 200, height: 200, antialias: false });
  view.camera.fov = 90;
  view.camera.near = 0.1;
  view.camera.far = 100;
  view.setCamera(0, 0, 5, 0, 0);
  const origin = view.project(0, 0, 0);
  close(origin.x, 0, 'origin x');
  close(origin.y, 0, 'origin y');
  if (origin.behind) fail('origin was behind the camera');
  const edge = view.project(5, 0, 0);
  close(edge.x, 1, 'screen right edge');
  close(edge.y, 0, 'screen right edge y');
  const top = view.project(0, 5, 0);
  close(top.y, 1, 'screen top');
  const back = view.project(0, 0, 6);
  if (!back.behind) fail('a point behind the eye projected in front');

  view.setCamera(0, 0, 0, Math.PI / 2, 0);
  const nose = view.project(-5, 0, 0);
  close(nose.x, 0, 'look -x x');
  close(nose.y, 0, 'look -x y');
  if (nose.behind) fail('looking down -x put the target behind');
  const side = view.project(-5, 0, -5);
  if (!(side.x > 0.9)) fail(`screen right while looking -x was ${side.x}`);
}

function checkFollow() {
  const followed = new Engine({ width: 200, height: 200, antialias: false });
  const target = followed.sprite('🧙‍♀️', 2, 1, -3, 1);
  target.yaw = 0;
  followed.canvas.followDistance = 6;
  followed.canvas.followHeight = 2.5;
  followed.canvas.follow(target);
  followed.canvas.draw();
  close(followed.canvas.camera.eye.x, 2, 'follow x');
  close(followed.canvas.camera.eye.y, 3.5, 'follow y');
  close(followed.canvas.camera.eye.z, 3, 'follow z');
  close(followed.canvas.camera.yaw, 0, 'follow yaw');
  if (!(followed.canvas.camera.pitch < -0.3)) fail(`follow pitch ${followed.canvas.camera.pitch}`);
  followed.canvas.setCamera(0, 0, 0, 1, 0);
  followed.canvas.draw();
  close(followed.canvas.camera.eye.z, 3, 'follow keeps the eye');
  followed.canvas.follow(null);
  followed.canvas.setCamera(1, 2, 3, 0.4, -0.2);
  followed.canvas.draw();
  close(followed.canvas.camera.eye.x, 1, 'setCamera x');
  close(followed.canvas.camera.eye.y, 2, 'setCamera y');
  close(followed.canvas.camera.eye.z, 3, 'setCamera z');
  close(followed.canvas.camera.yaw, 0.4, 'setCamera yaw');
}

function checkChromeContract() {
  const box = new Engine({ width: 80, height: 60, antialias: false });
  const ui = Utilities.wrap(box.canvas, { title: 'Witch Hunt' });
  document.body.appendChild(ui.wrap);
  const middle = ui.headerMiddle;
  const header = middle?.parentElement ?? null;
  if (!middle || !header || !ui.footer) fail('wrap is missing headerMiddle or footer');
  const parts = Array.from(header.children);
  if (parts.length !== 3) fail('header must hold title, middle, and fullscreen');
  if (textOf(parts[0]) !== 'Witch Hunt') fail('title');
  if (parts[1] !== middle) fail('headerMiddle is not the center slot');
  if (parts[2]?.tagName.toUpperCase() !== 'BUTTON') fail('fullscreen button');
  if (ui.footer.tagName.toUpperCase() !== 'DIV') fail('footer must be a plain div');
  if (box.canvas.element.parentElement !== ui.wrap) fail('canvas was not wrapped');
  const column = Array.from(ui.wrap.children).map((node) => node.tagName.toUpperCase());
  if (column.join(',') !== 'HEADER,CANVAS,DIV') fail(`wrap order ${column.join(',')}`);
  ui.setTitle('Night Hunt');
  if (textOf(parts[0]) !== 'Night Hunt') fail('setTitle');
  ui.setTitle('Witch Hunt');
  const button = parts[2];
  expect(textOf(button), 'F11 Fullscreen', 'fullscreen label');
  if (typeof button.click === 'function') button.click();
  expect(textOf(button), 'Esc Exit', 'label while fullscreen');
  const again = Utilities.wrap(box, { title: 'Already' });
  const againButton = again.headerMiddle?.parentElement?.children?.[2];
  expect(textOf(againButton), 'Esc Exit', 'wrap opened during fullscreen');
  if (typeof button.click === 'function') button.click();
  expect(textOf(button), 'F11 Fullscreen', 'label after leaving fullscreen');
  expect(textOf(againButton), 'F11 Fullscreen', 'other wrap heard the exit');
  const bare = Utilities.wrap(box.canvas.element, { header: false, footer: false });
  if (bare.headerMiddle || bare.footer) fail('omitted bars');
}

function checkTerminal() {
  const term = new Terminal({ cols: 36, rows: 4, cellWidth: 12, cellHeight: 18 });
  term.write('Witch Hunt\n');
  term.write('A hunter crosses the heath.');
  if (line(term, 0) !== 'Witch Hunt') fail(`row 0: ${line(term, 0)}`);
  if (line(term, 1) !== 'A hunter crosses the heath.') fail(`row 1: ${line(term, 1)}`);
  expect(String(term.get(0, 0).fg), '15', 'plain fg');
  expect(String(term.get(0, 0).bg), 'null', 'plain bg');

  const wrapped = new Terminal({ cols: 4, rows: 2 });
  wrapped.write('abcdefgh');
  expect(raw(wrapped, 0), 'efgh', 'wrap scroll');
  expect(`${wrapped.cursor.col},${wrapped.cursor.row}`, '0,1', 'cursor after wrap scroll');
  wrapped.clear();
  wrapped.write('ab\ncd\nef');
  expect(raw(wrapped, 0), 'cd  ', 'newline scroll');
  expect(raw(wrapped, 1).slice(0, 2), 'ef', 'newline scroll bottom');

  const pen = new Terminal({ cols: 8, rows: 1 });
  pen.write('\x1b[1;31mZ');
  expect(String(pen.get(0, 0).fg), '1', 'sgr fg');
  expect(String(pen.get(0, 0).bright), 'true', 'sgr bright');
  expect(String(pen.get(0, 0).bold), 'true', 'sgr bold');
  pen.write('\x1b[0m\x1b[91mY');
  expect(String(pen.get(1, 0).fg), '9', 'bright red index');
  expect(String(pen.bright), 'false', 'aixterm color is not the bright flag');
  pen.write('\x1b[0m\x1b[2;3HX');
  expect(pen.get(2, 0).ch, 'X', 'cup');
  pen.clear();
  pen.write('A\x1b]0;Witch\x07B');
  expect(raw(pen, 0).trimEnd(), 'AB', 'osc is discarded');
  pen.clear();
  pen.write('A\x1b[?25lB');
  expect(raw(pen, 0).trimEnd(), 'AB', 'private sequence is ignored');
  pen.write('\x1bc');
  expect(pen.get(0, 0).ch, ' ', 'reset clears');
  expect(String(pen.fg), '15', 'reset restores the pen');

  const shared = new Engine({ width: 64, height: 64, antialias: false });
  const glass = new Terminal({ cols: 8, rows: 2, canvas: shared.canvas });
  if (glass.canvas !== shared.canvas) fail('terminal must draw on the engine canvas');
  shared.canvas.setCamera(40, 3, -8, 1, 0.2);
  glass.write('W');
  expect(glass.get(0, 0).ch, 'W', 'camera left the cell');

  const batched = new Terminal({ cols: 8, rows: 2 });
  let draws = 0;
  const draw = batched.canvas.draw.bind(batched.canvas);
  batched.canvas.draw = () => {
    draws += 1;
    draw();
  };
  batched.beginFrame();
  const parked = draws;
  batched.write('A');
  batched.write('\x1b[31mB');
  if (draws !== parked) fail('batched writes drew early');
  batched.endFrame();
  if (draws !== parked + 1) fail('outer endFrame draws once');
  expect(String(batched.get(1, 0).fg), '1', 'batched color');
}

function checkSolids() {
  const world = new Engine({ width: 64, height: 64, antialias: false });
  const wall = world.box(0, 0, 0, 1, 2, 4, '#888888');
  wall.yaw = Math.PI / 2;
  const body = world.sprite('o', 0, 0, 1, 0.6);
  world.motion(body, 0, 0, -0.4);
  let hits = 0;
  world.onCollision(() => {
    hits += 1;
  });
  world.update();
  close(body.z, 0.8, 'solid push');
  expect(String(hits), '0', 'solid reported a hit');

  wall.sensor = true;
  body.z = 1;
  body.vz = -0.4;
  world.update();
  close(body.z, 0.6, 'sensor moved the sprite');
  expect(String(hits), '1', 'sensor overlap');

  const pit = new Engine({ width: 32, height: 32, antialias: false });
  pit.box(0, 0, 0, 2, 2, 2, '#ffffff');
  const lost = pit.sprite('x', 0, 0, 0, 0.4);
  pit.update();
  const out = Math.hypot(lost.x, lost.y, lost.z);
  if (out < 1.1) fail(`sprite stayed inside a solid (${out})`);

  const heath = new Engine({ width: 32, height: 32, antialias: false });
  heath.box(0, -0.15, 0, 40, 0.3, 40, '#3d5c3a');
  const standing = heath.sprite('🧙‍♀️', 0, 0.6, 0, 1.2);
  heath.update();
  close(standing.y, 0.6, 'resting on the ground');
}

function checkCollision() {
  const { box, a, b } = pairBox(0, 0, 0, 1.0);
  const hits = [];
  const off = box.onCollision((left, right) => hits.push(left.emoji + right.emoji));
  box.update();
  expect(hits.join(','), 'AB', 'exact contact');
  b.z = 1.01;
  hits.length = 0;
  box.update();
  expect(hits.join(','), '', 'separated by a sliver');
  b.z = 2;
  box.motion(b, 0, 0, -1);
  box.update();
  expect(hits.join(','), 'AB', 'move into contact');
  close(b.z, 1, 'velocity applied');
  a.alive = false;
  a.vz = 1;
  b.z = a.z;
  b.vz = 0;
  hits.length = 0;
  box.update();
  expect(hits.join(','), '', 'dead sprite collided');
  close(a.z, 0, 'dead sprite moved');
  off();

  const order = new Engine({ width: 32, height: 32, antialias: false });
  order.sprite('R', 1, 0, 0, 1);
  order.sprite('L', 0, 0, 0, 1);
  let pair = '';
  order.onCollision((first, second) => {
    pair += first.emoji + second.emoji;
  });
  order.canvas.setCamera(9, 4, -6, 1, 0);
  order.update();
  expect(pair, 'RL', 'creation order');

  const crowd = new Engine({ width: 32, height: 32, antialias: false });
  crowd.sprite('A', 0, 0, 0, 1);
  crowd.sprite('B', 0, 0, 0, 1);
  const far = crowd.sprite('C', 8, 0, 0, 1);
  let count = 0;
  crowd.onCollision(() => {
    count += 1;
    far.x = 0;
  });
  crowd.update();
  expect(String(count), '1', 'pairs fixed before callbacks');
  crowd.update();
  expect(String(count), '4', 'next update sees the moved sprite');

  const again = new Engine({ width: 32, height: 32, antialias: false });
  again.sprite('A', 0, 0, 0, 1);
  again.sprite('B', 0, 0, 0, 1);
  let calls = 0;
  const fn = () => {
    calls += 1;
  };
  const off1 = again.onCollision(fn);
  const off2 = again.onCollision(fn);
  off2();
  again.update();
  expect(String(calls), '1', 'unsubscribe removed one registration');
  off1();
  again.update();
  expect(String(calls), '1', 'remaining registration removed');

  const nested = new Engine({ width: 32, height: 32, antialias: false });
  nested.sprite('A', 0, 0, 0, 1);
  nested.sprite('B', 0, 0, 0, 1);
  nested.onCollision(() => {
    try {
      nested.update();
      fail('nested update should throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('collision handler')) fail(message);
    }
  });
  nested.update();
  nested.update();

  const weird = new Engine({ width: 32, height: 32, antialias: false });
  weird.sprite('P', Number.NaN, 0, 0, 1);
  weird.sprite('Q', 0, 0, 0, 1);
  let weirdHits = 0;
  weird.onCollision(() => {
    weirdHits += 1;
  });
  weird.update();
  expect(String(weirdHits), '0', 'non-finite position');
  weird.canvas.draw();
}

function pairBox(az, bz) {
  const box = new Engine({ width: 32, height: 32, antialias: false });
  const a = box.sprite('A', 0, 0, az, 1);
  const b = box.sprite('B', 0, 0, bz, 1);
  return { box, a, b };
}

function expect(actual, expected, label) {
  if (actual !== expected) fail(`${label}: ${actual}`);
}

function close(actual, expected, label) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-4) {
    fail(`${label}: ${actual} wanted ${expected}`);
  }
}

function textOf(node) {
  return node?.textContent ?? '';
}

function line(terminal, row) {
  return raw(terminal, row).trimEnd();
}

function raw(terminal, row) {
  let text = '';
  for (let col = 0; col < terminal.cols; col += 1) text += terminal.get(col, row).ch;
  return text;
}

function fail(message) {
  console.error(`demo failed: ${message}`);
  exit(1);
}

function exit(code) {
  const proc = globalThis.process;
  if (proc) proc.exit(code);
  throw new Error(`demo exit ${code}`);
}
