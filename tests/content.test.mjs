import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from 'typescript'
const source=await fs.readFile(new URL('../src/lib/content.ts',import.meta.url),'utf8')
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}})
const {parseCSV,importCSV,validateQuestions,normalizeAnswer,loginIdentity}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
test('CSV handles BOM, quoted commas, escaped quotes and multiline content',()=>{
  assert.deepEqual(parseCSV('\uFEFFterm,meaning\r\n"hello, friend","say ""hi""\nagain"\r\n'),[['term','meaning'],['hello, friend','say "hi"\nagain']])
  assert.throws(()=>parseCSV('a,b\n"unclosed,b'),/chưa đóng/)
  assert.throws(()=>parseCSV('a,b\n"closed"oops,b'),/không hợp lệ/)
})
test('imports report row-level errors and preserve all three question types',()=>{
  const bad=importCSV('term,meaning\nhello,\nworld,thế giới,extra','words')
  assert.equal(bad.errors.length,2)
  const good=importCSV('kind,prompt,choices,answers,points\nchoice,Pick,A|B,0,1\nshort,Fill,,yes|yeah,2\nessay,Write,,,5','questions')
  assert.deepEqual(good.errors,[]); assert.equal(good.items.length,3)
  assert.equal(validateQuestions([{...good.items[0],answers:['3']}]).length,1)
  assert.equal(validateQuestions([],true).length,1)
})
test('internal login mapping and answer normalization',()=>{
  assert.equal(loginIdentity(' Minh.Nguyen '),'minh.nguyen@users.linguanest.invalid')
  assert.equal(loginIdentity('Old@Example.com'),'old@example.com')
  assert.equal(normalizeAnswer('  HELLO   World\n'),'hello world')
  assert.notEqual(normalizeAnswer('résumé'),normalizeAnswer('resume'))
})
