import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CameraIcon,
  CheckCircledIcon,
  ChevronDownIcon,
  FileTextIcon,
  ImageIcon,
  MagicWandIcon,
  MagnifyingGlassIcon,
  MixerHorizontalIcon,
  Pencil2Icon,
  PlusIcon,
  ReloadIcon,
  SewingPinIcon,
  SpeakerLoudIcon,
  TrashIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { KeyboardTextarea, MobileScroll, useKeyboard } from "./mobile";

const LINES = ["A线", "B线", "C线", "D线", "E线", "H线", "部装", "底座线"] as const;
const TYPES = ["LOB改善", "线体布局调整", "MCP改善", "POU改善", "品质改善", "其他"] as const;
const AUTO_TYPE = "自动匹配" as const;
const HAS_ONLINE_AI = Boolean(import.meta.env.VITE_AI_ENDPOINT);

type LineName = (typeof LINES)[number];
type ImprovementType = (typeof TYPES)[number];
type TypeChoice = ImprovementType | typeof AUTO_TYPE;
type PhotoValue = { name: string; dataUrl: string } | null;
type DraftStatus = "saving" | "saved" | "error";

type ImprovementRecord = {
  id: string;
  line: LineName;
  type: ImprovementType;
  raw: string;
  content: string;
  effect: string;
  beforePhoto: PhotoValue;
  afterPhoto: PhotoValue;
  createdAt: string;
  note: string;
};

const STORAGE_KEY = "kaizen-quick-log-records-v1";
const DRAFT_KEY = "kaizen-quick-log-draft-v1";
const SAMPLE_RAW = "安装上平衡块岗位原来要转身拿螺钉，现在加了前方螺钉工装，拿取更方便，ST降低1.5秒。";
const SAMPLE_CONTENT = "上平衡块螺钉供料优化：增设前方螺钉工装，将螺钉由身后物料箱移至作业面前，减少转身取料。";
const SAMPLE_EFFECT = "岗位平均ST降低1.5s，减轻员工疲劳，降低掉线风险。";

const SEED_RECORDS: ImprovementRecord[] = [
  {
    id: "seed-1",
    line: "A线",
    type: "POU改善",
    raw: SAMPLE_RAW,
    content: SAMPLE_CONTENT,
    effect: SAMPLE_EFFECT,
    beforePhoto: null,
    afterPhoto: null,
    createdAt: "2026年08月24日",
    note: "",
  },
  {
    id: "seed-2",
    line: "A线",
    type: "LOB改善",
    raw: "把一个运输螺栓安装动作分给整理电源线岗位。",
    content: "运输螺栓与电源线工位平衡：将1个运输螺栓安装动作分解至整理电源线岗位，平衡两岗位作业负荷。",
    effect: "安装运输螺栓岗位ST降低1s，两个岗位线平衡率提升10%。",
    beforePhoto: null,
    afterPhoto: null,
    createdAt: "2026年08月24日",
    note: "",
  },
  {
    id: "seed-3",
    line: "B线",
    type: "线体布局调整",
    raw: "包装岗位调整踏台和工位顺序，适应两种包装方式。",
    content: "包装岗位柔性化布局优化：调整工位顺序并延长踏台，使两种包装方式均可快速切换。",
    effect: "减少机型切换停线，提升包装工段柔性化作业能力。",
    beforePhoto: null,
    afterPhoto: null,
    createdAt: "2026年08月27日",
    note: "示例记录",
  },
];

function formatChineseDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}年${month}月${day}日`;
}

function splitContent(content: string) {
  const index = content.indexOf("：");
  if (index < 0) return { title: "改善措施：", body: content };
  return { title: content.slice(0, index + 1), body: content.slice(index + 1) };
}

function inferImprovementType(rawInput: string) {
  const raw = rawInput.replace(/\s+/g, "").toLowerCase();
  const rules: Array<{ type: ImprovementType; keywords: RegExp[] }> = [
    {
      type: "线体布局调整",
      keywords: [/布局/, /踏台/, /工位顺序/, /岗位(?:移动|前移|后移)/, /移动至/, /释放(?:岗位)?空间/, /通道/, /打通/, /合并踏台/],
    },
    {
      type: "LOB改善",
      keywords: [/动作分解/, /岗位分解/, /分解(?:到|至|给)/, /作业分配/, /线平衡/, /平衡率/, /瓶颈/, /定编/, /减少\d+人/, /节拍平衡/, /负荷平衡/],
    },
    {
      type: "MCP改善",
      keywords: [/设备改(?:造|善)/, /机台/, /程序优化/, /参数调整/, /传感器/, /感应器/, /机械手/, /机器人/, /气缸/, /电控/, /扫码器/, /设备故障/],
    },
    {
      type: "POU改善",
      keywords: [/pou/, /线边/, /手边/, /物料盒/, /螺钉盒/, /工装车/, /工装架/, /辅助工装/, /定置/, /就近/, /身后/, /转身(?:拿取|取料)/, /拿取/, /取料/, /寻找/, /搬运/, /物料车/, /置物盒/, /分格螺钉/],
    },
    {
      type: "品质改善",
      keywords: [/不良/, /质量/, /品质/, /检测/, /防错/, /返修/, /合格率/, /漏检/, /错装/],
    },
  ];

  const ranked = rules
    .map((rule) => ({ type: rule.type, score: rule.keywords.reduce((score, keyword) => score + (keyword.test(raw) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!raw || best.score === 0) return { type: "其他" as ImprovementType, confidence: "low" as const };
  return {
    type: best.type,
    confidence: best.score >= 2 || best.score - second.score >= 2 ? "high" as const : "medium" as const,
  };
}

function loadDraft() {
  const fallback = {
    line: "A线" as LineName,
    typeChoice: AUTO_TYPE as TypeChoice,
    raw: SAMPLE_RAW,
    content: SAMPLE_CONTENT,
    effect: SAMPLE_EFFECT,
    note: "",
    beforePhoto: null as PhotoValue,
    afterPhoto: null as PhotoValue,
    savedAt: new Date().toISOString(),
  };
  try {
    const saved = window.localStorage.getItem(DRAFT_KEY);
    return saved ? { ...fallback, ...(JSON.parse(saved) as Partial<typeof fallback>) } : fallback;
  } catch {
    return fallback;
  }
}

function formatSavedTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function localOptimize(rawInput: string, type: ImprovementType) {
  const raw = rawInput.replace(/\s+/g, " ").trim();
  if (raw.includes("上平衡块") || (raw.includes("平衡块") && raw.includes("螺钉"))) {
    return { content: SAMPLE_CONTENT, effect: SAMPLE_EFFECT };
  }

  const stMatch = raw.match(/ST(?:降低|减少|下降)?\s*(\d+(?:\.\d+)?)\s*(?:秒|s)/i);
  const balanceMatch = raw.match(/(?:平衡率|线平衡率)(?:提升|提高)?\s*(\d+(?:\.\d+)?)\s*%/);
  const headcountMatch = raw.match(/(?:减少|精简|降低)(\d+)人/);

  let title = "现场作业优化";
  if (type === "POU改善" || /工装|物料|拿取|取料|螺钉盒|置物/.test(raw)) title = "线边物料取用优化";
  if (type === "LOB改善" || /动作分解|岗位分解|平衡率|瓶颈|节拍/.test(raw)) title = "岗位动作与节拍优化";
  if (type === "线体布局调整" || /布局|踏台|工位移动|后移|前移/.test(raw)) title = "工位布局优化";
  if (type === "MCP改善" || /设备|程序|感应器|电机/.test(raw)) title = "设备作业条件优化";
  if (type === "品质改善" || /不良|品质|检测|防错/.test(raw)) title = "质量作业优化";

  const body = raw
    .replace(/^(改善前|原岗位|原来|之前)[，,:：]?\s*/u, "")
    .replace(/现在|现已|改善后/g, "")
    .replace(/，{2,}/g, "，")
    .replace(/[。；;]+$/, "")
    .slice(0, 170);

  const effects: string[] = [];
  if (stMatch) effects.push(`岗位平均ST降低${stMatch[1]}s`);
  if (balanceMatch) effects.push(`线平衡率提升${balanceMatch[1]}%`);
  if (headcountMatch) effects.push(`定编减少${headcountMatch[1]}人`);
  if (/转身|走动|搬运|拿取|取料/.test(raw)) effects.push("减少无效走动与取料动作");
  if (/疲劳|弯腰|掉线/.test(raw)) effects.push("改善员工操作舒适性与作业稳定性");
  if (effects.length === 0) effects.push("简化作业动作，提升岗位操作便利性与现场规范性");

  return {
    content: `${title}：${body}。`,
    effect: `${Array.from(new Set(effects)).join("，")}。`,
  };
}

async function optimizeWithAi(raw: string, type: ImprovementType, line: LineName) {
  const endpoint = import.meta.env.VITE_AI_ENDPOINT as string | undefined;
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw, type, line }),
    });
    if (!response.ok) throw new Error("AI服务暂时不可用");
    const payload = (await response.json()) as { content?: string; effect?: string };
    if (payload.content && payload.effect) return { content: payload.content, effect: payload.effect };
  }

  await new Promise((resolve) => window.setTimeout(resolve, 680));
  return localOptimize(raw, type);
}

function loadRecords() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as ImprovementRecord[]) : SEED_RECORDS;
  } catch {
    return SEED_RECORDS;
  }
}

function readPhoto(file: File): Promise<PhotoValue> {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("单张照片请控制在8MB以内"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error("照片读取失败"));
    reader.readAsDataURL(file);
  });
}

function PhotoSlot({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PhotoValue;
  onChange: (value: PhotoValue) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const pickFile = async (file?: File) => {
    if (!file) return;
    try {
      onChange(await readPhoto(file));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "照片读取失败");
    }
  };

  return (
    <div className="photo-slot">
      <div className="photo-slot-label">{label}</div>
      {value ? (
        <button className="photo-preview" type="button" onClick={() => uploadRef.current?.click()} aria-label={`更换${label}照片`}>
          <img src={value.dataUrl} alt={`${label}照片`} />
          <span>更换照片</span>
        </button>
      ) : (
        <div className="photo-actions">
          <button type="button" onClick={() => cameraRef.current?.click()}>
            <CameraIcon />
            <span>拍照</span>
          </button>
          <span className="photo-action-divider" />
          <button type="button" onClick={() => uploadRef.current?.click()}>
            <UploadIcon />
            <span>上传</span>
          </button>
        </div>
      )}
      <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => void pickFile(event.target.files?.[0])} />
      <input ref={uploadRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => void pickFile(event.target.files?.[0])} />
    </div>
  );
}

async function exportWorkbook(records: ImprovementRecord[], selectedLine: "全部线体" | LineName) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "改善快记";
  workbook.created = new Date();

  const exportLines = selectedLine === "全部线体" ? LINES : [selectedLine];
  for (const line of exportLines) {
    const lineRecords = records.filter((record) => record.line === line);
    if (lineRecords.length === 0) continue;
    const sheet = workbook.addWorksheet(`${line}改善清单`, { views: [{ state: "frozen", ySplit: 2 }] });
    sheet.mergeCells("A1:H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = `${line}提效改善清单`;
    titleCell.font = { name: "微软雅黑", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0070C0" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 30;

    const headers = ["序号", "改善类型", "改善内容", "改善前照片", "改善后照片", "改善效果", "改善日期", "备注"];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: "微软雅黑", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B75B7" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FF1F2937" } },
        left: { style: "thin", color: { argb: "FF1F2937" } },
        bottom: { style: "thin", color: { argb: "FF1F2937" } },
        right: { style: "thin", color: { argb: "FF1F2937" } },
      };
    });

    lineRecords.forEach((record, index) => {
      const row = sheet.addRow([index + 1, record.type, "", "", "", record.effect, record.createdAt, record.note]);
      const parts = splitContent(record.content);
      row.getCell(3).value = {
        richText: [
          { font: { name: "微软雅黑", size: 11, bold: true }, text: parts.title },
          { font: { name: "微软雅黑", size: 11 }, text: parts.body },
        ],
      };
      row.height = record.beforePhoto || record.afterPhoto ? 78 : 60;
      row.eachCell((cell, colNumber) => {
        cell.font = cell.font ?? { name: "微软雅黑", size: 11 };
        cell.alignment = { horizontal: colNumber === 3 || colNumber === 6 || colNumber === 8 ? "left" : "center", vertical: "middle", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD8DEE5" } },
          left: { style: "thin", color: { argb: "FFD8DEE5" } },
          bottom: { style: "thin", color: { argb: "FFD8DEE5" } },
          right: { style: "thin", color: { argb: "FFD8DEE5" } },
        };
      });

      [record.beforePhoto, record.afterPhoto].forEach((photo, photoIndex) => {
        if (!photo) return;
        const extension = photo.dataUrl.startsWith("data:image/png") ? "png" : "jpeg";
        const imageId = workbook.addImage({ base64: photo.dataUrl, extension });
        sheet.addImage(imageId, { tl: { col: 3 + photoIndex, row: row.number - 1 }, ext: { width: 138, height: 92 } });
      });
    });

    sheet.columns = [{ width: 8 }, { width: 16 }, { width: 46 }, { width: 24 }, { width: 24 }, { width: 38 }, { width: 18 }, { width: 22 }];
    sheet.autoFilter = { from: "A2", to: "H2" };
  }

  if (workbook.worksheets.length === 0) throw new Error("当前筛选条件下没有可导出的改善记录");
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${selectedLine === "全部线体" ? "各线体" : selectedLine}改善清单_${formatChineseDate(new Date()).replace(/[年月日]/g, "")}.xlsx`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RecordList({
  records,
  compact = false,
  onEdit,
  onDelete,
}: {
  records: ImprovementRecord[];
  compact?: boolean;
  onEdit: (record: ImprovementRecord) => void;
  onDelete: (record: ImprovementRecord) => void;
}) {
  if (records.length === 0) {
    return <div className="empty-state"><FileTextIcon /><strong>还没有改善记录</strong><span>保存第一条后会显示在这里</span></div>;
  }

  return (
    <div className={compact ? "mobile-record-list" : "desktop-record-list"}>
      {records.map((record) => {
        const parts = splitContent(record.content);
        return (
          <article className="record-row" key={record.id}>
            <div className="record-date">{record.createdAt.replace(/年|月/g, ".").replace("日", "")}</div>
            <div className="record-main">
              <div className="record-meta"><span>{record.line}</span><span>{record.type}</span></div>
              <p><strong>{parts.title}</strong>{parts.body}</p>
              <div className="record-effect">{record.effect}</div>
            </div>
            <div className="record-utilities">
              <div className="record-photos" aria-label="改善照片">
                {[record.beforePhoto, record.afterPhoto].map((photo, index) => photo ? <img key={index} src={photo.dataUrl} alt={index === 0 ? "改善前" : "改善后"} /> : <span key={index}><ImageIcon /></span>)}
              </div>
              <div className="record-actions">
                <button type="button" onClick={() => onEdit(record)} aria-label="编辑改善记录"><Pencil2Icon /><span>编辑</span></button>
                <button className="danger" type="button" onClick={() => onDelete(record)} aria-label="删除改善记录"><TrashIcon /><span>删除</span></button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DesktopDashboard({
  records,
  onEdit,
  onDelete,
}: {
  records: ImprovementRecord[];
  onEdit: (record: ImprovementRecord) => void;
  onDelete: (record: ImprovementRecord) => void;
}) {
  const [lineFilter, setLineFilter] = useState<"全部线体" | LineName>("全部线体");
  const [typeFilter, setTypeFilter] = useState<"全部类型" | ImprovementType>("全部类型");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  const visibleRecords = useMemo(() => records.filter((record) => {
    if (lineFilter !== "全部线体" && record.line !== lineFilter) return false;
    if (typeFilter !== "全部类型" && record.type !== typeFilter) return false;
    return `${record.content}${record.effect}${record.note}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [lineFilter, query, records, typeFilter]);

  const exportRecords = async () => {
    setExporting(true);
    try { await exportWorkbook(visibleRecords, lineFilter); }
    catch (error) { window.alert(error instanceof Error ? error.message : "导出失败"); }
    finally { setExporting(false); }
  };

  return (
    <section className="desktop-shell" aria-label="电脑端改善清单">
      <header className="desktop-header">
        <div><span className="desktop-eyebrow">LINE IMPROVEMENT LOG</span><h1>改善记录台账</h1><p>现场随手记录，办公室统一复核与导出</p></div>
        <button className="desktop-export" type="button" onClick={() => void exportRecords()} disabled={exporting}>{exporting ? <ReloadIcon className="spin" /> : <FileTextIcon />}{exporting ? "正在生成" : "导出Excel"}</button>
      </header>
      <div className="desktop-stats"><div><span>全部记录</span><strong>{records.length}</strong></div><div><span>当前结果</span><strong>{visibleRecords.length}</strong></div><div><span>涉及线体</span><strong>{new Set(records.map((item) => item.line)).size}</strong></div></div>
      <div className="desktop-toolbar">
        <label className="search-control"><MagnifyingGlassIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索改善内容或效果" /></label>
        <label className="select-control"><SewingPinIcon /><select value={lineFilter} onChange={(event) => setLineFilter(event.target.value as "全部线体" | LineName)}><option>全部线体</option>{LINES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="select-control"><MixerHorizontalIcon /><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "全部类型" | ImprovementType)}><option>全部类型</option>{TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="desktop-table-head"><span>日期</span><span>改善内容 / 效果</span><span>照片 / 操作</span></div>
      <RecordList records={visibleRecords} onEdit={onEdit} onDelete={onDelete} />
    </section>
  );
}

export default function Prototype() {
  const keyboard = useKeyboard();
  const [initialDraft] = useState(loadDraft);
  const [view, setView] = useState<"capture" | "records">("capture");
  const [line, setLine] = useState<LineName>(initialDraft.line);
  const [typeChoice, setTypeChoice] = useState<TypeChoice>(initialDraft.typeChoice);
  const [raw, setRaw] = useState(initialDraft.raw);
  const [content, setContent] = useState(initialDraft.content);
  const [effect, setEffect] = useState(initialDraft.effect);
  const [note, setNote] = useState(initialDraft.note);
  const [beforePhoto, setBeforePhoto] = useState<PhotoValue>(initialDraft.beforePhoto);
  const [afterPhoto, setAfterPhoto] = useState<PhotoValue>(initialDraft.afterPhoto);
  const [records, setRecords] = useState<ImprovementRecord[]>(loadRecords);
  const [optimizing, setOptimizing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastSavedType, setLastSavedType] = useState<ImprovementType>("POU改善");
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState(initialDraft.savedAt);
  const [listLine, setListLine] = useState<"全部线体" | LineName>("全部线体");
  const [exporting, setExporting] = useState(false);
  const [listening, setListening] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState("");

  const typeMatch = useMemo(() => inferImprovementType(raw), [raw]);
  const resolvedType = useMemo<ImprovementType>(() => {
    if (typeChoice === AUTO_TYPE) return typeMatch.type;
    if (typeMatch.confidence === "high" && typeMatch.type !== "其他" && typeMatch.type !== typeChoice) return typeMatch.type;
    return typeChoice;
  }, [typeChoice, typeMatch]);
  const typeWillBeCorrected = typeChoice !== AUTO_TYPE && resolvedType !== typeChoice;

  useEffect(() => { document.title = "改善快记"; }, []);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
    catch { /* 正式版使用云端照片存储；本地空间不足时保留当前会话数据。 */ }
  }, [records]);
  useEffect(() => {
    setDraftStatus("saving");
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ line, typeChoice, raw, content, effect, note, beforePhoto, afterPhoto, savedAt }));
        setLastSavedAt(savedAt);
        setDraftStatus("saved");
      } catch {
        setDraftStatus("error");
      }
    }, 420);
    return () => window.clearTimeout(timer);
  }, [afterPhoto, beforePhoto, content, effect, line, note, raw, typeChoice]);

  const optimize = async () => {
    if (!raw.trim()) { window.alert("请先填写改善过程"); return; }
    keyboard.hide();
    setOptimizing(true);
    try {
      const result = await optimizeWithAi(raw, resolvedType, line);
      setContent(result.content);
      setEffect(result.effect);
    } catch (error) { window.alert(error instanceof Error ? error.message : "整理失败，请稍后重试"); }
    finally { setOptimizing(false); }
  };

  const startVoice = () => {
    type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void; onend: () => void; start: () => void };
    type RecognitionCtor = new () => Recognition;
    const speechWindow = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) { window.alert("当前浏览器暂不支持语音识别，请使用键盘输入"); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => setRaw((current) => `${current}${event.results[0][0].transcript}`);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const beginEdit = (record: ImprovementRecord) => {
    keyboard.hide();
    setEditingId(record.id);
    setLine(record.line);
    setTypeChoice(record.type);
    setRaw(record.raw);
    setContent(record.content);
    setEffect(record.effect);
    setNote(record.note);
    setBeforePhoto(record.beforePhoto);
    setAfterPhoto(record.afterPhoto);
    setSaved(false);
    setView("capture");
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="mobile-scroll"]')?.scrollTo({ top: 0 }));
  };

  const deleteRecord = (record: ImprovementRecord) => {
    if (!window.confirm("确认删除这条改善记录？删除后无法恢复。")) return;
    setRecords((current) => current.filter((item) => item.id !== record.id));
    if (editingId === record.id) setEditingId(null);
    setToastMessage("改善记录已删除");
    window.setTimeout(() => setToastMessage(""), 2200);
  };

  const cancelEdit = () => {
    keyboard.hide();
    setEditingId(null);
    setView("records");
  };

  const save = () => {
    if (!content.trim() || !effect.trim()) { window.alert("请先完成改善内容和改善效果"); return; }
    keyboard.hide();
    const existingRecord = editingId ? records.find((record) => record.id === editingId) : undefined;
    const record: ImprovementRecord = {
      id: existingRecord?.id ?? crypto.randomUUID(),
      line,
      type: resolvedType,
      raw,
      content,
      effect,
      beforePhoto,
      afterPhoto,
      createdAt: existingRecord?.createdAt ?? formatChineseDate(new Date()),
      note,
    };
    setRecords((current) => existingRecord
      ? current.map((item) => item.id === existingRecord.id ? record : item)
      : [record, ...current]);
    const savedAt = new Date().toISOString();
    setLastSavedAt(savedAt);
    setDraftStatus("saved");
    setLastSavedType(resolvedType);
    setSaved(true);
    setToastMessage(existingRecord ? "改善记录已更新" : `改善记录已保存 · ${resolvedType}`);
    setEditingId(null);
    window.setTimeout(() => setSaved(false), 2200);
    window.setTimeout(() => setToastMessage(""), 2200);
  };

  const exportMobile = async () => {
    setExporting(true);
    try { await exportWorkbook(records, listLine); }
    catch (error) { window.alert(error instanceof Error ? error.message : "导出失败"); }
    finally { setExporting(false); }
  };

  const mobileRecords = listLine === "全部线体" ? records : records.filter((record) => record.line === listLine);

  return (
    <>
      <MobileScroll className="app-screen">
        <main className="screen-content kaizen-app" aria-label="改善快记">
          <header className="mobile-header">
            <div><span className="mobile-kicker">现场改善 · 快速记录</span><h1>{view === "capture" ? "改善快记" : "改善清单"}</h1></div>
            <button className="view-switch" type="button" onClick={() => { keyboard.hide(); setView(view === "capture" ? "records" : "capture"); }}>{view === "capture" ? <FileTextIcon /> : <PlusIcon />}{view === "capture" ? "查看" : "新建"}</button>
          </header>

          {view === "capture" ? (
            <div className="capture-flow">
              {editingId ? <div className="editing-banner"><Pencil2Icon /><strong>正在编辑已保存记录</strong><button type="button" onClick={cancelEdit}>取消编辑</button></div> : null}
              <div className={`autosave-line ${draftStatus}`}>
                {draftStatus === "saving" ? <ReloadIcon className="spin" /> : <CheckCircledIcon />}
                <strong>{draftStatus === "saving" ? "草稿保存中…" : draftStatus === "error" ? "草稿保存失败" : "草稿已保存"}</strong>
                <span>{draftStatus === "saved" ? `最近保存 ${formatSavedTime(lastSavedAt)}` : draftStatus === "error" ? "请检查存储空间" : "正在同步本机"}</span>
              </div>
              <section className="line-section">
                <label>产线 / 工段</label>
                <div className="line-chips" role="group" aria-label="选择线体">{LINES.map((item) => <button key={item} type="button" className={line === item ? "active" : ""} onClick={() => setLine(item)}>{item}</button>)}</div>
              </section>

              <div className="flow-step">
                <div className="step-track"><span>1</span><i /></div>
                <section className="step-content">
                  <div className="section-heading">
                    <div><small>现场描述</small><h2>先说清楚你改了什么</h2></div>
                    <label className="type-select">类型<select value={typeChoice} onChange={(event) => setTypeChoice(event.target.value as TypeChoice)}><option value={AUTO_TYPE}>自动匹配</option>{TYPES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDownIcon /></label>
                  </div>
                  <div className={`type-match-hint ${typeWillBeCorrected ? "corrected" : ""}`}><MagicWandIcon /><span>内容匹配：<strong>{resolvedType}</strong></span><em>{typeChoice === AUTO_TYPE ? "保存时自动使用" : typeWillBeCorrected ? "与选择不一致，保存时自动校正" : "与所选类型一致"}</em></div>
                  <div className="raw-input-wrap">
                    <KeyboardTextarea value={raw} onChange={(event) => setRaw(event.target.value)} maxLength={500} placeholder="例如：原来怎么做、现在改了什么、节省了多少时间……" />
                    <div className="input-tools"><span>{raw.length}/500</span><button type="button" className={listening ? "listening" : ""} onClick={startVoice}><SpeakerLoudIcon />{listening ? "正在听" : "语音"}</button></div>
                  </div>
                  <button className="optimize-button" type="button" onClick={() => void optimize()} disabled={optimizing}>{optimizing ? <ReloadIcon className="spin" /> : <MagicWandIcon />}{optimizing ? "正在整理" : HAS_ONLINE_AI ? "AI整理表述" : "智能整理表述"}</button>
                  <div className="ai-mode-note"><CheckCircledIcon />{HAS_ONLINE_AI ? "在线AI服务已连接" : "本地规则引擎 · 无需联网"}<span>{HAS_ONLINE_AI ? "由已配置模型生成" : "正式版可接入AI模型"}</span></div>
                </section>
              </div>

              <div className="flow-step">
                <div className="step-track"><span>2</span><i /></div>
                <section className="step-content result-section">
                  <div className="result-label"><span>AI整理的表述</span><em>可编辑</em><Pencil2Icon /></div>
                  <KeyboardTextarea aria-label="改善内容" className="result-textarea" value={content} onChange={(event) => setContent(event.target.value)} maxLength={500} />
                  <div className="result-label effect-label"><span>改善效果</span><em>可编辑</em><Pencil2Icon /></div>
                  <KeyboardTextarea aria-label="改善效果" className="effect-textarea" value={effect} onChange={(event) => setEffect(event.target.value)} maxLength={300} />
                </section>
              </div>

              <div className="flow-step">
                <div className="step-track"><span>3</span><i /></div>
                <section className="step-content">
                  <div className="photo-heading"><div><small>照片佐证</small><h2>补充改善前后照片</h2></div><span>可稍后补</span></div>
                  <div className="photo-grid"><PhotoSlot label="改善前" value={beforePhoto} onChange={setBeforePhoto} /><PhotoSlot label="改善后" value={afterPhoto} onChange={setAfterPhoto} /></div>
                  <label className="note-field">备注（选填）<KeyboardTextarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录负责人、补充说明等" /></label>
                </section>
              </div>

              <div className="save-zone"><button className="save-button" type="button" onClick={save}>{saved ? <CheckCircledIcon /> : editingId ? <Pencil2Icon /> : <FileTextIcon />}{saved ? "已保存" : editingId ? "保存修改" : "保存改善"}</button><span>{formatChineseDate(new Date())}</span></div>
            </div>
          ) : (
            <section className="records-screen">
              <div className="mobile-list-toolbar">
                <label>线体<select value={listLine} onChange={(event) => setListLine(event.target.value as "全部线体" | LineName)}><option>全部线体</option>{LINES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDownIcon /></label>
                <button type="button" onClick={() => void exportMobile()} disabled={exporting}>{exporting ? <ReloadIcon className="spin" /> : <FileTextIcon />}{exporting ? "生成中" : "导出"}</button>
              </div>
              <div className="mobile-list-summary"><strong>{mobileRecords.length}</strong><span>条改善记录</span></div>
              <RecordList records={mobileRecords} compact onEdit={beginEdit} onDelete={deleteRecord} />
            </section>
          )}
        </main>
      </MobileScroll>
      {toastMessage ? <div className="save-toast"><CheckCircledIcon />{toastMessage}</div> : null}
      {createPortal(<DesktopDashboard records={records} onEdit={beginEdit} onDelete={deleteRecord} />, document.body)}
    </>
  );
}
