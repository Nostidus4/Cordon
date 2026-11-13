// About (spec §10.7): vault model, how Cordon works, legal notes, protection limits. Copy lives in content.ts.
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, FileCheck2, FlaskConical, Map as MapIcon, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardHeader, PageHeader } from "../../components/ui";
import { useOrg } from "../../hooks/useOrg";
import { useGraph } from "../../hooks/useGraph";
import type { LiveTile } from "./VaultDiagram";
import { ABOUT_HERO, HOW_IT_WORKS, LEGAL, LIMITS, VAULT_MODEL } from "./content";
import { VaultDiagram } from "./VaultDiagram";
import { policyLabel } from "../../lib/policy";

const ICONS = { map: MapIcon, simulate: FlaskConical, cordon: FileCheck2 } as const;
const enter = (i: number) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } });
const rise = (i: number) => ({ initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-40px" }, transition: { delay: i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } });

export default function AboutPage() {
  const { data: org } = useOrg();
  const { data: graph } = useGraph();
  const tiles: LiveTile[] = [
    ...["minh", "huy", "lan"].map((id) => graph?.districts.find((d) => d.principalId === id)).filter((d): d is NonNullable<typeof d> => !!d).map((d): LiveTile => ({
      name: d.label.replace(/^(Anh|Chị) /, "Khu "), l1: `${d.keys.length} thẻ`,
      l2: d.dailyCap ? `chung ${d.dailyCap.display}/ngày` : "chưa có trần chung", tone: d.locked ? "dashed" : d.dailyCap ? "ok" : "warn",
    })),
    { name: "Khu Hội đồng", l1: "tuỳ chọn", l2: "cảnh 5", tone: "dashed" },
  ];
  return (
    <>
      <PageHeader title="Pháp lý" en="About" description="Mô hình kho chi tiêu, cách Cordon hoạt động và giới hạn bảo vệ." />

      <motion.section {...enter(0)} className="relative mb-6 overflow-hidden rounded-[var(--radius-xl)] border border-brand/35 bg-[linear-gradient(135deg,rgb(139_124_246/0.16),rgb(76_201_240/0.05)_55%,transparent)] px-8 py-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-brand/20 blur-3xl" />
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">{ABOUT_HERO.eyebrow}</p>
        <h2 className="mt-2 max-w-3xl text-[32px] font-extrabold leading-[1.15] tracking-tight text-text">{ABOUT_HERO.title}</h2>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted">{ABOUT_HERO.lead}</p>
      </motion.section>

      <motion.section {...enter(1)} className="mb-6" data-tour="about-vault" aria-label={VAULT_MODEL.title}>
        <Card strong>
          <CardHeader title={VAULT_MODEL.title} en={VAULT_MODEL.en} right={<span className="max-w-sm text-right text-xs text-faint">{VAULT_MODEL.note}</span>} />
          <VaultDiagram tiles={tiles} policyVersion={policyLabel(graph)} main={org?.mainTreasury.balance.display ?? VAULT_MODEL.main.fallback} vault={org ? org.vault.balance.display : VAULT_MODEL.vault.fallback} />
        </Card>
      </motion.section>

      <section className="mb-6" data-tour="about-how" aria-label={HOW_IT_WORKS.title}>
        <motion.div {...rise(0)} className="mb-3 flex items-baseline gap-3"><h2 className="text-xl font-bold text-text">{HOW_IT_WORKS.title}</h2><span className="text-xs text-faint">{HOW_IT_WORKS.en}</span></motion.div>
        <div className="grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.steps.map((s, i) => {
            const Icon = ICONS[s.key as keyof typeof ICONS];
            return (
              <motion.div key={s.key} {...rise(i)}>
                <Link to={s.to} className="group relative block h-full overflow-hidden rounded-[var(--radius-lg)] glass p-5 transition-all hover:-translate-y-1 hover:border-brand/60">
                  <span className="absolute right-4 top-3 text-[64px] font-black leading-none text-white/[0.05]">{s.n}</span>
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/30"><Icon className="size-5" aria-hidden /></span>
                  <h3 className="mt-4 text-lg font-bold text-text">{s.name} <span className="ml-1 text-sm font-medium text-faint">· {s.vi}</span></h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.text}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-brand opacity-0 transition-opacity group-hover:opacity-100">Mở màn {s.name} <ArrowRight className="size-3.5" aria-hidden /></span>
                </Link>
              </motion.div>
            );
          })}
        </div>
        <motion.div {...rise(3)} className="mt-4 grid gap-3 rounded-[var(--radius-lg)] border border-line bg-white/[0.025] p-4 md:grid-cols-3">
          {HOW_IT_WORKS.principles.map((p) => (
            <div key={p.big} className="flex items-center gap-4"><span className="text-gradient min-w-[3.2rem] text-center text-[40px] font-black leading-none tnum">{p.big}</span>
              <div><p className="text-sm font-bold text-text">{p.label}</p><p className="text-xs text-faint">{p.detail}</p></div></div>
          ))}
        </motion.div>
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <motion.section {...rise(0)} data-tour="about-legal" aria-label={LEGAL.title}>
          <Card className="h-full">
            <CardHeader title={<span className="inline-flex items-center gap-2"><Scale className="size-4 text-brand" aria-hidden />{LEGAL.title}</span>} en={LEGAL.en} />
            <ul className="space-y-3">
              {LEGAL.items.map((it) => (
                <li key={it.k} className="flex gap-3"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"><Check className="size-3" strokeWidth={3} aria-hidden /></span>
                  <div><p className="text-sm font-semibold text-text">{it.k}</p><p className="text-[13px] leading-snug text-muted">{it.v}</p></div></li>
              ))}
            </ul>
          </Card>
        </motion.section>

        <motion.section {...rise(1)} data-tour="about-limits" aria-label={LIMITS.title}>
          <Card tone="bad" className="h-full">
            <CardHeader title={<span className="inline-flex items-center gap-2"><ShieldAlert className="size-4 text-bad" aria-hidden />{LIMITS.title}</span>} en={LIMITS.en} />
            <p className="mb-3 text-[13px] text-muted">{LIMITS.lead}</p>
            <ul className="space-y-2.5">
              {LIMITS.cannot.map((it) => (
                <li key={it.k} className="rounded-lg border border-bad/35 bg-bad-soft px-3.5 py-2.5"><p className="text-sm font-bold text-bad"><span aria-hidden>✕</span> {it.k}</p><p className="mt-0.5 text-[13px] leading-snug text-[#ffd2d7]">{it.v}</p></li>
              ))}
            </ul>
            <p className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ok"><ShieldCheck className="size-3.5" aria-hidden /> Nhưng bảo vệ được</p>
            <ul className="space-y-1.5">{LIMITS.can.map((c) => <li key={c} className="flex items-start gap-2 text-[13px] text-muted"><span aria-hidden className="text-ok">✓</span>{c}</li>)}</ul>
          </Card>
        </motion.section>
      </div>
    </>
  );
}
