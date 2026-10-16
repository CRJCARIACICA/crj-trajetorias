import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, VerticalAlign, ImageRun, PageOrientation
} from "npm:docx@9.5.1";

const CONTRACT = "official-preview-v1";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition, Content-Type, X-CRJ-Export-Mode, X-CRJ-Layout-Source, X-CRJ-Layout-Contract, X-CRJ-Header-Source"
};

const s = (v) => v == null ? "" : String(v).trim();
const brDate = (v) => {
  const x = s(v);
  const m = x.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : x;
};
const time5 = (v) => s(v).slice(0, 5);
const safeName = (v) => s(v || "documento")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "documento";
const pdfSafe = (v) => s(v)
  .replace(/[–—]/g, "-")
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
const array = (v) => Array.isArray(v) ? v : [];

function decodeImage(value, mime) {
  let raw = s(value);
  if (!raw) return null;
  let type = s(mime).toLowerCase();
  const dataUrl = raw.match(/^data:image\/(png|jpe?g);base64,(.*)$/is);
  if (dataUrl) {
    type = dataUrl[1].toLowerCase();
    raw = dataUrl[2];
  }
  raw = raw
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/[^A-Za-z0-9+/=]/g, "")
    .replace(/=+$/g, "");
  const mod = raw.length % 4;
  if (mod === 1) return null;
  if (mod) raw += "=".repeat(4 - mod);
  try {
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const jpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!jpg && !png) return null;
    return { bytes, type: jpg ? "jpg" : "png" };
  } catch {
    return null;
  }
}

async function getClients(auth) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anon) throw new Error("Configuração interna de exportação indisponível.");
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Sessão inválida.");
  const settingsClient = service
    ? createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    : userClient;
  return { url, anon, userClient, settingsClient };
}

async function loadHeader(settingsClient) {
  const q = await settingsClient.from("crj_document_settings")
    .select("header_image_data,header_mime")
    .eq("id", 1)
    .maybeSingle();
  if (q.error) throw q.error;
  const image = decodeImage(q.data?.header_image_data, q.data?.header_mime);
  if (!image) throw new Error("Cabeçalho institucional inválido ou não configurado.");
  return image;
}

function responseHeaders(mime, filename) {
  return {
    ...cors,
    "Content-Type": mime,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
    "X-CRJ-Export-Mode": "official-canonical",
    "X-CRJ-Layout-Source": "official-canonical",
    "X-CRJ-Layout-Contract": CONTRACT,
    "X-CRJ-Header-Source": "document-settings"
  };
}

function jsonError(message, status = 500) {
  return Response.json({ error: message }, { status, headers: { ...cors, "Cache-Control": "no-store" } });
}

function humanKey(key) {
  const labels = {
    full_name: "Nome completo", preferred_name: "Como prefere ser chamado", birth_date: "Data de nascimento",
    cpf: "CPF", phone: "Telefone", email: "E-mail", neighborhood: "Bairro", municipality: "Município",
    activity: "Atividade", date: "Data", start_time: "Hora de início", end_time: "Hora de término", location: "Local",
    officineiro: "Oficineiro(a)", educator_reference: "Educador(a) de referência", responsible_technical: "Responsável técnico",
    objective: "Objetivo", objectives: "Objetivos", actions: "Ações / encaminhamentos", notes: "Observações",
    technical_report: "Relato técnico", partners: "Parceiros", results: "Resultados", result: "Resultado",
    referrals: "Encaminhamentos", participant_count: "Quantidade de participantes", title: "Título", description: "Descrição",
    status: "Situação", action_type: "Programa / ação", action_scope: "Escopo", planned_activities: "Atividades / metodologia prevista",
    expected_results: "Resultados esperados", target_audience: "Público previsto", expected_participants: "Participantes esperados",
    evidence_plan: "Evidências previstas", planned_date: "Data planejada"
  };
  return labels[key] || key.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
}

function primitive(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return s(value);
  if (Array.isArray(value)) return value.map(v => typeof v === "object" ? JSON.stringify(v) : s(v)).join("; ");
  return JSON.stringify(value);
}

function genericRows(payload) {
  const skip = new Set(["participants", "signature_data", "methodology_links", "linked_action_types", "execution_snapshot", "_trajectory_data"]);
  const rows = [];
  for (const [key, value] of Object.entries(payload || {})) {
    if (skip.has(key) || key.startsWith("_")) continue;
    if (value == null || value === "" || (Array.isArray(value) && !value.length)) continue;
    rows.push([humanKey(key), primitive(value)]);
  }
  return rows;
}

const FORM_TITLES = {
  "formulario-inicial": "FORMULÁRIO INICIAL",
  "lista-presenca-contato": "LISTA DE PRESENÇA E CONTATO",
  "acompanhamento": "FORMULÁRIO DE ACOMPANHAMENTO",
  "pvida": "PLANEJAMENTO DE VIDA (PVIDA)",
  "outras-demandas": "OUTRAS DEMANDAS - ACOMPANHAMENTO",
  "ptrampo": "PLANEJAMENTO DE TRABALHO (PTRAMPO)",
  "avaliacao-atividades": "AVALIAÇÃO DAS ATIVIDADES",
  "relatorio-mobilizacao": "RELATÓRIO DE MOBILIZAÇÃO DOS JOVENS",
  "emprestimo": "EMPRÉSTIMO DE EQUIPAMENTO / ESPAÇO",
  "emprestimo-canhoto": "CANHOTO DE EMPRÉSTIMO",
  "cfdh-planejamento": "PLANEJAMENTO CFDH",
  "cfdh-avaliacao-jovens": "AVALIAÇÃO FINAL CFDH - JOVENS",
  "cfdh-avaliacao-equipe": "AVALIAÇÃO FINAL CFDH - EQUIPE",
  "trajetoria-jovem": "EVIDÊNCIA INDIVIDUAL DA TRAJETÓRIA DO JOVEM"
};

function attendanceSpec(payload) {
  const people = array(payload?.participants);
  return {
    title: "LISTA DE PRESENÇA E CONTATO",
    subtitle: [payload?.activity, brDate(payload?.date)].filter(Boolean).join(" · "),
    filename: "Anexo_2_Lista_de_Presenca_" + safeName(payload?.activity || payload?.date || "registro"),
    sections: [
      { rows: [
        ["Atividade", payload?.activity || ""], ["Local", payload?.location || ""], ["Data", brDate(payload?.date)],
        ["Horário", [time5(payload?.start_time), time5(payload?.end_time)].filter(Boolean).join("–")],
        ["Oficineiro(a)", payload?.officineiro || ""], ["Educador(a) / responsável", payload?.educator_reference || payload?.responsible_technical || ""],
        ["Participantes registrados", String(people.length)]
      ] },
      { title: "Participantes", table: {
        heads: ["#", "Nome completo", "Nascimento", "CPF", "Telefone", "E-mail", "Bairro"],
        rows: people.map((p, i) => [String(i + 1), p.full_name || p.name || "", brDate(p.birth_date), p.cpf || "", p.phone || p.contact || "", p.email || "", p.neighborhood || ""])
      } }
    ]
  };
}

function trajectorySpec(payload) {
  const data = payload?._trajectory_data || payload || {};
  const youth = data.youth || {};
  const totals = data.totals || {};
  return {
    title: "EVIDÊNCIA INDIVIDUAL DA TRAJETÓRIA DO JOVEM",
    subtitle: youth.full_name || payload?.full_name || "",
    filename: "Trajetoria_" + safeName(youth.full_name || payload?.full_name || "jovem"),
    sections: [
      { rows: [
        ["Nome completo", youth.full_name || payload?.full_name || ""], ["Nascimento", brDate(youth.birth_date)], ["CPF", youth.cpf || ""],
        ["Participações confirmadas", totals.participations ?? 0], ["Carga horária realizada", `${Number(totals.participated_hours || 0)}h`],
        ["Não participou", totals.missed_actions ?? 0], ["Carga horária não realizada", `${Number(totals.missed_hours || 0)}h`],
        ["Taxa de participação", `${Number(totals.participation_rate || 0)}%`]
      ] },
      { title: "Resumo por área", table: {
        heads: ["Área", "Participações", "Horas realizadas", "Não participou", "Horas não realizadas"],
        rows: array(data.by_area).map(r => [r.area_label || r.area_code || "", r.participations ?? 0, r.participated_hours ?? 0, r.missed_actions ?? 0, r.missed_hours ?? 0])
      } },
      { title: "Ações em que participou", table: {
        heads: ["Data", "Ação", "Área", "Horas", "Base da evidência"],
        rows: array(data.participated_actions).map(r => [brDate(r.action_date), r.title || "", r.area_label || r.area_code || "", r.hours ?? 0, r.evidence_basis || ""])
      } },
      { title: "Ações em que não participou", table: {
        heads: ["Data", "Ação", "Área", "Horas", "Base da evidência"],
        rows: array(data.not_participated_actions).map(r => [brDate(r.action_date), r.title || "", r.area_label || r.area_code || "", r.hours ?? 0, r.evidence_basis || ""])
      } }
    ]
  };
}

function submissionSpec(submission) {
  if (submission.form_slug === "lista-presenca-contato") return attendanceSpec(submission.payload || {});
  if (submission.form_slug === "trajetoria-jovem") return trajectorySpec(submission.payload || {});
  const title = FORM_TITLES[submission.form_slug] || humanKey(submission.form_slug || "evidencia");
  return {
    title,
    subtitle: submission.payload?.full_name || submission.payload?.activity || "",
    filename: safeName(title),
    sections: [{ rows: genericRows(submission.payload || {}) }]
  };
}

async function workshopPlanSpec(client, id) {
  const planQ = await client.from("workshop_monthly_plans").select("*").eq("id", id).single();
  if (planQ.error || !planQ.data) throw new Error("Planejamento da oficina não encontrado.");
  const plan = planQ.data;
  const [workshopQ, lessonsQ] = await Promise.all([
    client.from("workshops").select("id,name").eq("id", plan.workshop_id).single(),
    client.from("workshop_plan_lessons").select("*").eq("plan_id", id).order("lesson_number")
  ]);
  if (workshopQ.error || lessonsQ.error) throw new Error("Não foi possível carregar o planejamento da oficina.");
  return {
    title: "PLANEJAMENTO MENSAL DE OFICINA",
    subtitle: workshopQ.data?.name || "",
    filename: "Planejamento_" + safeName(workshopQ.data?.name || "oficina"),
    sections: [
      { rows: [
        ["Oficina", workshopQ.data?.name || ""], ["Mês de referência", s(plan.plan_month).slice(0, 7)],
        ["Objetivo geral", plan.general_objective || ""], ["Metodologia geral", plan.general_methodology || ""],
        ["Resultados esperados", plan.expected_results || ""], ["Recursos gerais", plan.general_resources || ""], ["Observações", plan.observations || ""]
      ] },
      { title: "Aulas previstas", table: {
        heads: ["Aula", "Data", "Horário", "Tema", "Objetivo", "Atividades", "Recursos"],
        rows: array(lessonsQ.data).map(l => [l.lesson_number, brDate(l.scheduled_date), `${time5(l.start_time)}–${time5(l.end_time)}`, l.theme || "", l.objective || "", l.proposed_activities || "", l.resources || ""])
      } }
    ]
  };
}

async function workshopReportSpec(client, id) {
  const reportQ = await client.from("workshop_monthly_reports").select("*").eq("id", id).single();
  if (reportQ.error || !reportQ.data) throw new Error("Relatório da oficina não encontrado.");
  const report = reportQ.data;
  const planQ = await client.from("workshop_monthly_plans").select("*").eq("id", report.plan_id).single();
  if (planQ.error || !planQ.data) throw new Error("Planejamento vinculado não encontrado.");
  const workshopQ = await client.from("workshops").select("id,name").eq("id", planQ.data.workshop_id).single();
  const snapshot = report.execution_snapshot || {};
  const metrics = snapshot.metrics || {};
  return {
    title: "RELATÓRIO MENSAL DE EXECUÇÃO DA OFICINA",
    subtitle: workshopQ.data?.name || "",
    filename: "Relatorio_" + safeName(workshopQ.data?.name || "oficina"),
    sections: [
      { rows: [
        ["Oficina", workshopQ.data?.name || ""], ["Mês", s(planQ.data.plan_month).slice(0, 7)], ["Situação", report.execution_status || ""],
        ["Aulas previstas", metrics.planned_lessons ?? ""], ["Aulas executadas", metrics.executed_lessons ?? ""],
        ["CH prevista", metrics.planned_hours ?? ""], ["CH executada", metrics.executed_hours ?? ""],
        ["Participações", metrics.participation_records ?? ""], ["Participantes únicos", metrics.unique_participants ?? ""],
        ["Síntese do que foi executado", report.actual_description || ""], ["Metodologia aplicada", report.methodology_applied || ""],
        ["Resultados alcançados", report.results_achieved || ""], ["Retorno dos jovens", report.youth_feedback || ""],
        ["Pontos positivos", report.positive_points || ""], ["Dificuldades", report.difficulties || ""], ["Próximos passos", report.next_steps || ""], ["Observações", report.observations || ""]
      ] },
      { title: "Planejado x executado", table: {
        heads: ["Aula", "Planejado", "Executado", "Participantes", "CFDH"],
        rows: array(snapshot.lesson_execution).map(l => [`Aula ${l.lesson_number || ""}`, l.planned_theme || "", l.actual_content || "Não executada", l.participant_count ?? 0, `${l.cfdh_minutes || 0} min`])
      } }
    ]
  };
}

async function cfdhPlanSpec(client, id) {
  const planQ = await client.from("educator_plans").select("*").eq("id", id).single();
  if (planQ.error || !planQ.data) throw new Error("Planejamento CFDH não encontrado.");
  const actionsQ = await client.from("cfdh_actions").select("*").eq("plan_id", id).order("action_number");
  if (actionsQ.error) throw actionsQ.error;
  const plan = planQ.data;
  return {
    title: "PLANEJAMENTO CFDH",
    subtitle: plan.activity_title || "",
    filename: "Planejamento_CFDH_" + safeName(plan.activity_title || "circuito"),
    sections: [
      { rows: [
        ["Modalidade", plan.plan_type || ""], ["Título / circuito", plan.activity_title || ""], ["Início", brDate(plan.planned_start)],
        ["Término", brDate(plan.planned_end || plan.planned_start)], ["Objetivo geral", plan.description_objective || ""],
        ["Equipe prevista", plan.team_text || ""], ["Parceiros", plan.partners || ""], ["Resultados esperados", plan.expected_results || ""], ["Observações", plan.cfdh_monthly_notes || ""]
      ] },
      { title: "Ações CFDH", table: {
        heads: ["Ação", "Data", "Horário", "Tema", "Objetivo", "Atividades", "Carga horária"],
        rows: array(actionsQ.data).map(a => [a.action_number, brDate(a.scheduled_date), `${time5(a.start_time)}–${time5(a.end_time)}`, a.action_theme || a.title || "", a.objective || "", a.activities || "", `${a.planned_duration_hours || 0}h`])
      } }
    ]
  };
}

async function cfdhReportSpec(client, id) {
  const reportQ = await client.from("educator_reports").select("*").eq("id", id).single();
  if (reportQ.error || !reportQ.data) throw new Error("Relatório CFDH não encontrado.");
  const planQ = await client.from("educator_plans").select("*").eq("id", reportQ.data.plan_id).single();
  if (planQ.error || !planQ.data) throw new Error("Planejamento CFDH vinculado não encontrado.");
  const actionsQ = await client.from("cfdh_actions").select("*").eq("plan_id", planQ.data.id).order("action_number");
  if (actionsQ.error) throw actionsQ.error;
  const report = reportQ.data;
  return {
    title: "RELATÓRIO DE EXECUÇÃO CFDH",
    subtitle: planQ.data.activity_title || "",
    filename: "Relatorio_CFDH_" + safeName(planQ.data.activity_title || "circuito"),
    sections: [
      { rows: [
        ["Circuito", planQ.data.activity_title || ""], ["Data do relatório", brDate(report.report_date)], ["Situação", report.execution_status || ""],
        ["Síntese executada", report.actual_description || ""], ["Metodologia aplicada", report.methodology_applied || ""],
        ["Resultados alcançados", report.results_achieved || ""], ["Retorno dos jovens", report.youth_feedback || ""],
        ["Pontos positivos", report.positive_points || ""], ["Dificuldades", report.negative_points || report.difficulties || ""],
        ["Próximos passos", report.next_steps || ""], ["Justificativa", report.justification || ""], ["Evidências", report.evidence_ref || ""], ["Observações", report.observations || ""]
      ] },
      { title: "Ações", table: {
        heads: ["Ação", "Planejada", "Executada", "Situação", "Duração"],
        rows: array(actionsQ.data).map(a => [a.action_number, brDate(a.scheduled_date), brDate(a.actual_date), a.execution_status || "", `${a.actual_duration_hours || 0}h`])
      } }
    ]
  };
}

async function educatorRecordSpec(client, id) {
  const q = await client.from("educator_records").select("*").eq("id", id).single();
  if (q.error || !q.data) throw new Error("Registro do educador não encontrado.");
  const record = q.data;
  let educator = "", youth = "", workshop = "";
  if (record.educator_user_id) {
    const x = await client.from("profiles").select("display_name").eq("id", record.educator_user_id).maybeSingle();
    educator = x.data?.display_name || "";
  }
  if (record.youth_id) {
    const x = await client.from("young_people").select("full_name").eq("id", record.youth_id).maybeSingle();
    youth = x.data?.full_name || "";
  }
  if (record.workshop_id) {
    const x = await client.from("workshops").select("name").eq("id", record.workshop_id).maybeSingle();
    workshop = x.data?.name || "";
  }
  return {
    title: "REGISTRO / ENCAMINHAMENTO DO EDUCADOR",
    subtitle: record.title || "",
    filename: "Registro_Educador_" + safeName(record.title || record.record_type || "registro"),
    sections: [{ rows: [
      ["Data", brDate(record.record_date)], ["Educador responsável", educator], ["Jovem", youth], ["Oficina", workshop],
      ["Tipo", record.record_type || ""], ["Título", record.title || ""], ["Descrição", record.description || ""],
      ["Destino do encaminhamento", record.referral_target || ""], ["Observações", record.notes || ""], ["Evidência", record.evidence_ref || ""]
    ] }]
  };
}

function wrapText(text, max) {
  const out = [];
  for (const raw of pdfSafe(text).split("\n")) {
    if (!raw) { out.push(""); continue; }
    const words = raw.split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > max && line) { out.push(line); line = word; }
      else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

async function makePdf(spec, header) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const headerImg = header.type === "png" ? await pdf.embedPng(header.bytes) : await pdf.embedJpg(header.bytes);
  const pageSize = [841.89, 595.28];
  const margin = 38;
  const tableWidth = pageSize[0] - margin * 2;
  let page;
  let y = 0;

  const addPage = (continuation = false) => {
    page = pdf.addPage(pageSize);
    const H = page.getHeight();
    const dims = headerImg.scale(1);
    const maxW = 330, maxH = 58, scale = Math.min(maxW / dims.width, maxH / dims.height, 1);
    page.drawImage(headerImg, { x: (pageSize[0] - dims.width * scale) / 2, y: H - 74, width: dims.width * scale, height: dims.height * scale });
    const title = continuation ? `${spec.title} - CONTINUAÇÃO` : spec.title;
    page.drawText(pdfSafe(title), { x: margin, y: H - 98, size: 10, font: bold, maxWidth: tableWidth });
    if (spec.subtitle && !continuation) page.drawText(pdfSafe(spec.subtitle), { x: margin, y: H - 112, size: 7, font, maxWidth: tableWidth, color: rgb(.25, .25, .25) });
    y = H - (spec.subtitle && !continuation ? 126 : 112);
  };
  const ensure = (height) => { if (y - height < 34) addPage(true); };
  const drawRow = (label, value) => {
    const lines = wrapText(value, 115);
    const h = Math.max(24, 18 + lines.length * 8);
    ensure(h);
    page.drawRectangle({ x: margin, y: y - h, width: tableWidth, height: h, borderWidth: .45, borderColor: rgb(0, 0, 0) });
    page.drawText(pdfSafe(label), { x: margin + 5, y: y - 11, size: 6.5, font: bold, maxWidth: tableWidth - 10 });
    let ty = y - 21;
    for (const line of lines) { page.drawText(line, { x: margin + 5, y: ty, size: 6.2, font, maxWidth: tableWidth - 10 }); ty -= 8; }
    y -= h;
  };
  const drawTable = (table) => {
    const cols = Math.max(1, table.heads.length);
    const cw = tableWidth / cols;
    const drawHead = () => {
      ensure(28);
      let x = margin;
      for (const head of table.heads) {
        page.drawRectangle({ x, y: y - 28, width: cw, height: 28, borderWidth: .45, borderColor: rgb(0, 0, 0) });
        const lines = wrapText(head, Math.max(6, Math.floor(cw / 4.7))).slice(0, 3);
        lines.forEach((line, i) => page.drawText(line, { x: x + 3, y: y - 10 - i * 7, size: 5.5, font: bold, maxWidth: cw - 6 }));
        x += cw;
      }
      y -= 28;
    };
    drawHead();
    for (const row of table.rows) {
      const maxLen = Math.max(1, ...row.map(v => s(v).length));
      const h = Math.min(72, Math.max(30, 30 + Math.floor(maxLen / 90) * 8));
      if (y - h < 34) { addPage(true); drawHead(); }
      let x = margin;
      for (let i = 0; i < cols; i++) {
        page.drawRectangle({ x, y: y - h, width: cw, height: h, borderWidth: .4, borderColor: rgb(0, 0, 0) });
        const lines = wrapText(row[i] ?? "", Math.max(5, Math.floor(cw / 4.6))).slice(0, Math.max(3, Math.floor((h - 8) / 7)));
        lines.forEach((line, j) => page.drawText(line, { x: x + 3, y: y - 10 - j * 7, size: 5.4, font, maxWidth: cw - 6 }));
        x += cw;
      }
      y -= h;
    }
  };

  addPage(false);
  for (const section of spec.sections) {
    if (section.title) {
      ensure(22);
      page.drawRectangle({ x: margin, y: y - 20, width: tableWidth, height: 20, borderWidth: .45, borderColor: rgb(0, 0, 0) });
      page.drawText(pdfSafe(section.title), { x: margin + 5, y: y - 13, size: 7, font: bold, maxWidth: tableWidth - 10 });
      y -= 20;
    }
    for (const row of section.rows || []) drawRow(row[0], row[1]);
    if (section.table) drawTable(section.table);
  }
  const last = pdf.getPages()[pdf.getPageCount() - 1];
  last.drawText("Documento gerado pelo CRJ Trajetórias · cabeçalho institucional canônico.", { x: margin, y: 14, size: 5, font, color: rgb(.35, .35, .35), maxWidth: tableWidth });
  return new Uint8Array(await pdf.save());
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const para = (text, boldText = false, size = 10, align = AlignmentType.LEFT) => new Paragraph({
  alignment: align, spacing: { after: 10 }, children: [new TextRun({ text: s(text), bold: boldText, size })]
});
function docCell(text, boldText = false) {
  return new TableCell({
    borders: { top: border, bottom: border, left: border, right: border },
    verticalAlign: VerticalAlign.TOP,
    children: String(text ?? "").split("\n").map(line => para(line, boldText, 9))
  });
}
async function makeDocx(spec, header) {
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new ImageRun({ data: header.bytes, type: header.type, transformation: { width: 320, height: 56 } })] }),
    para(spec.title, true, 18, AlignmentType.CENTER)
  ];
  if (spec.subtitle) children.push(para(spec.subtitle, false, 11, AlignmentType.CENTER));
  for (const section of spec.sections) {
    if (section.title) children.push(para(section.title, true, 13, AlignmentType.CENTER));
    for (const row of section.rows || []) {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: [new TableCell({
          borders: { top: border, bottom: border, left: border, right: border },
          children: [new Paragraph({ children: [new TextRun({ text: s(row[0]) + ": ", bold: true, size: 10 }), new TextRun({ text: s(row[1]), size: 10 })] })]
        })] })]
      }));
    }
    if (section.table) {
      const rows = [new TableRow({ tableHeader: true, children: section.table.heads.map(h => docCell(h, true)) })];
      for (const row of section.table.rows) rows.push(new TableRow({ children: section.table.heads.map((_, i) => docCell(row[i] ?? "")) }));
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, rows }));
    }
  }
  children.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: "Documento gerado pelo CRJ Trajetórias · cabeçalho institucional canônico.", size: 9, color: "666666" })] }));
  const doc = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 420, right: 420, bottom: 420, left: 420 } } }, children }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}

async function proxyWorkshopAttendance(url, anon, auth, body) {
  const response = await fetch(`${url}/functions/v1/crj-export-workshop-attendance`, {
    method: "POST",
    headers: { Authorization: auth, apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) return new Response(bytes, { status: response.status, headers: { ...cors, "Content-Type": response.headers.get("content-type") || "application/json" } });
  const h = new Headers(cors);
  for (const key of ["content-type", "content-disposition", "cache-control"]) {
    const value = response.headers.get(key); if (value) h.set(key, value);
  }
  h.set("X-CRJ-Export-Mode", "official-canonical");
  h.set("X-CRJ-Layout-Source", "official-canonical");
  h.set("X-CRJ-Layout-Contract", CONTRACT);
  h.set("X-CRJ-Header-Source", "document-settings");
  return new Response(bytes, { status: 200, headers: h });
}

// Planning exports are the browser preview pages, not generic tables rebuilt
// here. Authorization still runs against the saved plan with the caller's RLS.
async function makePreviewFile(snapshot, format) {
  if(snapshot?.contract!=="screen-preview-pages-v1" || !Array.isArray(snapshot.pages) || !snapshot.pages.length || snapshot.pages.length>32)
    throw new Error("Atualize a página para exportar o planejamento com o layout da prévia.");
  let total=0;
  const pages=snapshot.pages.map(p=>{
    if(!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<600||p.width>3000||p.height<1||p.height>Math.ceil(p.width*210/297))throw new Error("Dimensões de página inválidas.");
    total+=s(p.png).length;
    if(total>24000000)throw new Error("Planejamento excede o limite de exportação.");
    const image=decodeImage(p.png,"png");
    if(!image||image.type!=="png")throw new Error("Página da prévia inválida.");
    if(image.bytes.length<24)throw new Error("Página PNG incompleta.");
    const dimensions=new DataView(image.bytes.buffer,image.bytes.byteOffset,image.bytes.byteLength);
    if(dimensions.getUint32(16)!==p.width||dimensions.getUint32(20)!==p.height)throw new Error("Dimensões da imagem não conferem.");
    return {...p,bytes:image.bytes};
  });
  if(format==="pdf"){
    const pdf=await PDFDocument.create();
    for(const p of pages){
      const image=await pdf.embedPng(p.bytes);
      if(image.width!==p.width||image.height!==p.height)throw new Error("Dimensões da imagem não conferem.");
      const page=pdf.addPage([841.89,595.28]);
      const height=841.89*p.height/p.width;
      page.drawImage(image,{x:0,y:595.28-height,width:841.89,height});
    }
    return new Uint8Array(await pdf.save());
  }
  const children=pages.map((p,i)=>new Paragraph({
    pageBreakBefore:i>0,spacing:{before:0,after:0,line:1},
    children:[new ImageRun({data:p.bytes,type:"png",
      transformation:{width:1122.52,height:1122.52*p.height/p.width},
      floating:{horizontalPosition:{relative:"page",offset:0},verticalPosition:{relative:"page",offset:0},allowOverlap:true,behindDocument:false}
    })]
  }));
  const doc=new Document({sections:[{properties:{page:{size:{width:11906,height:16838,orientation:PageOrientation.LANDSCAPE},margin:{top:0,right:0,bottom:0,left:0,header:0,footer:0}}},children}]});
  return new Uint8Array(await Packer.toBuffer(doc));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonError("Método não permitido.", 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return jsonError("Não autenticado.", 401);
    const body = await req.json();
    const format = s(body.format || "pdf").toLowerCase();
    if (!["pdf", "docx"].includes(format)) return jsonError("Formato inválido.", 400);
    const { url, anon, userClient, settingsClient } = await getClients(auth);

    if (s(body.plan_lesson_id)) {
      return await proxyWorkshopAttendance(url, anon, auth, { plan_lesson_id: s(body.plan_lesson_id), format });
    }

    const header = await loadHeader(settingsClient);
    let spec;
    if (s(body.submission_id)) {
      const q = await userClient.from("methodology_form_submissions").select("id,form_slug,payload,submitted_at").eq("id", s(body.submission_id)).single();
      if (q.error || !q.data) throw new Error("Evidência não encontrada ou sem permissão.");
      spec = submissionSpec(q.data);
    } else if (s(body.plan_id)) {
      spec = await workshopPlanSpec(userClient, s(body.plan_id));
    } else if (s(body.report_id)) {
      spec = await workshopReportSpec(userClient, s(body.report_id));
    } else if (s(body.cfdh_plan_id)) {
      spec = await cfdhPlanSpec(userClient, s(body.cfdh_plan_id));
    } else if (s(body.cfdh_report_id)) {
      spec = await cfdhReportSpec(userClient, s(body.cfdh_report_id));
    } else if (s(body.educator_record_id)) {
      spec = await educatorRecordSpec(userClient, s(body.educator_record_id));
    } else {
      return jsonError("Documento não identificado para exportação.", 400);
    }

    const isPlanning=Boolean(s(body.plan_id)||s(body.cfdh_plan_id));
    const bytes = isPlanning ? await makePreviewFile(body.preview_snapshot,format) : format === "pdf" ? await makePdf(spec, header) : await makeDocx(spec, header);
    if (!bytes?.length) throw new Error("Documento gerado sem conteúdo.");
    const mime = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return new Response(bytes, { status: 200, headers: responseHeaders(mime, `${spec.filename}.${format}`) });
  } catch (error) {
    console.error("CRJ_SAFE_EXPORT_V8_ERROR", error instanceof Error ? error.stack || error.message : String(error));
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }
});
