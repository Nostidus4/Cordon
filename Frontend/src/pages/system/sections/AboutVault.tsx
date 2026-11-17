// Vault model diagram: Safe 3/5 on C-Chain -> (simulated top-up) -> PolicyVault on Guardian L1, Council on top, districts below.
import { motion } from "framer-motion";

const FONT = "var(--font-sans, system-ui)";
const INK = "#2d2250", SOFT = "#6f6490";
const T = ({ x, y, size = 14, w = 600, fill = INK, anchor = "start", children }: { x: number; y: number; size?: number; w?: number; fill?: string; anchor?: "start" | "middle" | "end"; children: React.ReactNode }) => (
  <text x={x} y={y} fontSize={size} fontWeight={w} fill={fill} textAnchor={anchor} fontFamily={FONT}>{children}</text>
);
const TONE = { warn: { s: "#e0a100", f: "#fff6dc" }, ok: { s: "#1aa86a", f: "#e4f8ee" }, info: { s: "#8e5cf6", f: "#efe8ff" }, dashed: { s: "#a79bc2", f: "transparent" } };

export interface LiveTile { name: string; l1: string; l2: string; tone: keyof typeof TONE }
export const MEMBERS = ["Trang", "Lan", "Huy"];

export function AboutVault({ main, vault, tiles, policyVersion }: { main: string; vault: string; tiles: LiveTile[]; policyVersion?: number }) {
  const tileX = [470, 624, 778, 932];
  return (
    <svg viewBox="0 0 1120 430" role="img" aria-label="Quỹ chính Safe 3/5 trên C-Chain nạp mô phỏng vào kho chi tiêu trên Guardian L1, do Hội đồng 2/3 quản trị">
      <rect x="16" y="24" width="300" height="382" rx="22" fill="#f6f1e6" stroke="#d9cfb8" strokeWidth="2" />
      <rect x="440" y="24" width="664" height="382" rx="22" fill="#f1ebff" stroke="#c7b4fb" strokeWidth="2" />
      <T x={40} y={56} size={12} w={800} fill={SOFT}>C-CHAIN · AVALANCHE FUJI</T>
      <T x={464} y={56} size={12} w={800} fill="#6d3fd1">GUARDIAN L1 · KHO CHI TIÊU</T>

      <rect x="46" y="118" width="240" height="190" rx="18" fill="#fff" stroke="#d9cfb8" strokeWidth="2" />
      <T x={66} y={156} size={20} w={800}>Safe 3/5</T>
      <T x={66} y={178} size={13} fill={SOFT}>Quỹ chính</T>
      <T x={66} y={236} size={34} w={800}>{main}</T>
      <T x={66} y={258} size={13} fill={SOFT}>tUSDC · trong Safe</T>
      <T x={66} y={288} size={11.5} fill={SOFT}>chỉ để hiển thị và làm nguồn nạp</T>

      <path d="M286 200 C 370 200, 390 170, 470 170" fill="none" stroke="#d9cfb8" strokeWidth="2" />
      <motion.path d="M286 200 C 370 200, 390 170, 470 170" fill="none" stroke="#8e5cf6" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 12" animate={{ strokeDashoffset: [0, -64] }} transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }} />
      <polygon points="470,170 458,163 458,177" fill="#8e5cf6" />
      <rect x="318" y="212" width="120" height="26" rx="13" fill="#efe8ff" stroke="#8e5cf6" strokeDasharray="4 3" />
      <T x={378} y={229} size={12} w={700} fill="#6d3fd1" anchor="middle">nạp mô phỏng</T>
      <T x={378} y={256} size={11} fill={SOFT} anchor="middle">không có cầu nối thật</T>

      <rect x="470" y="78" width="604" height="30" rx="15" fill="#e4d8ff" stroke="#8e5cf6" />
      {MEMBERS.map((m, i) => (
        <g key={m}><circle cx={492 + i * 26} cy="93" r="10" fill="#8e5cf6" stroke="#fff" strokeWidth="2" /><T x={492 + i * 26} y={97} size={11} w={800} fill="#fff" anchor="middle">{m[0]}</T></g>
      ))}
      <T x={582} y={98} size={13} w={700} fill="#4b2aa6">Hội đồng 2/3</T>
      <T x={1058} y={98} size={12.5} fill="#4b2aa6" anchor="end">siết: 1 người · nới: 2/3 · AI: 0 quyền</T>
      <path d="M772 108 V 128" stroke="#8e5cf6" strokeWidth="2" strokeDasharray="3 4" />

      <rect x="470" y="128" width="604" height="84" rx="18" fill="#fff" stroke="#8e5cf6" strokeWidth="2.5" />
      <T x={494} y={160} size={13} w={800} fill="#6d3fd1">KHO CHI TIÊU (POLICYVAULT)</T>
      <text x={494} y={192} fontSize={32} fontWeight={800} fill={INK} fontFamily={FONT}>{vault}<tspan fontSize={13} fontWeight={500} fill={SOFT} dx={8}>tUSDC</tspan></text>
      <T x={1050} y={162} size={12} fill={SOFT} anchor="end">hạn mức thẻ · hạn mức khu · whitelist · kill switch</T>
      <T x={1050} y={190} size={12} fill={SOFT} anchor="end">luật chạy trong node, không phải trong giao diện</T>

      {tiles.map((d, i) => {
        const t = TONE[d.tone];
        return (
          <g key={d.name}>
            <path d={`M${tileX[i] + 70} 212 V 236`} stroke={t.s} strokeWidth="2" opacity="0.8" />
            <rect x={tileX[i]} y="236" width="140" height="88" rx="14" fill={t.f} stroke={t.s} strokeWidth="2" strokeDasharray={d.tone === "dashed" ? "5 4" : undefined} />
            <T x={tileX[i] + 14} y={264} size={14.5} w={800}>{d.name}</T>
            <T x={tileX[i] + 14} y={286} size={11.5} fill={SOFT}>{d.l1}</T>
            <T x={tileX[i] + 14} y={304} size={11.5} w={700} fill={t.s}>{d.l2}</T>
          </g>
        );
      })}

      {policyVersion ? <T x={1058} y={56} size={12} w={800} fill="#6d3fd1" anchor="end">{`CHÍNH SÁCH V${policyVersion} · DỮ LIỆU TRỰC TIẾP`}</T> : null}
      <path d="M772 324 V 344" stroke="#a79bc2" strokeWidth="2" strokeDasharray="3 4" />
      <rect x="470" y="344" width="470" height="44" rx="12" fill="#e4f8ee" stroke="#1aa86a" />
      <T x={486} y={362} size={11} w={800} fill="#117a4c">✓ NGƯỜI NHẬN ĐÃ DUYỆT</T>
      <T x={486} y={380} size={12} fill={SOFT}>vendor_data_api  ·  vendor_cloud  ·  vendor_intl_design</T>
      <rect x="956" y="344" width="118" height="44" rx="12" fill="#ffecec" stroke="#e0364a" strokeDasharray="4 3" />
      <T x={970} y={362} size={11} w={800} fill="#c21f33">✕ BỊ CHẶN</T>
      <T x={970} y={380} size={12} fill="#c21f33">stranger_wallet</T>
    </svg>
  );
}
