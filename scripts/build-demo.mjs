import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, cpSync } from 'node:fs'
import { build } from 'vite'

const compiler = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-b'], { stdio: 'inherit' })
if (compiler.status !== 0) process.exit(compiler.status || 1)
const definitions = { 'import.meta.env.VITE_PUBLIC_DEMO': JSON.stringify('true') }
for (const key of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']) {
  definitions[`import.meta.env.VITE_FIREBASE_${key}`] = JSON.stringify('')
}
// Relative assets let the same demo run at / and /financial-summary/.
await build({ mode: 'demo', base: './', define: definitions })
cpSync('deployment/404.html', 'dist/404.html')
const commit = process.env.GITHUB_SHA || spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() || 'local'
writeFileSync('dist/release.json', JSON.stringify({ app: 'FinancialSummary', mode: 'public-demo', cloudEnabled: false, commit, builtAt: new Date().toISOString() }, null, 2) + '\n')
const html = readFileSync('dist/index.html', 'utf8').replace('<html lang="zh-CN">', '<html lang="en">').replace('按月整理收入、消费、账户资产与固定支出的个人财务账本。', 'Explore a personal finance workspace using fictional sample data. No sign-in required.')
writeFileSync('dist/index.html', html)
console.log('Public demo built: fictional data, English default, Firebase disabled.')
