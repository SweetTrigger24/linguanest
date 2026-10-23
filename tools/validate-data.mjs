import fs from 'node:fs'
const source=new URL('../src/data/demo.json',import.meta.url)
const data=JSON.parse(fs.readFileSync(source,'utf8'))
const test=(condition,message)=>{if(!condition)throw new Error(message)}
const unique=(items,key)=>new Set(items.map(v=>v[key])).size===items.length
for(const key of ['courses','lessons','vocabulary','exercises'])test(unique(data[key],'id'),`Duplicated IDs in ${key}`)
const courses=new Set(data.courses.map(c=>c.id))
const lessons=new Set(data.lessons.map(l=>l.id))
for(const l of data.lessons)test(courses.has(l.course_id),`Unknown course: ${l.id}`)
for(const w of data.vocabulary)test(lessons.has(w.lesson_id),`Unknown word lesson: ${w.id}`)
for(const e of data.exercises){test(lessons.has(e.lesson_id),`Unknown exercise lesson: ${e.id}`);test(Array.isArray(e.choices)&&e.choices.length===4,`Exercise choices: ${e.id}`);test(Number.isInteger(e.answer_index)&&e.answer_index>=0&&e.answer_index<4,`Invalid answer_index: ${e.id}`)}
test(new Set(data.courses.map(c=>c.language_code)).size===4,'Expected 4 languages')
console.log('PASS: sample data integrity:',Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])))
