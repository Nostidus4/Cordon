// Vault model diagram (spec §10.7, §6.8): Safe 3/5 on C-Chain -> (simulated top-up) -> PolicyVault on Guardian L1, Council on top.
import { motion } from "framer-motion";
import { VAULT_MODEL as V } from "./content";

const FONT = "var(--font-sans)";
const T = ({ x, y, size = 14, w = 500, fill = "#eceefe", anchor = "start", children, op = 1 }: { x: number; y: number; size?: number; w?: number; fill?: string; anchor?: "start" | "middle" | "end"; children: React.ReactNode; op?: number }) => (
  <text x={x} y={y} fontSize={size} fontWeight={w} fill={fill} textAnchor={anchor} fontFamily={FONT} opacity={op}>{children}</text>
);
const TONE = { warn: { s: "#ffbf3c", f: "rgb(255 191 60 / 0.10)" }, ok: { s: "#34e0b4", f: "rgb(52 224 180 / 0.12)" }, info: { s: "#8b7cf6", f: "rgb(139 124 246 / 0.12)" }, dashed: { s: "#9aa3c4", f: "transparent" } };

export interface LiveTile { name: string; l1: string; l2: string; tone: "ok" | "warn" | "info" | "dashed" }
export function VaultDiagram({ main, vault, tiles, policyVersion }: { main: string; vault: string; tiles: LiveTile[]; policyVersion?: number }) {
  const tileX = [470, 624, 778, 932];
  return (
    <svg viewBox="0 0 1120 430" role="img" aria-label="Quỹ chính Safe 3/5 trên C-Chain nạp mô phỏng vào kho chi tiêu PolicyVault trên Guardian L1, do Hội đồng 2/3 quản trị" className="h-auto w-full">
      <defs>
        <linearGradient id="gv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b7cf6" /><stop offset="1" stopColor="#4cc9f0" /></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>

      {/* chain panels */}
      <rect x="16" y="24" width="300" height="382" rx="22" fill="rgb(20 26 66 / 0.5)" stroke="rgb(148 160 255 / 0.2)" />
      <rect x="440" y="24" width="664" height="382" rx="22" fill="rgb(20 26 66 / 0.5)" stroke="rgb(139 124 246 / 0.5)" />
      <T x={40} y={56} size={12} w={700} fill="#8189b4">{V.main.chain.toUpperCase()}</T>
      <T x={464} y={56} size={12} w={700} fill="#b4a9ff">{V.vault.chain.toUpperCase()}</T>

      {/* Safe */}
      <rect x="46" y="118" width="240" height="190" rx="18" fill="rgb(24 30 74 / 0.9)" stroke="rgb(148 160 255 / 0.35)" />
      <rect x="66" y="138" width="40" height="40" rx="11" fill="rgb(148 160 255 / 0.15)" />
      <path d="M78 156v-5a8 8 0 0 1 16 0v5m-19 0h22a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-22a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z" transform="translate(-1 -3)" fill="none" stroke="#aab1d6" strokeWidth="2" strokeLinecap="round" />
      <T x={118} y={156} size={20} w={700}>{V.main.name}</T>
      <T x={118} y={176} size={13} fill="#aab1d6">{V.main.role}</T>
      <T x={66} y={236} size={34} w={800}>{main}</T>
      <T x={66} y={258} size={13} fill="#8189b4">{V.main.token} · trong Safe</T>
      <T x={66} y={288} size={11.5} fill="#8189b4">{V.main.sub}</T>

      {/* top-up flow */}
      <path id="topup" d="M286 200 C 370 200, 390 170, 470 170" fill="none" stroke="rgb(148 160 255 / 0.25)" strokeWidth="2" />
      <motion.path d="M286 200 C 370 200, 390 170, 470 170" fill="none" stroke="url(#gv)" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 12"
        animate={{ strokeDashoffset: [0, -64] }} transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }} filter="url(#glow)" />
      <polygon points="470,170 458,163 458,177" fill="#4cc9f0" />
      <rect x="326" y="212" width="104" height="26" rx="13" fill="rgb(183 155 255 / 0.14)" stroke="rgb(183 155 255 / 0.5)" strokeDasharray="4 3" />
      <T x={378} y={229} size={12} w={600} fill="#b79bff" anchor="middle">{V.topup.label}</T>
      <T x={378} y={256} size={11} fill="#8189b4" anchor="middle">{V.topup.chip}</T>

      {/* council */}
      <rect x="470" y="78" width="604" height="30" rx="15" fill="rgb(139 124 246 / 0.14)" stroke="rgb(139 124 246 / 0.5)" />
      {V.council.members.map((m, i) => (
        <g key={m}><circle cx={492 + i * 26} cy="93" r="10" fill="rgb(139 124 246 / 0.5)" stroke="#0b1030" strokeWidth="2" /><T x={492 + i * 26} y={97} size={11} w={700} anchor="middle">{m[0]}</T></g>
      ))}
      <T x={582} y={98} size={13} w={600} fill="#d6d1ff">{V.council.name}</T>
      <T x={1058} y={98} size={12.5} fill="#b4a9ff" anchor="end">{V.council.rule}</T>
      <path d="M772 108 V 128" stroke="rgb(139 124 246 / 0.6)" strokeWidth="2" strokeDasharray="3 4" />

      {/* vault */}
      <rect x="470" y="128" width="604" height="84" rx="18" fill="rgb(24 30 74 / 0.95)" stroke="url(#gv)" strokeWidth="2" />
      <T x={494} y={160} size={13} w={700} fill="#b4a9ff">{V.vault.name.toUpperCase()}</T>
      <text x={494} y={192} fontSize={32} fontWeight={800} fill="#eceefe" fontFamily={FONT}>{vault}<tspan fontSize={13} fontWeight={400} fill="#8189b4" dx={8}>{V.vault.token}</tspan></text>
      <T x={1050} y={162} size={12} fill="#8189b4" anchor="end">hạn mức riêng · hạn mức chung · whitelist · kill switch</T>
      <T x={1050} y={190} size={12} fill="#aab1d6" anchor="end">{V.vault.sub}</T>

      {/* districts */}
      {tiles.map((d, i) => {
        const t = TONE[d.tone];
        return (
          <g key={d.name}>
            <path d={`M${tileX[i] + 70} 212 V 236`} stroke={t.s} strokeWidth="2" opacity="0.7" />
            <rect x={tileX[i]} y="236" width="140" height="88" rx="14" fill={t.f} stroke={t.s} strokeWidth="1.5" strokeDasharray={d.tone === "dashed" ? "5 4" : undefined} />
            <T x={tileX[i] + 14} y={264} size={14.5} w={700}>{d.name}</T>
            <T x={tileX[i] + 14} y={286} size={11.5} fill="#aab1d6">{d.l1}</T>
            <T x={tileX[i] + 14} y={304} size={11.5} fill={t.s}>{d.l2}</T>
          </g>
        );
      })}

      {policyVersion ? <T x={1058} y={56} size={12} w={700} fill="#b4a9ff" anchor="end">{`POLICY V${policyVersion} · DỮ LIỆU TRỰC TIẾP`}</T> : null}
      {/* recipients */}
      <path d="M772 324 V 344" stroke="rgb(148 160 255 / 0.35)" strokeWidth="2" strokeDasharray="3 4" />
      <rect x="470" y="344" width="470" height="44" rx="12" fill="rgb(52 224 180 / 0.07)" stroke="rgb(52 224 180 / 0.4)" />
      <T x={486} y={362} size={11} w={700} fill="#34e0b4">✓ NGƯỜI NHẬN ĐÃ DUYỆT</T>
      <T x={486} y={380} size={12} fill="#aab1d6">{V.recipients.ok.join("  ·  ")}</T>
      <rect x="956" y="344" width="118" height="44" rx="12" fill="rgb(255 107 122 / 0.1)" stroke="rgb(255 107 122 / 0.5)" strokeDasharray="4 3" />
      <T x={970} y={362} size={11} w={700} fill="#ff6b7a">✕ BỊ CHẶN</T>
      <T x={970} y={380} size={12} fill="#ffc2c9">{V.recipients.blocked}</T>
    </svg>
  );
}
