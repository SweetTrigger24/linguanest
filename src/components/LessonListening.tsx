import { useState } from 'react'
import { normalizeAnswer } from '../lib/content'
import type { Lang } from '../lib/types'
import { Notice, Speak } from './Common'

export default function LessonListening({ transcript, lang, hasAudio }: { transcript: string; lang: Lang; hasAudio: boolean }) {
  const [text, setText] = useState(''), [checked, setChecked] = useState(false)
  return <div className="lesson-listening editor-form">
    <h3>Luyện nghe trong bài</h3>
    {!hasAudio && <Speak text={transcript} lang={lang} />}
    <label>Bạn nghe được gì?<textarea aria-label="Bạn nghe được gì?" rows={4} value={text} onChange={e => { setText(e.target.value); setChecked(false) }} /></label>
    <button type="button" className="btn-secondary" disabled={!text.trim()} onClick={() => setChecked(true)}>Đối chiếu bản chép</button>
    {checked && <Notice>{normalizeAnswer(text) === normalizeAnswer(transcript) ? 'Bản chép trùng khớp.' : 'Bản chép chưa trùng hoàn toàn; hãy nghe lại và đối chiếu transcript.'}</Notice>}
    <details><summary>Xem transcript</summary><p className="reading-passage">{transcript}</p></details>
  </div>
}
