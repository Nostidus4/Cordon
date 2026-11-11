// The cue library: one function per sound. Toy palette (soft mallets, wooden clicks, gentle chimes, soft thumps); nothing harsh.
// Each cue goes through engine.play(): rate limit per cue, polyphony cap, ambient ducking, no-op until the first user gesture.
import { engine } from "./engine";

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
/** C-major pentatonic ladder (midi): never dissonant, whatever order cues land in. */
const PENTA = [67, 69, 72, 74, 76, 79, 81, 84];

type Delay = { delay?: number };
const E = engine;

/** Marimba / kalimba pluck: a sine + a short bright overtone + a tiny wooden tick. */
function mallet(f: number, t: number, g = 0.2, dur = 0.5) {
  E.tone({ f, t, dur, gain: g, a: 0.003 });
  E.tone({ f: f * 3.98, t, dur: dur * 0.22, gain: g * 0.35, a: 0.002 });
  E.noise({ t, dur: 0.02, gain: g * 0.18, type: "bandpass", f: 3200, q: 1.5 });
}
/** Gentle chime / bell: inharmonic partials, slow decay. */
function bell(f: number, t: number, g = 0.15, dur = 1.1) {
  E.tone({ f, t, dur, gain: g, a: 0.004 });
  E.tone({ f: f * 2.76, t, dur: dur * 0.4, gain: g * 0.3, a: 0.004 });
  E.tone({ f: f * 5.4, t, dur: dur * 0.15, gain: g * 0.12, a: 0.004 });
}
const thunk = (t: number, g = 0.5) => {
  E.tone({ f: 130, to: 52, glide: 0.12, t, dur: 0.24, gain: g, a: 0.003 });
  E.noise({ t, dur: 0.06, gain: g * 0.5, type: "lowpass", f: 420 });
};
const rollTicks = (t: number, dur: number, count: number, dir: "up" | "down") => {
  for (let i = 0; i < count; i++) {
    const f = dir === "up" ? 700 + i * 55 : 1500 - i * 75;
    E.tone({ f: Math.max(260, f), t: t + (i * dur) / count, dur: 0.035, gain: 0.07, type: "triangle", a: 0.002 });
  }
};
const alarm = (t: number, g: number) => {
  E.tone({ f: 659, t, dur: 0.22, gain: g, type: "triangle", a: 0.02, lp: 1800 });
  E.tone({ f: 523, t: t + 0.24, dur: 0.3, gain: g, type: "triangle", a: 0.02, lp: 1800 });
};

export const sfx = {
  // ------------------------------------------------------------ UI
  click: () => E.play("click", { dur: 0.1, gap: 40 }, (t) => {
    E.tone({ f: 880, to: 520, glide: 0.05, t, dur: 0.07, gain: 0.2, a: 0.002 });
    E.noise({ t, dur: 0.03, gain: 0.12, f: 2600, q: 2 });
  }),
  tick: () => E.play("tick", { dur: 0.05, gap: 90, duck: false }, (t) => E.tone({ f: 1900, t, dur: 0.03, gain: 0.07, a: 0.002 })),
  pop: (o: Delay = {}) => E.play("pop", { dur: 0.16, gap: 110, ...o }, (t) => {
    E.tone({ f: 330, to: 720, glide: 0.08, t, dur: 0.14, gain: 0.2, a: 0.004 });
    E.tone({ f: 990, t: t + 0.03, dur: 0.08, gain: 0.05, a: 0.004 });
  }),
  /** scene change; dir -1 = going back (falls instead of rises) */
  whoosh: (dir: 1 | -1 = 1) => E.play("whoosh", { dur: 0.45, gap: 150 }, (t) => {
    E.noise({ t, dur: 0.4, gain: 0.2, a: 0.12, f: dir > 0 ? 450 : 2200, fTo: dir > 0 ? 2300 : 450, q: 1.1 });
    E.tone({ f: dir > 0 ? 260 : 420, to: dir > 0 ? 420 : 260, glide: 0.35, t, dur: 0.38, gain: 0.04, a: 0.1 });
  }),

  // ------------------------------------------------------------ loading / assembly
  /** The island rises out of the water: low swell, soft drum roll, water "shhh", splash. ~1.6 s */
  islandRise: (o: Delay = {}) => E.play("islandRise", { dur: 1.7, force: true, gap: 500, ...o }, (t) => {
    E.tone({ f: 62, to: 150, glide: 1.3, t, dur: 1.5, gain: 0.2, a: 0.9 });
    E.tone({ f: 124, to: 300, glide: 1.3, t, dur: 1.5, gain: 0.07, a: 0.9, type: "triangle", lp: 700 });
    E.noise({ t, dur: 1.5, gain: 0.2, a: 0.8, type: "bandpass", f: 500, fTo: 2600, q: 0.5 }); // water "shhh"
    // soft drum roll: speeds up and swells
    for (let i = 0, at = 0; i < 14; i++) {
      const g = 0.1 + (i / 14) * 0.17;
      E.tone({ f: 118, to: 66, glide: 0.07, t: t + 0.1 + at, dur: 0.14, gain: g, a: 0.003 });
      E.noise({ t: t + 0.1 + at, dur: 0.03, gain: g * 0.35, type: "lowpass", f: 500 });
      at += 0.1 - i * 0.004;
    }
    // splash as the island breaks the surface
    E.noise({ t: t + 0.85, dur: 0.45, gain: 0.15, a: 0.01, type: "highpass", f: 1800, fTo: 700, q: 0.7 });
    E.noise({ t: t + 0.85, dur: 0.2, gain: 0.12, a: 0.01, type: "lowpass", f: 900 });
  }),
  /** Layered pop of building `i` (0..7): wooden thump + spring boing + marimba/bell note. Notes climb the pentatonic scale and end on the tonic. `pan` -1..1 */
  buildingPop: (i: number, pan = 0, o: Delay = {}) => E.play(`bpop${i}`, { dur: 0.7, gap: 30, force: true, ...o }, (t) => {
    const m = PENTA[Math.min(i, PENTA.length - 1)], f = hz(m);
    E.tone({ f: 150, to: 62, glide: 0.09, t, dur: 0.2, gain: 0.3, a: 0.003, pan });
    E.noise({ t, dur: 0.05, gain: 0.12, type: "lowpass", f: 700, pan });
    E.tone({ f: f * 0.72, to: f, glide: 0.07, t: t + 0.02, dur: 0.34, gain: 0.13, a: 0.003, pan });
    const last = i >= PENTA.length - 1;
    E.tone({ f: f * 2, t: t + 0.05, dur: last ? 0.9 : 0.5, gain: last ? 0.15 : 0.1, a: 0.003, pan });
    E.tone({ f: f * 2 * 3.98, t: t + 0.05, dur: 0.1, gain: 0.03, a: 0.002, pan });
    if (last) E.tone({ f: f * 4, t: t + 0.05, dur: 0.8, gain: 0.05, a: 0.003, pan });
  }),
  /** trees / lamps / flowers / boats sprouting: quick light arpeggio, `k` = cluster 0..3 shifts the start note */
  sprout: (k = 0, o: Delay = {}) => E.play(`sprout${k}`, { dur: 0.4, gap: 40, duck: false, force: true, ...o }, (t) => {
    for (let j = 0; j < 4; j++) E.tone({ f: hz(PENTA[(k + j) % 6] + 24), t: t + j * 0.04, dur: 0.18, gain: 0.04, a: 0.002, pan: (k - 1.5) * 0.35 });
  }),
  sparkle: (o: Delay = {}) => E.play("sparkle", { dur: 0.7, gap: 160, duck: false, force: true, ...o }, (t) => {
    [2093, 2637, 3136, 3951].forEach((f, k) => E.tone({ f: f * (k % 2 ? 1 : 1.002), t: t + k * 0.055, dur: 0.28, gain: 0.05, a: 0.003 }));
  }),
  /** lamps switch on: night = shimmering ascending cascade, day = warm brass-like swell. ~1.1 s */
  lightsOn: (night: boolean, o: Delay = {}) => E.play("lightsOn", { dur: 1.3, force: true, gap: 500, ...o }, (t) => {
    if (night) {
      PENTA.forEach((m, k) => {
        const pan = (k / 7 - 0.5) * 0.9;
        E.tone({ f: hz(m + 12), t: t + k * 0.06, dur: 0.4, gain: 0.08, a: 0.004, pan });
        E.tone({ f: hz(m + 12) * 1.004, t: t + k * 0.06, dur: 0.4, gain: 0.05, a: 0.004, pan: -pan });
      });
      E.noise({ t, dur: 0.9, gain: 0.05, a: 0.4, type: "highpass", f: 6000, q: 0.5 });
    } else {
      [60, 64, 67, 72].forEach((m, k) => E.tone({ f: hz(m), t: t + k * 0.03, dur: 1.15, gain: 0.06, a: 0.45, type: "sawtooth", lp: 350, lpTo: 1800 }));
      E.tone({ f: hz(48), t, dur: 1.1, gain: 0.1, a: 0.4 });
    }
  }),
  /** "Xong!": bright C major chord + a soft cymbal / chime shimmer */
  done: (o: Delay = {}) => E.play("done", { dur: 1.6, force: true, gap: 500, ...o }, (t) => {
    [72, 76, 79, 84].forEach((m, k) => mallet(hz(m), t + k * 0.035, 0.14, 1));
    E.tone({ f: hz(96), t: t + 0.05, dur: 1.2, gain: 0.05, a: 0.004 });
    E.tone({ f: hz(103), t: t + 0.12, dur: 1.2, gain: 0.04, a: 0.004 });
    E.noise({ t, dur: 1.4, gain: 0.07, a: 0.02, type: "highpass", f: 7000, q: 0.4 });
  }),

  // ------------------------------------------------------------ scene 1
  flag: () => E.play("flag", { dur: 1, gap: 400 }, (t) => bell(1318.5, t, 0.16, 1)),
  /** (hover tick is `tick`) */

  // ------------------------------------------------------------ scene 2
  /** low pulse per spread step; pitch rises as red spreads (step 0.. of `total`) */
  spreadPulse: (step: number, total: number) => E.play("spreadPulse", { dur: 0.3, gap: 120 }, (t) => {
    const f = 98 * Math.pow(2, (Math.min(step, Math.max(total, 1)) * 0.9) / 12);
    E.tone({ f: f * 1.6, to: f, glide: 0.07, t, dur: 0.26, gain: 0.34, a: 0.004 });
    E.tone({ f: f * 2, t, dur: 0.14, gain: 0.07, type: "triangle", a: 0.004 });
  }),
  /** rolling counter: `count` soft ticks spread over `dur` seconds, rising (number climbing) or falling (slot machine) */
  rollTicks: (dur: number, dir: "up" | "down" = "up", count = 6) => {
    const n = Math.max(2, Math.min(12, Math.round(count)));
    E.play("rollTicks", { dur: dur + 0.1, gap: 220, duck: false }, (t) => rollTicks(t, dur, n, dir));
  },
  /** assistant is "typing": short soft blips for `dur` seconds */
  typing: (dur = 0.7) => E.play("typing", { dur: dur + 0.1, gap: 300, duck: false }, (t) => {
    const n = Math.max(3, Math.min(10, Math.round(dur / 0.07)));
    for (let i = 0; i < n; i++) E.tone({ f: 620 + ((i * 97) % 5) * 70, t: t + i * 0.07 + (i % 3) * 0.01, dur: 0.035, gain: 0.05, type: "triangle", a: 0.002 });
  }),
  reveal: () => E.play("reveal", { dur: 0.9, gap: 300 }, (t) => { bell(hz(88), t, 0.11, 0.7); bell(hz(93), t + 0.11, 0.12, 0.9); }),

  // ------------------------------------------------------------ scene 3
  /** n = 0,1,2: how many approvals so far (pluck climbs) */
  approve: (n = 0) => E.play("approve", { dur: 0.7, gap: 150 }, (t) => {
    thunk(t, 0.45);
    mallet(hz([76, 79, 84][Math.min(n, 2)]), t + 0.09, 0.2, 0.6);
  }),
  stamp: () => E.play("stamp", { dur: 0.3, gap: 150 }, (t) => thunk(t, 0.5)),
  execute: (o: Delay = {}) => E.play("execute", { dur: 0.9, gap: 400, ...o }, (t) => {
    [72, 76, 79, 84, 88].forEach((m, k) => mallet(hz(m), t + k * 0.07, 0.14, 0.55));
  }),
  keysFly: (count = 5, o: Delay = {}) => E.play("keysFly", { dur: 1, gap: 400, ...o }, (t) => {
    E.noise({ t, dur: 0.35, gain: 0.16, a: 0.1, f: 500, fTo: 3200, q: 1.2 });
    for (let i = 0; i < count; i++) {
      const tt = t + 0.34 + i * 0.09;
      E.tone({ f: 320 - i * 12, to: 210, glide: 0.05, t: tt, dur: 0.09, gain: 0.16, a: 0.002 });
      E.noise({ t: tt, dur: 0.025, gain: 0.07, type: "lowpass", f: 700 });
    }
  }),
  gateChime: (o: Delay = {}) => E.play("gateChime", { dur: 1.5, gap: 600, ...o }, (t) => {
    bell(1046.5, t, 0.14, 1.4); bell(1568, t + 0.1, 0.11, 1.3); bell(2093, t + 0.2, 0.08, 1.2);
  }),

  // ------------------------------------------------------------ scene 4
  coin: (rich = false) => E.play(rich ? "coinRich" : "coin", { dur: 0.45, gap: 60 }, (t) => {
    E.tone({ f: 2349, t, dur: 0.28, gain: 0.12, a: 0.002 });
    E.tone({ f: 3136, t: t + 0.06, dur: 0.34, gain: 0.12, a: 0.002 });
    E.tone({ f: 6500, t, dur: 0.06, gain: 0.03, a: 0.002 });
    if (rich) E.tone({ f: 4186, t: t + 0.13, dur: 0.4, gain: 0.07, a: 0.002 });
  }),
  alarm: () => E.play("alarm", { dur: 0.7, gap: 600 }, (t) => alarm(t, 0.14)),
  /** reverted by policy: muted buzzer + a small bounce */
  bonk: () => E.play("bonk", { dur: 0.45, gap: 120 }, (t) => {
    E.tone({ f: 165, to: 105, glide: 0.15, t, dur: 0.22, gain: 0.24, type: "sawtooth", lp: 520, a: 0.005 });
    E.tone({ f: 90, t, dur: 0.16, gain: 0.2, a: 0.003 });
    E.tone({ f: 240, to: 340, glide: 0.08, t: t + 0.17, dur: 0.12, gain: 0.08, a: 0.004 });
  }),
  /** shared district cap hit: the gate clangs */
  clang: () => E.play("clang", { dur: 0.9, gap: 250 }, (t) => {
    [[330, 0.12], [521, 0.1], [818, 0.07], [1254, 0.04]].forEach(([f, g]) => E.tone({ f, t, dur: 0.7, gain: g, a: 0.002 }));
    E.noise({ t, dur: 0.05, gain: 0.14, f: 1800, q: 0.8 });
  }),
  /** "Khoá khu": tape stretch, heavy chunk, sirens fading away */
  lock: () => E.play("lock", { dur: 2, force: true, gap: 800 }, (t) => {
    E.noise({ t, dur: 0.5, gain: 0.16, a: 0.15, f: 700, fTo: 3400, q: 1.5 });
    thunk(t + 0.52, 0.65);
    E.noise({ t: t + 0.52, dur: 0.02, gain: 0.2, f: 2200, q: 1 });
    alarm(t + 0.8, 0.08); alarm(t + 1.4, 0.035);
  }),
  /** blocked at protocol: a dull "pff" */
  fizzle: () => E.play("fizzle", { dur: 0.4, gap: 200 }, (t) => {
    E.noise({ t, dur: 0.32, gain: 0.12, a: 0.01, type: "highpass", f: 2800, fTo: 900, q: 0.6 });
    E.tone({ f: 300, to: 80, glide: 0.25, t, dur: 0.28, gain: 0.07, a: 0.004 });
  }),

  // ------------------------------------------------------------ scene 5
  nope: () => E.play("nope", { dur: 0.35, gap: 200 }, (t) => {
    E.tone({ f: 392, to: 340, glide: 0.07, t, dur: 0.1, gain: 0.16, a: 0.003 });
    E.tone({ f: 370, to: 300, glide: 0.07, t: t + 0.12, dur: 0.12, gain: 0.16, a: 0.003 });
  }),
  caution: () => E.play("caution", { dur: 1, gap: 700 }, (t) => { bell(hz(81), t, 0.12, 0.7); bell(hz(75), t + 0.16, 0.12, 0.9); }),

  // ------------------------------------------------------------ day / night
  nightSwell: () => E.play("nightSwell", { dur: 1.6, gap: 900 }, (t) => {
    E.tone({ f: 420, to: 370, glide: 0.25, t, dur: 0.4, gain: 0.1, a: 0.08, lp: 900 });
    E.tone({ f: 400, to: 340, glide: 0.3, t: t + 0.5, dur: 0.5, gain: 0.09, a: 0.08, lp: 900 });
    for (let i = 0; i < 6; i++) E.tone({ f: 4300, t: t + 0.2 + i * 0.075, dur: 0.05, gain: 0.015 + i * 0.006, a: 0.01 });
  }),
  daySwell: () => E.play("daySwell", { dur: 1.3, gap: 900 }, (t) => {
    [0, 0.28, 0.62].forEach((d, k) => {
      const b = 2700 + k * 350;
      for (let i = 0; i < 2; i++) E.tone({ f: b, to: b * 1.3, glide: 0.06, t: t + d + i * 0.1, dur: 0.09, gain: 0.07, a: 0.004 });
    });
  }),
};

export type CueId = keyof typeof sfx;

/** Every cue, for the /_sound audition page. */
export const CUES: { id: string; group: string; label: string; play: () => void }[] = [
  { id: "intro", group: "Intro: dựng thành phố", label: "Intro: dựng thành phố (cả chuỗi, ~3 giây)", play: () => playIntro(false) },
  { id: "introNight", group: "Intro: dựng thành phố", label: "Intro: dựng thành phố (bật đèn ban đêm)", play: () => playIntro(true) },
  { id: "click", group: "UI", label: "Bấm nút (click gỗ)", play: () => sfx.click() },
  { id: "tick", group: "UI", label: "Rê vào ghim (tick)", play: () => sfx.tick() },
  { id: "pop", group: "UI", label: "Thẻ hiện ra (pop)", play: () => sfx.pop() },
  { id: "whoosh+", group: "UI", label: "Chuyển cảnh tới (whoosh)", play: () => sfx.whoosh(1) },
  { id: "whoosh-", group: "UI", label: "Chuyển cảnh lùi (whoosh)", play: () => sfx.whoosh(-1) },
  { id: "islandRise", group: "Dựng thành phố", label: "Đảo nổi lên (sóng dâng)", play: () => sfx.islandRise() },
  ...[0, 3, 7].map((i) => ({ id: `bpop${i}`, group: "Dựng thành phố", label: `Tòa nhà ${i + 1}/8 bật lên (thump + boing + nốt)`, play: () => sfx.buildingPop(i, (i / 7 - 0.5) * 1.2) })),
  { id: "boings", group: "Dựng thành phố", label: "Cả 8 tòa nhà lần lượt", play: () => { for (let i = 0; i < 8; i++) sfx.buildingPop(i, (i / 7 - 0.5) * 1.2, { delay: i * 0.13 }); } },
  { id: "sprout", group: "Dựng thành phố", label: "Cây, đèn, hoa, thuyền nhú lên", play: () => { for (let k = 0; k < 4; k++) sfx.sprout(k, { delay: k * 0.14 }); } },
  { id: "sparkle", group: "Dựng thành phố", label: "Lấp lánh", play: () => sfx.sparkle() },
  { id: "lightsNight", group: "Dựng thành phố", label: "Bật đèn ban đêm", play: () => sfx.lightsOn(true) },
  { id: "lightsDay", group: "Dựng thành phố", label: "Bật đèn ban ngày", play: () => sfx.lightsOn(false) },
  { id: "done", group: "Dựng thành phố", label: "Xong! (hợp âm)", play: () => sfx.done() },
  { id: "flag", group: "① Nhìn", label: "Cờ vàng xuất hiện (ding)", play: () => sfx.flag() },
  { id: "spread", group: "② Thử", label: "Đỏ lan 6 bước (nhịp trầm)", play: () => { for (let i = 0; i < 6; i++) setTimeout(() => sfx.spreadPulse(i, 6), i * 300); } },
  { id: "rollUp", group: "② Thử", label: "Số đếm tăng (tick lên)", play: () => sfx.rollTicks(0.9, "up", 9) },
  { id: "typing", group: "② Thử", label: "Trợ lý gõ chữ", play: () => sfx.typing(0.8) },
  { id: "reveal", group: "② Thử", label: "Trợ lý trả lời (chime)", play: () => sfx.reveal() },
  { id: "approve1", group: "③ Sửa", label: "Duyệt lần 1 (đóng dấu + pluck)", play: () => sfx.approve(0) },
  { id: "approve2", group: "③ Sửa", label: "Duyệt lần 2", play: () => sfx.approve(1) },
  { id: "execute", group: "③ Sửa", label: "Thực thi (arpeggio trưởng)", play: () => sfx.execute() },
  { id: "keysFly", group: "③ Sửa", label: "Thẻ bay vào hàng rào", play: () => sfx.keysFly() },
  { id: "gateChime", group: "③ Sửa", label: "Cổng chung hiện ra (chuông vàng)", play: () => sfx.gateChime() },
  { id: "coin", group: "④ Sự cố", label: "Giao dịch OK (coin clink)", play: () => sfx.coin() },
  { id: "coinRich", group: "④ Sự cố", label: "Trợ lý đổi tiền buổi sáng", play: () => sfx.coin(true) },
  { id: "alarm", group: "④ Sự cố", label: "Kẻ gian bắt đầu (báo động 2 nốt)", play: () => sfx.alarm() },
  { id: "bonk", group: "④ Sự cố", label: "Bị chính sách chặn (bonk)", play: () => sfx.bonk() },
  { id: "clang", group: "④ Sự cố", label: "Chạm cổng chung (clang)", play: () => sfx.clang() },
  { id: "lock", group: "④ Sự cố", label: "Khoá khu (băng + khoá + còi tắt dần)", play: () => sfx.lock() },
  { id: "fizzle", group: "④ Sự cố", label: "Chặn ở chain (pff)", play: () => sfx.fizzle() },
  { id: "rollDown", group: "④ Sự cố", label: "Số bên trái tăng tới 100.000 (tick xuống)", play: () => sfx.rollTicks(0.9, "down", 9) },
  { id: "nope", group: "⑤ Xin quyền", label: "Nút của Huy bị khoá (nope)", play: () => sfx.nope() },
  { id: "caution", group: "⑤ Xin quyền", label: "Thẻ cảnh báo (chime)", play: () => sfx.caution() },
  { id: "nightSwell", group: "Ngày / đêm", label: "Sang đêm (cú + dế)", play: () => sfx.nightSwell() },
  { id: "daySwell", group: "Ngày / đêm", label: "Sang ngày (chim hót)", play: () => sfx.daySwell() },
];

/** The whole city-assembly sequence on a fixed schedule, mirroring what the director derives from the assembly timeline (for /_sound). */
export function playIntro(night: boolean) {
  sfx.islandRise();
  for (let i = 0; i < 8; i++) sfx.buildingPop(i, (i / 7 - 0.5) * 1.2, { delay: 0.55 + i * 0.12 });
  for (let k = 0; k < 4; k++) sfx.sprout(k, { delay: 0.7 + k * 0.14 });
  sfx.sparkle({ delay: 1.0 });
  sfx.lightsOn(night, { delay: 1.75 });
  sfx.done({ delay: 2.65 });
}
