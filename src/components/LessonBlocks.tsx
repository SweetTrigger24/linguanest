import { useRef, useState } from 'react'
import type { LessonBlock } from '../lib/types'
import { blockNames, correctAnswer } from '../lib/authoring'
import { newQuestion } from '../lib/content'
import { AttachmentList, Notice, QuestionBody } from './Common'
import { MediaPicker, QuestionFields } from './AuthoringFields'

// Formatting is rendered as React text; no user HTML is executed.
export function RichText({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((s, i) => s.startsWith('**') ? <strong key={i}>{s.slice(2, -2)}</strong> : s.startsWith('*') ? <em key={i}>{s.slice(1, -1)}</em> : s)
  return <div className="rich-text">{text.split('\n').map((line, i) => line.startsWith('## ') ? <h3 key={i}>{inline(line.slice(3))}</h3> : line.startsWith('- ') ? <div className="rich-list" key={i}>• {inline(line.slice(2))}</div> : <p key={i}>{inline(line) || '\u00a0'}</p>)}</div>
}
function TextEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  function insert(before: string, after = '') { const el = ref.current!; const start = el.selectionStart, end = el.selectionEnd; onChange(value.slice(0, start) + before + (value.slice(start, end) || 'nội dung') + after + value.slice(end)); el.focus() }
  return <><div className="toolbar"><button type="button" onClick={() => insert('**', '**')}><b>Đậm</b></button><button type="button" onClick={() => insert('*', '*')}><i>Nghiêng</i></button><button type="button" onClick={() => insert('\n## ')}>Tiêu đề</button><button type="button" onClick={() => insert('\n- ')}>Danh sách</button></div><label>Nội dung bài giảng<textarea ref={ref} rows={10} value={value} onChange={e => onChange(e.target.value)} /></label><small>Các ký hiệu định dạng được hiển thị trong bản soạn; bấm Xem trước để đọc như học viên.</small></>
}
function QuickQuiz({ block }: { block: LessonBlock }) {
  const [value, setValue] = useState(''), [checked, setChecked] = useState(false)
  if (!block.question) return null
  return <><QuestionBody question={block.question} value={value} onChange={v => { setValue(v); setChecked(false) }} /><button type="button" className="btn-secondary" onClick={() => setChecked(true)}>Kiểm tra</button>{checked && <Notice>{correctAnswer(block.question, value) ? 'Chính xác!' : 'Chưa đúng hoàn toàn. Hãy thử lại.'} {block.question.explanation}</Notice>}</>
}
export function LessonContent({ blocks }: { blocks: LessonBlock[] }) {
  return <div className="lesson-content-layout"><nav className="card-box lesson-toc" aria-label="Mục lục bài học"><b>Trong bài này</b>{blocks.map((b, i) => <a key={b.id} href={`#block-${b.id}`}>{i + 1}. {b.title || blockNames[b.kind]}</a>)}</nav><div className="stack">{blocks.map(b => <section className={`card-box lesson-block block-${b.kind}`} id={`block-${b.id}`} key={b.id}><h2>{b.title || blockNames[b.kind]}</h2>{b.kind === 'quiz' ? <QuickQuiz block={b} /> : b.kind === 'table' ? <div className="table-scroll"><table><tbody>{b.body.split('\n').map((row, i) => <tr key={i}>{row.split('\t').map((cell, j) => i === 0 ? <th key={j}>{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div> : <RichText text={b.body} />}{b.translation && <p className="translation">{b.translation}</p>}<AttachmentList keys={b.media_keys || []} />{b.transcript && <details><summary>Xem transcript</summary><RichText text={b.transcript} /></details>}</section>)}</div></div>
}
export function BlockEditor({ blocks, onChange }: { blocks: LessonBlock[]; onChange: (b: LessonBlock[]) => void }) {
  const [selected, setSelected] = useState(blocks[0]?.id || ''), [kind, setKind] = useState<LessonBlock['kind']>('text')
  const index = blocks.findIndex(b => b.id === selected), b = blocks[index]
  const change = (patch: Partial<LessonBlock>) => onChange(blocks.map(x => x.id === selected ? { ...x, ...patch } : x))
  function add() { const block: LessonBlock = { id: crypto.randomUUID(), kind, title: blockNames[kind], body: kind === 'table' ? 'Dạng câu\tCông thức\tVí dụ\nKhẳng định\tS + V(s/es)\tShe reads.' : '', ...(kind === 'quiz' ? { question: newQuestion() } : {}) }; onChange([...blocks, block]); setSelected(block.id) }
  return <div className="author-layout"><aside className="author-nav"><h3>Mục lục bài học</h3>{blocks.map((x, i) => <button type="button" className={selected === x.id ? 'selected' : ''} key={x.id} onClick={() => setSelected(x.id)}>{i + 1}. {x.title || blockNames[x.kind]}</button>)}<label>Loại nội dung<select value={kind} onChange={e => setKind(e.target.value as LessonBlock['kind'])}>{Object.entries(blockNames).map(([k, title]) => <option key={k} value={k}>{title}</option>)}</select></label><button type="button" className="btn-secondary" onClick={add}>+ Thêm nội dung</button></aside><div className="editor-form">{b ? <><div className="toolbar">{[-1, 1].map(d => <button type="button" key={d} disabled={index + d < 0 || index + d >= blocks.length} onClick={() => { const next = [...blocks]; [next[index], next[index + d]] = [next[index + d], next[index]]; onChange(next) }}>{d < 0 ? '↑ Lên' : '↓ Xuống'}</button>)}<button type="button" className="danger-link" onClick={() => { if (confirm('Xóa mục này?')) { onChange(blocks.filter(x => x.id !== selected)); setSelected(blocks[index - 1]?.id || blocks[index + 1]?.id || '') } }}>Xóa mục</button></div><label>Tên mục<input value={b.title} onChange={e => change({ title: e.target.value })} /></label>
      {b.kind === 'table' ? <><div className="table-scroll"><table><tbody>{b.body.split('\n').map((row, i) => <tr key={i}>{row.split('\t').map((cell, j) => <td key={j}><input aria-label={`Hàng ${i + 1} cột ${j + 1}`} value={cell} onChange={e => { const rows = b.body.split('\n').map(r => r.split('\t')); rows[i][j] = e.target.value; change({ body: rows.map(r => r.join('\t')).join('\n') }) }} /></td>)}</tr>)}</tbody></table></div><div className="toolbar"><button type="button" onClick={() => change({ body: b.body + '\n' + b.body.split('\n')[0].split('\t').map(() => '').join('\t') })}>+ Hàng</button><button type="button" onClick={() => change({ body: b.body.split('\n').map(r => r + '\t').join('\n') })}>+ Cột</button><button type="button" onClick={() => change({ body: b.body.split('\n').slice(0, -1).join('\n') })}>Bớt hàng cuối</button><button type="button" onClick={() => change({ body: b.body.split('\n').map(r => r.split('\t').slice(0, -1).join('\t')).join('\n') })}>Bớt cột cuối</button></div></> : b.kind === 'quiz' ? <><Notice>Bài tập tự kiểm tra, có thể làm lại; không tính điểm thi. Dùng dạng tự chấm.</Notice>{b.question && <QuestionFields q={b.question} onChange={question => change({ question })} />}</> : <TextEditor value={b.body} onChange={body => change({ body })} />}
      {b.kind === 'example' && <label>Bản dịch<textarea value={b.translation || ''} onChange={e => change({ translation: e.target.value })} /></label>}
      {b.kind === 'media' && <label>Transcript<textarea value={b.transcript || ''} onChange={e => change({ transcript: e.target.value })} /></label>}
      <MediaPicker keys={b.media_keys || []} onChange={media_keys => change({ media_keys })} />
    </> : <p>Chọn một mục hoặc thêm nội dung để bắt đầu.</p>}</div></div>
}
